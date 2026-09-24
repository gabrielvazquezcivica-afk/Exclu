import fs from 'fs'
import path from 'path'
import pino from 'pino'
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys'

const SUBBOTS_DIR = path.join(
    process.cwd(),
    'sessions',
    'subbots'
)

const subBots = new Map()
const starting = new Set()

if (!fs.existsSync(SUBBOTS_DIR)) {
    fs.mkdirSync(
        SUBBOTS_DIR,
        {
            recursive: true
        }
    )
}

function normalizePhone(value) {
    if (!value) return null

    let phone = String(value)
        .trim()
        .replace(/[^\d]/g, '')

    if (!phone) return null

    // Los números de WhatsApp normalmente tienen entre
    // 8 y 15 dígitos en formato internacional.

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
        .filter(item => item.isDirectory())
        .map(item => item.name)
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

    const files = fs.readdirSync(folder)

    const hasCreds =
        files.includes('creds.json')

    const hasKeys =
        files.some(file =>
            file.startsWith('app-state-sync-key') ||
            file.startsWith('pre-key-') ||
            file.startsWith('session-')
        )

    return hasCreds || hasKeys
}

function removeSession(phone) {
    const normalized =
        normalizePhone(phone)

    if (!normalized) return

    const folder =
        getSessionPath(normalized)

    try {
        if (fs.existsSync(folder)) {
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

    subBots.delete(normalized)
    starting.delete(normalized)
}

function isAuthError(statusCode) {
    return [
        DisconnectReason.loggedOut,
        DisconnectReason.badSession,
        DisconnectReason.connectionReplaced,
        401,
        403,
        405
    ].includes(statusCode)
}

async function startSubBot(phone) {
    const normalized =
        normalizePhone(phone)

    if (!normalized) {
        console.log(
            `[SUBBOT] Sesión ignorada: número inválido (${phone})`
        )
        return null
    }

    if (starting.has(normalized)) {
        return subBots.get(normalized)?.sock || null
    }

    const sessionPath =
        getSessionPath(normalized)

    if (!hasAuthFiles(sessionPath)) {
        console.log(
            `[SUBBOT] Sesión ${normalized} no contiene credenciales válidas.`
        )

        removeSession(normalized)

        return null
    }

    starting.add(normalized)

    try {
        const {
            state,
            saveCreds
        } = await useMultiFileAuthState(
            sessionPath
        )

        if (!state?.creds) {
            console.log(
                `[SUBBOT] Credenciales inválidas para ${normalized}.`
            )

            removeSession(normalized)

            return null
        }

        const {
            version
        } =
            await fetchLatestBaileysVersion()

        const sock =
            makeWASocket({
                version,

                logger:
                    pino({
                        level: 'silent'
                    }),

                auth: {
                    creds:
                        state.creds,

                    keys:
                        makeCacheableSignalKeyStore(
                            state.keys,
                            pino({
                                level: 'silent'
                            })
                        )
                },

                printQRInTerminal: false,

                markOnlineOnConnect: false,

                syncFullHistory: false
            })

        sock.isSubBot = true
        sock.isMainBot = false
        sock.subBotNumber = normalized

        sock.ev.on(
            'creds.update',
            saveCreds
        )

        sock.ev.on(
            'connection.update',
            async update => {

                const {
                    connection,
                    lastDisconnect
                } = update

                if (
                    connection === 'open'
                ) {

                    console.log(
                        `[SUBBOT] ${normalized} conectado correctamente.`
                    )

                    subBots.set(
                        normalized,
                        {
                            phone: normalized,
                            sock,
                            sessionPath
                        }
                    )

                    starting.delete(
                        normalized
                    )

                    return
                }

                if (
                    connection !== 'close'
                ) {
                    return
                }

                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode

                console.log(
                    `[SUBBOT] ${normalized} desconectado (${statusCode ?? 'desconocido'}).`
                )

                subBots.delete(
                    normalized
                )

                starting.delete(
                    normalized
                )

                if (
                    isAuthError(
                        statusCode
                    )
                ) {

                    console.log(
                        `[SUBBOT] ${normalized} tiene una sesión inválida. Eliminando credenciales...`
                    )

                    removeSession(
                        normalized
                    )

                    return
                }

                // Cualquier otro cierre se intenta reconectar.

                setTimeout(
                    () => {
                        startSubBot(
                            normalized
                        ).catch(
                            error => {
                                console.error(
                                    `[SUBBOT] Error reconectando ${normalized}:`,
                                    error?.message || error
                                )
                            }
                        )
                    },
                    3000
                )
            }
        )

        subBots.set(
            normalized,
            {
                phone: normalized,
                sock,
                sessionPath
            }
        )

        return sock

    } catch (error) {

        console.error(
            `[SUBBOT] Error iniciando ${normalized}:`,
            error?.message || error
        )

        starting.delete(
            normalized
        )

        // Si Baileys devuelve 404 al intentar abrir
        // una sesión guardada, no se debe eliminar
        // automáticamente una sesión que podría recuperarse.
        //
        // Se deja la carpeta intacta y se reintentará
        // en el siguiente ciclo.

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

        if (!phone) {

            console.log(
                `[SUBBOT] Carpeta ignorada: ${folder}`
            )

            continue
        }

        if (
            phone !== folder
        ) {

            console.log(
                `[SUBBOT] Carpeta con formato inválido ignorada: ${folder}`
            )

            continue
        }

        const sessionPath =
            getSessionPath(phone)

        if (
            !hasAuthFiles(
                sessionPath
            )
        ) {

            console.log(
                `[SUBBOT] ${phone} no tiene credenciales.`
            )

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
            phone: bot.phone,
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