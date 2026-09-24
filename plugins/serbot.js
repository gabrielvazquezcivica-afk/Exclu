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

function getPhoneFromMessage(m) {

    const candidates = [
        m?.key?.participantAlt,
        m?.participantAlt,
        m?.key?.senderPn,
        m?.senderPn,
        m?.key?.participant,
        m?.sender
    ]

    for (
        const value of candidates
    ) {

        if (!value) continue

        const raw =
            String(value)

        const number =
            raw
                .split('@')[0]
                .split(':')[0]
                .replace(/\D/g, '')

        if (
            number.length >= 8 &&
            number.length <= 15
        ) {
            return number
        }
    }

    return null
}

function normalizePhone(phone) {

    if (!phone) return null

    const number =
        String(phone)
            .replace(/\D/g, '')

    if (
        number.length < 8 ||
        number.length > 15
    ) {
        return null
    }

    return number
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

    // Obtener automáticamente el número del usuario.

console.log('[CODE] key:', m?.key)
console.log('[CODE] sender:', m?.sender)
console.log('[CODE] participant:', m?.participant)
console.log('[CODE] participantAlt:', m?.key?.participantAlt)
console.log('[CODE] senderPn:', m?.key?.senderPn)

    let phone =
        getPhoneFromMessage(m)

    phone =
        normalizePhone(phone)

    if (!phone) {

        await conn.sendMessage(
            m.chat,
            {
                text:
                    '❌ No se pudo obtener tu número de WhatsApp.'
            },
            {
                quoted: m
            }
        )

        return
    }

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

                const number =
                    String(
                        socket.subBotJid ||
                        socket.user?.id ||
                        ''
                    )
                        .split('@')[0]
                        .split(':')[0]
                        .replace(/\D/g, '')

                return (
                    number === phone
                )
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

        // Esperar antes de solicitar el código.

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

            // El código solamente se envía al chat.

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

    } catch (error) {

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