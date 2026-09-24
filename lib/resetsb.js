import fs from 'fs'
import path from 'path'
import pino from 'pino'

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'

import {
    initHandler
} from '../handler.js'

const SUBBOTS_DIR =
    path.join(
        process.cwd(),
        'sessions',
        'subbots'
    )

const subBots =
    new Map()

const starting =
    new Set()

const reconnectTimers =
    new Map()

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

function normalizePhone(value) {
    if (!value) {
        return null
    }

    const phone =
        String(value)
            .trim()
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

function getSessionFolders() {
    if (
        !fs.existsSync(
            SUBBOTS_DIR
        )
    ) {
        return []
    }

    return fs.readdirSync(
        SUBBOTS_DIR,
        {
            withFileTypes: true
        }
    )
        .filter(
            item =>
                item.isDirectory()
        )
        .map(
            item =>
                item.name
        )
}

function getSessionPath(phone) {
    return path.join(
        SUBBOTS_DIR,
        phone
    )
}

function hasAuthFiles(folder) {
    if (
        !fs.existsSync(
            folder
        )
    ) {
        return false
    }

    const files =
        fs.readdirSync(
            folder
        )

    return (
        files.includes(
            'creds.json'
        ) ||
        files.some(
            file =>
                file.startsWith(
                    'app-state-sync-key'
                ) ||
                file.startsWith(
                    'pre-key-'
                ) ||
                file.startsWith(
                    'session-'
                )
        )
    )
}

function getStatusCode(lastDisconnect) {
    const error =
        lastDisconnect?.error

    return (
        error?.output?.statusCode ??
        error?.data?.statusCode ??
        error?.statusCode ??
        null
    )
}

function isFatalAuthError(statusCode) {
    return [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        401,
        403,
        405
    ].includes(
        statusCode
    )
}

function clearReconnectTimer(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return
    }

    const timer =
        reconnectTimers.get(
            normalized
        )

    if (timer) {
        clearTimeout(
            timer
        )

        reconnectTimers.delete(
            normalized
        )
    }
}

function removeSession(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return false
    }

    clearReconnectTimer(
        normalized
    )

    const folder =
        getSessionPath(
            normalized
        )

    try {
        if (
            fs.existsSync(
                folder
            )
        ) {
            fs.rmSync(
                folder,
                {
                    recursive: true,
                    force: true
                }
            )
        }
    } catch (error) {
        console.error(
            `[SUBBOT] Error eliminando sesión ${normalized}:`,
            error?.message ||
            error
        )
    }

    subBots.delete(
        normalized
    )

    starting.delete(
        normalized
    )

    return true
}

function scheduleReconnect(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return
    }

    if (
        reconnectTimers.has(
            normalized
        )
    ) {
        return
    }

    const timer =
        setTimeout(
            async () => {
                reconnectTimers.delete(
                    normalized
                )

                const current =
                    subBots.get(
                        normalized
                    )

                if (
                    current?.stopped === true
                ) {
                    return
                }

                try {
                    await startSubBot(
                        normalized
                    )
                } catch (error) {
                    console.error(
                        `[SUBBOT] Error reconectando ${normalized}:`,
                        error?.message ||
                        error
                    )
                }
            },
            3000
        )

    reconnectTimers.set(
        normalized,
        timer
    )
}

async function getWaVersion() {
    try {
        const result =
            await fetchLatestWaWebVersion()

        if (
            Array.isArray(
                result?.version
            ) &&
            result.version.length === 3
        ) {
            return result.version
        }
    } catch {}

    return [
        2,
        3000,
        1048361770
    ]
}

async function closeSocket(sock) {
    if (!sock) {
        return
    }

    sock.isStopped =
        true

    sock.isInit =
        false

    try {
        sock.ws?.close()
    } catch {}

    try {
        sock.end(
            undefined
        )
    } catch {}

    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                500
            )
    )
}

