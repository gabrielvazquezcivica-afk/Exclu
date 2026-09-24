import fs from 'fs'
import path from 'path'
import pino from 'pino'

import {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeWASocket
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
    'serbot',
    'code'
]

handler.run = async (
    conn,
    m,
    args,
    extra
) => {

    // Este comando solamente puede ejecutarse desde el bot principal

    const isMainBot =
        conn?.isMainBot === true ||
        conn === global.conn

    if (!isMainBot) {
        return
    }

    const command =
        String(
            extra?.command || ''
        ).toLowerCase()

    // Tanto .code como .serbot utilizan código de vinculación

    const useCode =
        command === 'code' ||
        command === 'serbot'

    if (!useCode) {
        return
    }

    // Buscar el número indicado en el comando

    let phone =
        args.find(
            arg =>
                /^\+?\d{8,15}$/.test(
                    String(arg)
                )
        )

    // Si no se indicó número, utilizar el número del usuario

    if (!phone) {
        phone =
            m.sender
                ?.split('@')[0]
                ?.replace(/\D/g, '')
    }

    phone =
        String(
            phone || ''
        ).replace(
            /\D/g,
            ''
        )

    if (!phone) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    '📱 No se pudo obtener un número válido.\n\nEjemplo:\n.code 521XXXXXXXXXX'
            },
            {
                quoted: m
            }
        )

        return
    }

    // Crear carpeta de SubBots

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

    // Ruta de la sesión

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

    // Comprobar si ya existe un SubBot conectado

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
                        .replace(/\D/g, '')

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

    // Comprobar si ya existe una sesión guardada

    if (
        fs.existsSync(
            credsPath
        )
    ) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    `📁 Ya existe una sesión guardada para +${phone}.\n\nElimina la sesión antes de volver a vincular este número.`
            },
            {
                quoted: m
            }
        )

        return
    }

    // Crear carpeta de sesión

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

        // Crear conexión del SubBot

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

        socket.connectionStartTime =
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

        // Esperar un momento antes de solicitar el código

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    1500
                )
        )

        // Generar código solamente si la cuenta todavía no está vinculada

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

            // Enviar la imagen al mismo chat donde se ejecutó .code

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

            // Enviar solamente el código al grupo/chat

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

        // Escuchar cambios de conexión

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

                // Quitar socket de las conexiones activas

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

                // Eliminar sesiones cerradas definitivamente

                if (
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

        // Quitar socket de la lista

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

        // Eliminar sesión incompleta

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

        // Avisar solamente en el chat

        try {
            await conn.sendMessage(
                m.chat,
                {
                    text:
                        `❌ No se pudo generar el código para +${phone}.`
                },
                {
                    quoted: m
                }
            )
        } catch {}
    }
}

export default handler