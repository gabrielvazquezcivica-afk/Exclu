import fs from 'fs'
import path from 'path'
import pino from 'pino'

import {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeWASocket,
    DisconnectReason
} from '@whiskeysockets/baileys'

const SUBBOTS_DIR = path.join(
    process.cwd(),
    'sessions',
    'subbots'
)

const PAIRING_IMAGE =
    'https://files.catbox.moe/n80w1o.jpg'

let handler = {}

handler.command = [
    'code'
]

function normalizePhone(value) {
    if (!value) {
        return null
    }

    if (
        typeof value === 'object'
    ) {
        value =
            value.jid ||
            value.id ||
            value.phoneNumber ||
            value.phone ||
            value.user ||
            value.pn
    }

    if (!value) {
        return null
    }

    const text =
        String(value).trim()

    if (
        text.endsWith('@lid')
    ) {
        return null
    }

    const phone =
        text
            .split('@')[0]
            .split(':')[0]
            .replace(/\D/g, '')

    if (
        phone.length < 8 ||
        phone.length > 15
    ) {
        return null
    }

    return phone
}

function normalizeJid(value) {
    if (!value) {
        return null
    }

    if (
        typeof value === 'object'
    ) {
        value =
            value.jid ||
            value.id ||
            value.lid ||
            value.pn ||
            value.phoneNumber ||
            value.phone
    }

    if (!value) {
        return null
    }

    return String(value).trim()
}

function getLid(m) {
    const candidates = [
        m?.key?.participant,
        m?.key?.senderPn,
        m?.key?.participantPn,
        m?.key?.remoteJid,
        m?.participant,
        m?.sender
    ]

    for (
        const value of candidates
    ) {
        const jid =
            normalizeJid(value)

        if (
            jid?.endsWith('@lid')
        ) {
            return jid
        }
    }

    return null
}

function getDirectPhoneCandidates(m) {
    return [
        m?.key?.participantAlt,
        m?.key?.remoteJidAlt,
        m?.key?.senderPn,
        m?.key?.participantPn,
        m?.key?.participantPhone,
        m?.key?.senderPhone,
        m?.participantAlt,
        m?.participantPn,
        m?.senderPn,
        m?.senderPn?.jid,
        m?.senderPn?.user,
        m?.senderPhone,
        m?.participantPhone
    ]
}

async function getPhoneFromLid(
    conn,
    m
) {
    const lid =
        getLid(m)

    if (!lid) {
        return null
    }

    console.log(
        `[CODE] Intentando resolver LID: ${lid}`
    )

    const directCandidates =
        getDirectPhoneCandidates(m)

    for (
        const value of directCandidates
    ) {
        const phone =
            normalizePhone(value)

        if (phone) {
            console.log(
                `[CODE] Número encontrado directamente: +${phone}`
            )

            return phone
        }
    }

    try {
        const mapping =
            conn
                ?.signalRepository
                ?.lidMapping

        if (
            mapping &&
            typeof mapping.getPNForLID ===
            'function'
        ) {
            const result =
                await mapping.getPNForLID(
                    lid
                )

            const phone =
                normalizePhone(result)

            if (phone) {
                console.log(
                    `[CODE] Número encontrado mediante lidMapping: +${phone}`
                )

                return phone
            }
        }
    } catch (error) {
        console.log(
            `[CODE] Error en lidMapping: ${error?.message || error}`
        )
    }

    if (
        m?.chat?.endsWith('@g.us')
    ) {
        try {
            console.log(
                `[CODE] Buscando LID en metadatos del grupo: ${m.chat}`
            )

            const metadata =
                await conn.groupMetadata(
                    m.chat
                )

            const participants =
                metadata?.participants ||
                []

            for (
                const participant of participants
            ) {
                const ids = [
                    participant?.id,
                    participant?.jid,
                    participant?.lid,
                    participant?.participant,
                    participant?.participantPn,
                    participant?.phoneNumber,
                    participant?.phone
                ]

                const matches =
                    ids.some(
                        value => {
                            const jid =
                                normalizeJid(
                                    value
                                )

                            return (
                                jid === lid ||
                                jid?.split('@')[0] ===
                                    lid.split('@')[0]
                            )
                        }
                    )

                if (!matches) {
                    continue
                }

                const phoneCandidates = [
                    participant?.phoneNumber,
                    participant?.phone,
                    participant?.participantPn,
                    participant?.jid,
                    participant?.id
                ]

                for (
                    const value of phoneCandidates
                ) {
                    const phone =
                        normalizePhone(value)

                    if (phone) {
                        console.log(
                            `[CODE] Número encontrado en metadatos del grupo: +${phone}`
                        )

                        return phone
                    }
                }
            }
        } catch (error) {
            console.log(
                `[CODE] Error consultando grupo: ${error?.message || error}`
            )
        }
    }

    try {
        const mapping =
            conn
                ?.signalRepository
                ?.lidMapping

        if (
            mapping &&
            typeof mapping.getLIDForPN ===
            'function'
        ) {
            console.log(
                '[CODE] El mapeo LID todavía no existe. Se revisarán los mapeos disponibles.'
            )
        }
    } catch {}

    return null
}

