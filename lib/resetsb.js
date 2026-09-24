import {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    Browsers,
    makeWASocket
} from '@whiskeysockets/baileys'

import fs from 'fs'
import path from 'path'
import pino from 'pino'

const SUBBOTS_DIR = path.join(
    process.cwd(),
    'sessions',
    'subbots'
)

global.conns = global.conns || []

if (!fs.existsSync(SUBBOTS_DIR)) {
    fs.mkdirSync(
        SUBBOTS_DIR,
        {
            recursive: true
        }
    )
}

// Obtener la carpeta de sesión

function getSubBotPath(jid) {
    const number =
        String(jid)
            .split('@')[0]
            .replace(/\D/g, '')

    return path.join(
        SUBBOTS_DIR,
        number
    )
}

// Eliminar socket de la lista

function removeConnection(socket) {
    const index =
        global.conns.indexOf(socket)

    if (index !== -1) {
        global.conns.splice(
            index,
            1
        )
    }
}

// Eliminar sesión

function deleteSession(jid) {
    const sessionPath =
        getSubBotPath(jid)

    try {
        if (
            fs.existsSync(sessionPath)
        ) {
            fs.rmSync(
                sessionPath,
                {
                    recursive: true,
                    force: true
                }
            )
        }
    } catch (error) {
        console.error(
            '[SUBBOT] Error eliminando sesión:',
            error.message
        )
    }
}

// Comprobar sesiones guardadas

export async function startSub() {
    if (
        !fs.existsSync(
            SUBBOTS_DIR
        )
    ) {
        return
    }

    const folders =
        fs.readdirSync(
            SUBBOTS_DIR
        )

    let connected = 0

    for (
        const folder of folders
    ) {
        const folderPath =
            path.join(
                SUBBOTS_DIR,
                folder
            )

        try {
            if (
                !fs.statSync(
                    folderPath
                ).isDirectory()
            ) {
                continue
            }
        } catch {
            continue
        }

        const result =
            await startSubBotIfValid(
                folder
            )

        if (result) {
            connected++
        }
    }

    console.log(
        `[SUBBOT] Se reconectaron ${connected} de ${folders.length} sesión(es).`
    )
}

// Comprobar si una sesión es válida

async function startSubBotIfValid(
    subBotDir
) {
    const sessionPath =
        path.join(
            SUBBOTS_DIR,
            subBotDir
        )

    const credsPath =
        path.join(
            sessionPath,
            'creds.json'
        )

    if (
        !fs.existsSync(
            credsPath
        )
    ) {
        return false
    }

    try {
        const creds =
            JSON.parse(
                fs.readFileSync(
                    credsPath,
                    'utf8'
                )
            )

        if (
            !creds ||
            !creds.noiseKey
        ) {
            fs.rmSync(
                sessionPath,
                {
                    recursive: true,
                    force: true
                }
            )

            return false
        }

        await startSubBot(
            subBotDir
        )

        return true

    } catch (error) {
        console.error(
            `[SUBBOT] Sesión inválida ${subBotDir}:`,
            error.message
        )

        try {
            fs.rmSync(
                sessionPath,
                {
                    recursive: true,
                    force: true
                }
            )
        } catch {}

        return false
    }
}

// Iniciar un subbot

async function startSubBot(
    subBotDir
) {
    const subBotPath =
        path.join(
            SUBBOTS_DIR,
            subBotDir
        )

    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            subBotPath
        )

    const {
        version
    } =
        await fetchLatestBaileysVersion()

    const socket =
        makeWASocket({
            auth: {
                creds: state.creds,
                keys:
                    makeCacheableSignalKeyStore(
                        state.keys,
                        pino({
                            level: 'silent'
                        })
                    )
            },

            logger:
                pino({
                    level: 'silent'
                }),

            browser:
                Browsers.macOS(
                    'Desktop'
                ),

            version,

            printQRInTerminal:
                false,

            markOnlineOnConnect:
                true,

            generateHighQualityLinkPreview:
                true
        })

    const jid =
        `${subBotDir}@s.whatsapp.net`

    socket.isSubBot = true
    socket.isInit = false
    socket.subBotJid = jid
    socket.sessionPath =
        subBotPath
    socket.uptime =
        Date.now()

    socket.ev.on(
        'creds.update',
        saveCreds
    )

    socket.ev.on(
        'connection.update',
        async update => {
            await handleConnectionUpdate(
                socket,
                update,
                subBotDir
            )
        }
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

    return socket
}