export async function startSubBot(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return null
    }

    clearReconnectTimer(
        normalized
    )

    const existing =
        subBots.get(
            normalized
        )

    if (
        existing?.sock &&
        !existing.stopped &&
        existing.sock.isStopped !== true
    ) {
        if (
            existing.sock.isInit === true
        ) {
            return existing.sock
        }

        if (
            starting.has(
                normalized
            )
        ) {
            return existing.sock
        }
    }

    if (
        starting.has(
            normalized
        )
    ) {
        return null
    }

    if (
        existing?.stopped &&
        existing.sock
    ) {
        await closeSocket(
            existing.sock
        )
    }

    const sessionPath =
        getSessionPath(
            normalized
        )

    if (
        !hasAuthFiles(
            sessionPath
        )
    ) {
        console.log(
            `[SUBBOT] ${normalized} no tiene credenciales.`
        )

        return null
    }

    starting.add(
        normalized
    )

    let sock = null
    let saveCreds = null

    try {
        const auth =
            await useMultiFileAuthState(
                sessionPath
            )

        const state =
            auth.state

        saveCreds =
            auth.saveCreds

        if (
            !state?.creds
        ) {
            starting.delete(
                normalized
            )

            return null
        }

        const version =
            await getWaVersion()

        sock =
            makeWASocket({
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

        sock.isSubBot =
            true

        sock.isMainBot =
            false

        sock.isInit =
            false

        sock.isStopped =
            false

        sock.subBotNumber =
            normalized

        sock.subBotJid =
            `${normalized}@s.whatsapp.net`

        sock.sessionPath =
            sessionPath

        sock.startTime =
            Date.now()

        let sessionClosed =
            false

        sock.ev.on(
            'creds.update',
            async () => {
                if (
                    sessionClosed ||
                    sock.isStopped
                ) {
                    return
                }

                if (
                    !fs.existsSync(
                        sessionPath
                    )
                ) {
                    return
                }

                try {
                    await saveCreds()
                } catch (error) {
                    if (
                        error?.code !==
                        'ENOENT'
                    ) {
                        console.error(
                            `[SUBBOT] Error guardando credenciales de ${normalized}:`,
                            error?.message ||
                            error
                        )
                    }
                }
            }
        )

        const botEntry = {
            phone:
                normalized,

            sock,

            sessionPath,

            stopped:
                false,

            handlerStarted:
                false
        }

        subBots.set(
            normalized,
            botEntry
        )

        sock.ev.on(
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
                    starting.delete(
                        normalized
                    )

                    sock.isInit =
                        true

                    sock.isStopped =
                        false

                    sessionClosed =
                        false

                    const current =
                        subBots.get(
                            normalized
                        )

                    if (
                        current?.sock !==
                        sock
                    ) {
                        return
                    }

                    current.stopped =
                        false

                    console.log(
                        `[SUBBOT] +${normalized} conectado correctamente.`
                    )

                    if (
                        !current.handlerStarted
                    ) {
                        current.handlerStarted =
                            true

                        try {
                            await initHandler(
                                sock
                            )

                            console.log(
                                `[SUBBOT] +${normalized} handler iniciado.`
                            )
                        } catch (error) {
                            current.handlerStarted =
                                false

                            console.error(
                                `[SUBBOT] Error iniciando handler de +${normalized}:`,
                                error?.message ||
                                error
                            )
                        }
                    }

                    return
                }

                if (
                    connection !==
                    'close'
                ) {
                    return
                }

                const statusCode =
                    getStatusCode(
                        lastDisconnect
                    )

                sock.isInit =
                    false

                sessionClosed =
                    true

                const current =
                    subBots.get(
                        normalized
                    )

                if (
                    current?.sock !==
                    sock
                ) {
                    return
                }

                if (
                    current.stopped ===
                    true ||
                    sock.isStopped ===
                    true
                ) {
                    starting.delete(
                        normalized
                    )

                    console.log(
                        `[SUBBOT] +${normalized} detenido manualmente.`
                    )

                    return
                }

                starting.delete(
                    normalized
                )

                console.log(
                    `[SUBBOT] +${normalized} desconectado (${statusCode ?? 'desconocido'}).`
                )

                if (
                    statusCode ===
                    DisconnectReason.connectionReplaced
                ) {
                    console.log(
                        `[SUBBOT] +${normalized} fue reemplazado por otra conexión.`
                    )

                    try {
                        sock.end(
                            undefined
                        )
                    } catch {}

                    subBots.delete(
                        normalized
                    )

                    scheduleReconnect(
                        normalized
                    )

                    return
                }

                if (
                    statusCode ===
                    DisconnectReason.restartRequired
                ) {
                    console.log(
                        `[SUBBOT] +${normalized} requiere reinicio.`
                    )

                    try {
                        sock.end(
                            undefined
                        )
                    } catch {}

                    subBots.delete(
                        normalized
                    )

                    scheduleReconnect(
                        normalized
                    )

                    return
                }

                if (
                    isFatalAuthError(
                        statusCode
                    )
                ) {
                    console.log(
                        `[SUBBOT] +${normalized} perdió la sesión. Eliminando credenciales...`
                    )

                    try {
                        sock.end(
                            undefined
                        )
                    } catch {}

                    removeSession(
                        normalized
                    )

                    return
                }

                try {
                    sock.end(
                        undefined
                    )
                } catch {}

                subBots.delete(
                    normalized
                )

                scheduleReconnect(
                    normalized
                )
            }
        )

        return sock

    } catch (error) {
        console.error(
            `[SUBBOT] Error iniciando ${normalized}:`,
            error?.message ||
            error
        )

        if (sock) {
            try {
                await closeSocket(
                    sock
                )
            } catch {}
        }

        const current =
            subBots.get(
                normalized
            )

        if (
            current?.sock ===
            sock
        ) {
            if (
                existing?.stopped ===
                true
            ) {
                subBots.set(
                    normalized,
                    {
                        phone:
                            normalized,

                        sock:
                            null,

                        sessionPath,

                        stopped:
                            true,

                        handlerStarted:
                            false
                    }
                )
            } else {
                subBots.delete(
                    normalized
                )
            }
        }

        starting.delete(
            normalized
        )

        return null
    }
}

