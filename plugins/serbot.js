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

async function getVersion() {
    if (
        typeof fetchLatestWaWebVersion ===
        'function'
    ) {
        try {
            const result =
                await fetchLatestWaWebVersion()

            if (
                Array.isArray(
                    result?.version
                )
            ) {
                return result.version
            }
        } catch {}
    }

    return [
        2,
        3000,
        1048361770
    ]
}

function createSocket(
    state,
    version
) {
    return makeWASocket({
        version,

        logger:
            pino({
                level:
                    'silent'
            }),

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

        browser: [
            'Chrome',
            'Chrome',
            '120.0.0.0'
        ],

        printQRInTerminal:
            false,

        markOnlineOnConnect:
            true,

        syncFullHistory:
            false,

        connectTimeoutMs:
            60000,

        defaultQueryTimeoutMs:
            60000
    })
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
                quoted:
                    m
            }
        )

        return
    }

    const phone =
        normalizePhone(
            args.join(' ')
        )

    if (!phone) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    '❌ El número no es válido.\n\nPuedes escribirlo con +, espacios, guiones o completamente limpio.'
            },
            {
                quoted:
                    m
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
                recursive:
                    true
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

    const existing =
        global.conns.find(
            socket =>
                socket?.subBotNumber ===
                phone
        )

    if (existing) {
        await conn.sendMessage(
            m.chat,
            {
                text:
                    `🟢 El número +${phone} ya está conectado como SubBot.`
            },
            {
                quoted:
                    m
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
                    `📁 Ya existe una sesión guardada para +${phone}.\n\nSi quieres volver a vincularla, elimina primero:\n\nsessions/subbots/${phone}`
            },
            {
                quoted:
                    m
            }
        )

        return
    }

    fs.mkdirSync(
        sessionPath,
        {
            recursive:
                true
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

        const version =
            await getVersion()

        console.log(
            `[CODE] WhatsApp Web: ${version.join('.')}`
        )

        console.log(
            '[CODE] Creando socket...'
        )

        socket =
            createSocket(
                state,
                version
            )

        socket.isSubBot =
            true

        socket.isMainBot =
            false

        socket.subBotNumber =
            phone

        socket.subBotJid =
            `${phone}@s.whatsapp.net`

        socket.sessionPath =
            sessionPath

        global.conns.push(
            socket
        )

        socket.ev.on(
            'creds.update',
            saveCreds
        )

        console.log(
            '[CODE] Socket creado correctamente.'
        )

        socket.ev.on(
            'connection.update',
            async update => {
                const {
                    connection,
                    lastDisconnect
                } = update

                if (
                    connection !==
                    'close'
                ) {
                    return
                }

                const statusCode =
                    getStatusCode(
                        lastDisconnect?.error
                    )

                if (
                    statusCode !==
                    DisconnectReason.restartRequired
                ) {
                    return
                }

                console.log(
                    `[SUBBOT] +${phone} recibió 515.`
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

                try {
                    socket.end(
                        undefined
                    )
                } catch {}

                try {
                    socket.ws?.close()
                } catch {}

                console.log(
                    `[SUBBOT] +${phone} pairing terminado. Entregando sesión a resetsb...`
                )

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            2000
                        )
                )

                try {
                    const {
                        startSubBot
                    } =
                        await import(
                            '../lib/resetsb.js'
                        )

                    await startSubBot(
                        phone
                    )
                } catch (error) {
                    console.error(
                        `[SUBBOT] Error iniciando sesión definitiva +${phone}:`,
                        error?.message ||
                        error
                    )
                }
            }
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
                console.error(
                    '[CODE] Error solicitando código:',
                    error?.message ||
                    error
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
                    text:
                        `🔐 *CÓDIGO DE VINCULACIÓN*\n\n📱 Número: +${phone}\n\nAbre WhatsApp en el número que vas a vincular y entra a:\n\n*Dispositivos vinculados → Vincular con número de teléfono*\n\n👇 *Tu código es:*\n\n*${code}*`
                },
                {
                    quoted:
                        m
                }
            )
        }
    } catch (error) {
        const statusCode =
            getStatusCode(
                error
            )

        console.error(
            `[SUBBOT] Error iniciando +${phone}:`,
            error?.message ||
            error
        )

        console.error(
            `[SUBBOT] Estado: ${statusCode ?? 'desconocido'}`
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
                socket.end(
                    undefined
                )
            } catch {}

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
                        `❌ No se pudo iniciar la vinculación para +${phone}.`
                },
                {
                    quoted:
                        m
                }
            )
        } catch {}
    }
}

export default handler