handler.run = async (
    conn,
    m
) => {
    const isMainBot =
        conn?.isMainBot === true ||
        conn === global.conn

    if (!isMainBot) {
        return
    }

    let phone = null

    const directCandidates = [
        m?.key?.participantAlt,
        m?.key?.remoteJidAlt,
        m?.key?.senderPn,
        m?.key?.participantPn,
        m?.key?.participantPhone,
        m?.key?.senderPhone,
        m?.participantAlt,
        m?.participantPn,
        m?.senderPn,
        m?.senderPn?.jid,
        m?.senderPn?.user
    ]

    for (
        const value of directCandidates
    ) {
        const result =
            normalizePhone(value)

        if (result) {
            phone = result
            break
        }
    }

    if (!phone) {
        phone =
            await getPhoneFromLid(
                conn,
                m
            )
    }

    if (!phone) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    '❌ No pude obtener el número telefónico asociado a tu cuenta de WhatsApp.\n\nWhatsApp solamente proporcionó el identificador LID y Baileys todavía no tiene un mapeo LID → número para este usuario.'
            },
            {
                quoted: m
            }
        )

        return
    }

    console.log(
        `[CODE] Número final para vincular: +${phone}`
    )

    if (
        !fs.existsSync(
            SUBBOTS_DIR
        )
    ) {
        fs.mkdirSync(
            SUBBOTS_DIR,
            {
                recursive: true
            }
        )
    }

    const sessionPath =
        path.join(
            SUBBOTS_DIR,
            phone
        )

    const credsPath =
        path.join(
            sessionPath,
            'creds.json'
        )

    const connected =
        global.conns?.find(
            socket => {
                if (
                    !socket?.isSubBot
                ) {
                    return false
                }

                const number =
                    normalizePhone(
                        socket.subBotJid ||
                        socket.user?.id ||
                        socket.subBotNumber
                    )

                return number === phone
            }
        )

    if (connected) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    `🟢 Tu número +${phone} ya está conectado como SubBot.`
            },
            {
                quoted: m
            }
        )

        return
    }

    if (
        fs.existsSync(
            credsPath
        )
    ) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    `📁 Ya existe una sesión guardada para +${phone}.\n\nElimina esa sesión antes de volver a vincularla.`
            },
            {
                quoted: m
            }
        )

        return
    }

    fs.mkdirSync(
        sessionPath,
        {
            recursive: true
        }
    )

    let socket = null

    try {
        const {
            state,
            saveCreds
        } =
            await useMultiFileAuthState(
                sessionPath
            )

        const {
            version
        } =
            await fetchLatestBaileysVersion()

        socket =
            makeWASocket({
                auth: {
                    creds:
                        state.creds,

                    keys:
                        makeCacheableSignalKeyStore(
                            state.keys,
                            pino({
                                level:
                                    'silent'
                            })
                        )
                },

                logger:
                    pino({
                        level:
                            'silent'
                    }),

                browser: [
                    'Exclusive Bot',
                    'Chrome',
                    '1.0.0'
                ],

                version,

                printQRInTerminal:
                    false,

                markOnlineOnConnect:
                    true,

                generateHighQualityLinkPreview:
                    true
            })

        socket.isSubBot =
            true

        socket.isMainBot =
            false

        socket.isInit =
            false

        socket.subBotJid =
            `${phone}@s.whatsapp.net`

        socket.subBotNumber =
            phone

        socket.sessionPath =
            sessionPath

        socket.startTime =
            Date.now()

        socket.ev.on(
            'creds.update',
            saveCreds
        )

        socket.ev.on(
            'lid-mapping.update',
            update => {
                try {
                    if (!update) {
                        return
                    }

                    const lid =
                        update.lid

                    const pn =
                        update.pn

                    if (
                        lid &&
                        pn
                    ) {
                        console.log(
                            `[LID] Mapeo recibido: ${lid} -> ${pn}`
                        )
                    }
                } catch {}
            }
        )

        global.conns =
            global.conns || []

        if (
            !global.conns.includes(
                socket
            )
        ) {
            global.conns.push(
                socket
            )
        }

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1500
                )
        )

        if (
            !state.creds.registered
        ) {
            let code =
                await socket.requestPairingCode(
                    phone
                )

            code =
                code
                    ?.match(
                        /.{1,4}/g
                    )
                    ?.join('-') ||
                code

            await conn.sendMessage(
                m.chat,
                {
                    image: {
                        url:
                            PAIRING_IMAGE
                    },
                    caption:
                        `🔐 *Código de vinculación*\n\n📱 Número: +${phone}\n\nAbre WhatsApp en el número que vas a vincular y entra a:\n\n*Dispositivos vinculados → Vincular con número de teléfono*\n\n👇 *Tu código es:*`
                },
                {
                    quoted: m
                }
            )

            await conn.sendMessage(
                m.chat,
                {
                    text:
                        String(code)
                },
                {
                    quoted: m
                }
            )
        }

        socket.ev.on(
            'connection.update',
            async update => {
                const {
                    connection,
                    lastDisconnect
                } = update

                if (
                    connection ===
                    'open'
                ) {
                    socket.isInit =
                        true

                    console.log(
                        `[SUBBOT] +${phone} conectado correctamente.`
                    )

                    return
                }

                if (
                    connection !==
                    'close'
                ) {
                    return
                }

                socket.isInit =
                    false

                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode ??
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.payload
                        ?.statusCode

                const index =
                    global.conns.indexOf(
                        socket
                    )

                if (
                    index !== -1
                ) {
                    global.conns.splice(
                        index,
                        1
                    )
                }

                if (
                    statusCode ===
                        DisconnectReason.loggedOut ||
                    statusCode ===
                        DisconnectReason.badSession ||
                    statusCode === 401 ||
                    statusCode === 403 ||
                    statusCode === 405
                ) {
                    try {
                        fs.rmSync(
                            sessionPath,
                            {
                                recursive:
                                    true,
                                force:
                                    true
                            }
                        )
                    } catch {}

                    console.log(
                        `[SUBBOT] Sesión eliminada: +${phone}`
                    )

                    return
                }

                console.log(
                    `[SUBBOT] Conexión cerrada: +${phone} | Código: ${statusCode ?? 'desconocido'}`
                )
            }
        )
    } catch (error) {
        console.error(
            `[SUBBOT] Error iniciando +${phone}:`,
            error?.message ||
            error
        )

        if (socket) {
            const index =
                global.conns.indexOf(
                    socket
                )

            if (
                index !== -1
            ) {
                global.conns.splice(
                    index,
                    1
                )
            }

            try {
                socket.ws?.close()
            } catch {}
        }

        try {
            fs.rmSync(
                sessionPath,
                {
                    recursive:
                        true,
                    force:
                        true
                }
            )
        } catch {}

        try {
            await conn.sendMessage(
                m.chat,
                {
                    text:
                        `❌ No se pudo generar el código de vinculación para +${phone}.`
                },
                {
                    quoted: m
                }
            )
        } catch {}
    }
}

export default handler