// Manejar conexión

async function handleConnectionUpdate(
    socket,
    update,
    subBotDir
) {
    const {
        connection,
        lastDisconnect,
        isNewLogin
    } = update

    if (isNewLogin) {
        socket.isInit = false
    }

    if (
        connection === 'open'
    ) {
        socket.isInit = true
        socket.uptime =
            Date.now()

        console.log(
            `[SUBBOT] Conectado: +${subBotDir}`
        )

        return
    }

    if (
        connection !== 'close'
    ) {
        return
    }

    socket.isInit = false

    const statusCode =
        lastDisconnect?.error?.output?.statusCode ??
        lastDisconnect?.error?.output?.payload?.statusCode

    console.log(
        `[SUBBOT] Conexión cerrada: +${subBotDir} | Código: ${statusCode ?? 'desconocido'}`
    )

    removeConnection(
        socket
    )

    if (
        statusCode ===
            DisconnectReason.loggedOut ||
        statusCode ===
            DisconnectReason.badSession ||
        statusCode === 401 ||
        statusCode === 403 ||
        statusCode === 405
    ) {
        console.log(
            `[SUBBOT] Eliminando sesión: +${subBotDir}`
        )

        deleteSession(
            socket.subBotJid
        )

        return
    }

    if (
        socket._reconnecting
    ) {
        return
    }

    socket._reconnecting =
        true

    setTimeout(
        async () => {
            try {
                await restartSubBot(
                    subBotDir
                )
            } catch (error) {
                console.error(
                    `[SUBBOT] Error reconectando +${subBotDir}:`,
                    error.message
                )
            } finally {
                socket._reconnecting =
                    false
            }
        },
        3000
    )
}

// Reiniciar subbot

export async function restartSubBot(
    subBotDir
) {
    const sessionPath =
        path.join(
            SUBBOTS_DIR,
            String(subBotDir)
        )

    const credsPath =
        path.join(
            sessionPath,
            'creds.json'
        )

    if (
        !fs.existsSync(
            credsPath
        )
    ) {
        return false
    }

    const existing =
        global.conns.find(
            socket =>
                socket?.isSubBot &&
                socket?.subBotJid ===
                    `${subBotDir}@s.whatsapp.net`
        )

    if (existing) {
        removeConnection(
            existing
        )

        try {
            existing.ws?.close()
        } catch {}
    }

    try {
        await startSubBot(
            String(subBotDir)
        )

        return true

    } catch (error) {
        console.error(
            `[SUBBOT] No se pudo reiniciar +${subBotDir}:`,
            error.message
        )

        return false
    }
}

// Revisar subbots activos

export async function checkSubBots() {
    const sockets =
        [...global.conns]

    for (
        const socket of sockets
    ) {
        if (
            !socket?.isSubBot
        ) {
            continue
        }

        if (
            !socket.user
        ) {
            removeConnection(
                socket
            )

            continue
        }

        const ws =
            socket.ws

        if (!ws) {
            removeConnection(
                socket
            )

            continue
        }

        const webSocket =
            ws.socket

        if (!webSocket) {
            continue
        }

        const readyState =
            webSocket.readyState

        if (
            readyState === 3
        ) {
            removeConnection(
                socket
            )
        }
    }
}

// Obtener subbots conectados

export function getActiveSubBots() {
    return global.conns.filter(
        socket =>
            socket?.isSubBot &&
            socket?.user
    )
}

// Obtener un subbot

export function getSubBot(
    jid
) {
    const normalized =
        jidNormalizedUser(
            jid
        )

    return global.conns.find(
        socket =>
            socket?.isSubBot &&
            socket?.subBotJid ===
                normalized
    )
}

// Eliminar un subbot

export function removeSubBot(
    jid
) {
    const normalized =
        jidNormalizedUser(
            jid
        )

    const sockets =
        global.conns.filter(
            socket =>
                socket?.isSubBot &&
                socket?.subBotJid ===
                    normalized
        )

    for (
        const socket of sockets
    ) {
        removeConnection(
            socket
        )

        try {
            socket.ws?.close()
        } catch {}
    }

    deleteSession(
        normalized
    )

    return true
}

// Comprobar subbots periódicamente

setInterval(
    () => {
        checkSubBots()
            .catch(error => {
                console.error(
                    '[SUBBOT] Error comprobando sesiones:',
                    error.message
                )
            })
    },
    60000
)