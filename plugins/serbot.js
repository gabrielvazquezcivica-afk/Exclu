import fs from 'fs'
import path from 'path'
import pino from 'pino'

import * as baileys from '@whiskeysockets/baileys'

const {
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    makeWASocket,
    DisconnectReason,
    fetchLatestWaWebVersion
} = baileys

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

    const phone =
        String(value)
            .replace(/\D/g, '')

    if (
        phone.length < 8 ||
        phone.length > 15
    ) {
        return null
    }

    return phone
}

function getStatusCode(error) {
    return (
        error?.output?.statusCode ??
        error?.data?.statusCode ??
        error?.statusCode ??
        error?.output?.payload?.statusCode
    )
}

handler.run = async (
    conn,
    m,
    args
) => {
    const isMainBot =
        conn?.isMainBot === true ||
        conn === global.conn

    if (!isMainBot) {
        return
    }

    if (
        !args ||
        !args.length
    ) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    '❌ Debes escribir el número que quieres vincular.\n\nEjemplos:\n\n.code +52 12 3456 7890\n.code 521234567890\n.code +52-12-3456-7890'
            },
            {
                quoted: m
            }
        )

        return
    }

    const input =
        args.join(' ')

    const phone =
        normalizePhone(input)

    if (!phone) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    '❌ El número no es válido.\n\nPuedes escribirlo con +, espacios, guiones o completamente limpio.'
            },
            {
                quoted: m
            }
        )

        return
    }

    console.log(
        `[CODE] Número solicitado: +${phone}`
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

    global.conns =
        global.conns || []

    const connected =
        global.conns.find(
            socket => {
                if (
                    !socket?.isSubBot
                ) {
                    return false
                }

                const number =
                    normalizePhone(
                        socket.subBotNumber ||
                        socket.subBotJid ||
                        socket.user?.id
                    )

                return number === phone
            }
        )

    if (connected) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    `🟢 El número +${phone} ya está conectado como SubBot.`
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
                    `📁 Ya existe una sesión guardada para +${phone}.\n\nSi quieres volver a vincularlo, elimina primero la carpeta:\n\nsessions/subbots/${phone}`
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
        console.log(
            `[CODE] Preparando sesión para +${phone}...`
        )

        const {
            state,
            saveCreds
        } =
            await useMultiFileAuthState(
                sessionPath
            )

        let version

        if (
            typeof fetchLatestWaWebVersion ===
            'function'
        ) {
            console.log(
                '[CODE] Obteniendo versión actual de WhatsApp Web...'
            )

            const result =
                await fetchLatestWaWebVersion()

            version =
                result?.version

            console.log(
                `[CODE] WhatsApp Web: ${version?.join('.') || 'desconocida'}`
            )
        } else {
            console.log(
                '[CODE] fetchLatestWaWebVersion no está disponible. Usando versión de respaldo.'
            )

            version = [
                2,
                3000,
                1042466098
            ]
        }

        if (
            !Array.isArray(version) ||
            version.length !== 3
        ) {
            throw new Error(
                'No se pudo obtener una versión válida de WhatsApp Web.'
            )
        }

        console.log(
            '[CODE] Creando socket...'
        )

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
                    'Chrome',
                    'Chrome',
                    '120.0.0.0'
                ],

                version,

                printQRInTerminal:
                    false,

                markOnlineOnConnect:
                    true,

                generateHighQualityLinkPreview:
                    true,

                connectTimeoutMs:
                    60000,

                defaultQueryTimeoutMs:
                    60000
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

        if (
            !global.conns.includes(
                socket
            )
        ) {
            global.conns.push(
                socket
            )
        }

        console.log(
            '[CODE] Socket creado correctamente.'
        )

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
            console.log(
                `[CODE] Solicitando pairing code para +${phone}...`
            )

            let code

            try {
                code =
                    await socket.requestPairingCode(
                        phone
                    )
            } catch (error) {
                const statusCode =
                    getStatusCode(error)

                console.error(
                    '[CODE] Error en requestPairingCode:'
                )

                console.error(
                    error?.stack ||
                    error
                )

                console.error(
                    `[CODE] StatusCode: ${statusCode ?? 'desconocido'}`
                )

                throw error
            }

            code =
                code
                    ?.match(
                        /.{1,4}/g
                    )
                    ?.join('-') ||
                code

            console.log(
                `[CODE] Código generado para +${phone}: ${code}`
            )

            await conn.sendMessage(
                m.chat,
                {
                    image: {
                        url:
                            PAIRING_IMAGE
                    },
                    caption:
                        `🔐 *CÓDIGO DE VINCULACIÓN*\n\n📱 Número: +${phone}\n\nAbre WhatsApp en el número que vas a vincular y entra a:\n\n*Dispositivos vinculados → Vincular con número de teléfono*\n\n👇 *Tu código es:*`
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
        } else {
            console.log(
                `[CODE] La sesión +${phone} ya estaba registrada.`
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
                    getStatusCode(
                        lastDisconnect?.error
                    )

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
        const statusCode =
            getStatusCode(error)

        console.error(
            `[SUBBOT] Error iniciando +${phone}:`,
            error?.message ||
            error
        )

        console.error(
            `[SUBBOT] Código HTTP/estado: ${statusCode ?? 'desconocido'}`
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
                        `❌ No se pudo generar el código para +${phone}.\n\nEstado: ${statusCode ?? 'desconocido'}`
                },
                {
                    quoted: m
                }
            )
        } catch {}
    }
}

export default handler