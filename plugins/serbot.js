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

function getLid(m) {

    const jid =
        m?.key?.participant ||
        m?.participant ||
        m?.sender

    if (
        typeof jid !== 'string'
    ) {
        return null
    }

    if (
        !jid.endsWith('@lid')
    ) {
        return null
    }

    return jid
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

    try {

        const mapping =
            conn?.signalRepository
                ?.lidMapping

        if (
            mapping &&
            typeof mapping.getPNForLID ===
            'function'
        ) {

            const pn =
                await mapping.getPNForLID(
                    lid
                )

            if (
                pn &&
                typeof pn === 'string' &&
                pn.endsWith(
                    '@s.whatsapp.net'
                )
            ) {

                return pn
            }
        }

    } catch (
        error
    ) {

        console.log(
            `[CODE] Error resolviendo LID: ${error?.message || error}`
        )
    }

    return null
}

function normalizePhone(
    jid
) {

    if (
        !jid
    ) {
        return null
    }

    const phone =
        String(jid)
            .split('@')[0]
            .split(':')[0]
            .replace(
                /\D/g,
                ''
            )

    if (
        phone.length < 8 ||
        phone.length > 15
    ) {
        return null
    }

    return phone
}

let handler = {}

handler.command = [
    'code'
]

handler.run = async (
    conn,
    m
) => {

    // Solo el bot principal puede generar códigos.

    const isMainBot =
        conn?.isMainBot === true ||
        conn === global.conn

    if (!isMainBot) {
        return
    }

    let phoneJid = null

    // Si el mensaje trae un PN directamente,
    // utilizarlo.

    const directSender =
        m?.key?.participant ||
        m?.participant ||
        m?.sender

    if (
        typeof directSender === 'string' &&
        directSender.endsWith(
            '@s.whatsapp.net'
        )
    ) {

        phoneJid =
            directSender
    }

    // Si viene como LID, resolverlo mediante
    // el mapeo interno de Baileys.

    if (
        !phoneJid
    ) {

        phoneJid =
            await getPhoneFromLid(
                conn,
                m
            )
    }

    const phone =
        normalizePhone(
            phoneJid
        )

    if (!phone) {

        await conn.sendMessage(
            m.chat,
            {
                text:
                    '❌ No pude obtener el número telefónico asociado a tu cuenta de WhatsApp.\n\nWhatsApp está enviando únicamente tu identificador LID y Baileys todavía no tiene disponible su número telefónico.'
            },
            {
                quoted: m
            }
        )

        return
    }

    console.log(
        `[CODE] Número resuelto: +${phone}`
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

    // Comprobar si ya existe un SubBot conectado.

    const connected =
        global.conns?.find(
            socket => {

                if (
                    !socket?.isSubBot
                ) {
                    return false
                }

                const jid =
                    socket.subBotJid ||
                    socket.user?.id ||
                    ''

                const number =
                    normalizePhone(
                        jid
                    )

                return (
                    number === phone
                )
            }
        )

    if (
        connected
    ) {

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

    // Comprobar si ya existe una sesión guardada.

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

        socket.sessionPath =
            sessionPath

        socket.startTime =
            Date.now()

        socket.ev.on(
            'creds.update',
            saveCreds
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

        // Esperar a que Baileys prepare la conexión.

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    3000
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
                    statusCode ===
                        401 ||
                    statusCode ===
                        403 ||
                    statusCode ===
                        405
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

    } catch (
        error
    ) {

        console.error(
            `[SUBBOT] Error iniciando +${phone}:`,
            error?.message ||
            error
        )

        if (
            socket
        ) {

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

            if (
                !fs.existsSync(
                    credsPath
                )
            ) {

                fs.rmSync(
                    sessionPath,
                    {
                        recursive:
                            true,
                        force:
                            true
                    }
                )
            }

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