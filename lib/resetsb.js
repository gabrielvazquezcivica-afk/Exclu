import fs from 'fs'
import path from 'path'
import pino from 'pino'

import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    fetchLatestWaWebVersion
} from '@whiskeysockets/baileys'

const SUBBOTS_DIR = path.join(
    process.cwd(),
    'sessions',
    'subbots'
)

const subBots = new Map()
const starting = new Set()
const reconnectTimers = new Map()

if (!fs.existsSync(SUBBOTS_DIR)) {
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
            .replace(/\D/g, '')

    if (
        phone.length < 8 ||
        phone.length > 15
    ) {
        return null
    }

    return phone
}

function getSessionFolders() {
    if (!fs.existsSync(SUBBOTS_DIR)) {
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
    if (!fs.existsSync(folder)) {
        return false
    }

    const files =
        fs.readdirSync(folder)

    return (
        files.includes('creds.json') ||
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

function getStatusCode(error) {
    return (
        error?.output?.statusCode ??
        error?.data?.statusCode ??
        error?.statusCode ??
        error?.output?.payload?.statusCode
    )
}

function removeSession(phone) {
    const normalized =
        normalizePhone(phone)

    if (!normalized) {
        return
    }

    const folder =
        getSessionPath(
            normalized
        )

    const timer =
        reconnectTimers.get(
            normalized
        )

    if (timer) {
        clearTimeout(timer)
        reconnectTimers.delete(
            normalized
        )
    }

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
            error?.message || error
        )
    }

    subBots.delete(
        normalized
    )

    starting.delete(
        normalized
    )
}

function isAuthError(statusCode) {
    return [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        DisconnectReason.connectionReplaced,
        401,
        403,
        405
    ].includes(
        statusCode
    )
}

function scheduleReconnect(phone) {
    const normalized =
        normalizePhone(phone)

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

                try {
                    await startSubBot(
                        normalized
                    )
                } catch (error) {
                    console.error(
                        `[SUBBOT] Error reconectando ${normalized}:`,
                        error?.message || error
                    )
                }
            },
            2000
        )

    reconnectTimers.set(
        normalized,
        timer
    )
}