export async function startSub() {
    const folders =
        getSessionFolders()

    let reconnected =
        0

    for (
        const folder of folders
    ) {
        const phone =
            normalizePhone(
                folder
            )

        if (!phone) {
            continue
        }

        if (
            phone !== folder
        ) {
            continue
        }

        const sessionPath =
            getSessionPath(
                phone
            )

        if (
            !hasAuthFiles(
                sessionPath
            )
        ) {
            removeSession(
                phone
            )

            continue
        }

        const sock =
            await startSubBot(
                phone
            )

        if (sock) {
            reconnected++
        }
    }

    console.log(
        `[SUBBOT] Se conectaron ${reconnected} de ${folders.length} sesión(es).`
    )

    return reconnected
}

export async function restartSubBot(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return null
    }

    clearReconnectTimer(
        normalized
    )

    const current =
        subBots.get(
            normalized
        )

    if (
        current
    ) {
        current.stopped =
            true

        if (
            current.sock
        ) {
            await closeSocket(
                current.sock
            )
        }
    }

    return startSubBot(
        normalized
    )
}

export async function stopSubBot(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return false
    }

    clearReconnectTimer(
        normalized
    )

    const bot =
        subBots.get(
            normalized
        )

    if (!bot) {
        return false
    }

    bot.stopped =
        true

    starting.delete(
        normalized
    )

    if (
        bot.sock
    ) {
        bot.sock.isStopped =
            true

        bot.sock.isInit =
            false

        await closeSocket(
            bot.sock
        )

        bot.sock =
            null

        bot.handlerStarted =
            false
    }

    console.log(
        `[SUBBOT] +${normalized} pausado.`
    )

    return true
}

export function checkSubBots() {
    return Array.from(
        subBots.values()
    ).map(
        bot => ({
            phone:
                bot.phone,

            connected:
                !!bot.sock &&
                bot.sock.isInit === true,

            stopped:
                bot.stopped === true
        })
    )
}

export function getActiveSubBots() {
    return Array.from(
        subBots.values()
    )
}

export function getSubBot(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return null
    }

    return subBots.get(
        normalized
    )?.sock || null
}

export function removeSubBot(phone) {
    const normalized =
        normalizePhone(
            phone
        )

    if (!normalized) {
        return false
    }

    clearReconnectTimer(
        normalized
    )

    const bot =
        subBots.get(
            normalized
        )

    if (bot) {
        bot.stopped =
            true

        if (bot.sock) {
            bot.sock.isStopped =
                true

            try {
                bot.sock.ws?.close()
            } catch {}

            try {
                bot.sock.end(
                    undefined
                )
            } catch {}
        }
    }

    return removeSession(
        normalized
    )
}

export default startSub