async function startSubBot(phone) {
    const normalized =
        normalizePhone(phone)

    if (!normalized) {
        return null
    }

    if (
        starting.has(
            normalized
        )
    ) {
        return (
            subBots.get(
                normalized
            )?.sock ||
            null
        )
    }

    const existing =
        subBots.get(
            normalized
        )

    if (
        existing?.sock &&
        existing.sock.ws
    ) {
        return existing.sock
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
            `[SUBBOT] Sesión ${normalized} no contiene credenciales.`
        )

        return null
    }

    starting.add(
        normalized
    )

    let sock = null

    try {
        const {
            state,
            saveCreds
        } =
            await useMultiFileAuthState(
                sessionPath
            )

        if (!state?.creds) {
            starting.delete(
                normalized
            )

            return null
        }

        let version

        if (
            typeof fetchLatestWaWebVersion ===
            'function'
        ) {
            try {
                const result =
                    await fetchLatestWaWebVersion()

                version =
                    result?.version
            } catch (error) {
                console.warn(
                    `[SUBBOT] No se pudo obtener la versión actual para ${normalized}.`
                )
            }
        }

        const options = {
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
        }

        if (
            Array.isArray(version) &&
            version.length === 3
        ) {
            options.version =
                version
        }

        sock =
            makeWASocket(
                options
            )

        sock.isSubBot =
            true

        sock.isMainBot =
            false

        sock.isInit =
            false

        sock.subBotNumber =
            normalized

        sock.subBotJid =
            `${normalized}@s.whatsapp.net`

        sock.sessionPath =
            sessionPath

        sock.startTime =
            Date.now()

        sock.ev.on(
            'creds.update',
            saveCreds
        )

        subBots.set(
            normalized,
            {
                phone:
                    normalized,

                sock,

                sessionPath
            }
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
                    sock.isInit =
                        true

                    starting.delete(
                        normalized
                    )

                    console.log(
                        `[SUBBOT] ${normalized} conectado correctamente.`
                    )

                    return
                }

                if (
                    connection !==
                    'close'
                ) {
                    return
                }

                sock.isInit =
                    false

                const statusCode =
                    getStatusCode(
                        lastDisconnect?.error
                    )

                console.log(
                    `[SUBBOT] ${normalized} desconectado (${statusCode ?? 'desconocido'}).`
                )

                const current =
                    subBots.get(
                        normalized
                    )

                if (
                    current?.sock ===
                    sock
                ) {
                    subBots.delete(
                        normalized
                    )
                }

                starting.delete(
                    normalized
                )

                if (
                    statusCode ===
                    DisconnectReason.restartRequired
                ) {
                    console.log(
                        `[SUBBOT] ${normalized} requiere reinicio. Reconectando...`
                    )

                    scheduleReconnect(
                        normalized
                    )

                    return
                }

                if (
                    isAuthError(
                        statusCode
                    )
                ) {
                    console.log(
                        `[SUBBOT] ${normalized} tiene credenciales inválidas. Eliminando sesión...`
                    )

                    removeSession(
                        normalized
                    )

                    return
                }

                console.log(
                    `[SUBBOT] ${normalized} será reconectado.`
                )

                scheduleReconnect(
                    normalized
                )
            }
        )

        starting.delete(
            normalized
        )

        return sock

    } catch (error) {
        starting.delete(
            normalized
        )

        const statusCode =
            getStatusCode(
                error
            )

        console.error(
            `[SUBBOT] Error iniciando ${normalized}:`,
            error?.message || error
        )

        console.error(
            `[SUBBOT] Estado: ${statusCode ?? 'desconocido'}`
        )

        const current =
            subBots.get(
                normalized
            )

        if (
            current?.sock ===
            sock
        ) {
            subBots.delete(
                normalized
            )
        }

        if (
            statusCode ===
            515
        ) {
            scheduleReconnect(
                normalized
            )
        }

        return null
    }
}

export async function startSub() {
    const folders =
        getSessionFolders()

    let reconnected = 0

    for (
        const folder of folders
    ) {
        const phone =
            normalizePhone(
                folder
            )

        if (
            !phone ||
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
        `[SUBBOT] Se reconectaron ${reconnected} de ${folders.length} sesión(es).`
    )

    return reconnected
}

export async function restartSubBot(
    phone
) {
    const normalized =
        normalizePhone(phone)

    if (!normalized) {
        return null
    }

    const timer =
        reconnectTimers.get(
            normalized
        )

    if (timer) {
        clearTimeout(timer)

        reconnectTimers.delete(
            normalized
        )
    }

    const current =
        subBots.get(
            normalized
        )

    if (
        current?.sock
    ) {
        try {
            current.sock.end(
                undefined
            )
        } catch {}
    }

    subBots.delete(
        normalized
    )

    starting.delete(
        normalized
    )

    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                1000
            )
    )

    return startSubBot(
        normalized
    )
}

export function checkSubBots() {
    return Array.from(
        subBots.values()
    ).map(
        bot => ({
            phone:
                bot.phone,

            connected:
                !!bot.sock
        })
    )
}

export function getActiveSubBots() {
    return Array.from(
        subBots.values()
    )
}

export function getSubBot(
    phone
) {
    const normalized =
        normalizePhone(phone)

    if (!normalized) {
        return null
    }

    return (
        subBots.get(
            normalized
        )?.sock ||
        null
    )
}

export function removeSubBot(
    phone
) {
    const normalized =
        normalizePhone(phone)

    if (!normalized) {
        return false
    }

    const bot =
        subBots.get(
            normalized
        )

    if (
        bot?.sock
    ) {
        try {
            bot.sock.end(
                undefined
            )
        } catch {}
    }

    removeSession(
        normalized
    )

    return true
}

export default startSub