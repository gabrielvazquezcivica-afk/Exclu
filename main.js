import * as baileys from '@whiskeysockets/baileys'

import fs from 'fs'
import path from 'path'
import pino from 'pino'
import chalk from 'chalk'
import readline from 'readline'
import qrcode from 'qrcode-terminal'

const makeWASocket =
    baileys.makeWASocket

const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = baileys

const SESSION_DIR =
    path.join(
        process.cwd(),
        'sessions',
        'exclusive'
    )

const SUBBOTS_DIR =
    path.join(
        process.cwd(),
        'sessions',
        'subbots'
    )

fs.mkdirSync(
    SESSION_DIR,
    {
        recursive: true
    }
)

fs.mkdirSync(
    SUBBOTS_DIR,
    {
        recursive: true
    }
)

let conn = null
let reconnecting = false
let loginInProgress = false

global.conn = null
global.conns = global.conns || []

const rl =
    readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

function question(text) {
    return new Promise(
        resolve => {
            rl.question(
                text,
                answer => {
                    resolve(
                        String(
                            answer
                        ).trim()
                    )
                }
            )
        }
    )
}

async function startConnection(
    method
) {
    try {
        const sessionExists =
            fs.existsSync(
                path.join(
                    SESSION_DIR,
                    'creds.json'
                )
            )

        const {
            state,
            saveCreds
        } =
            await useMultiFileAuthState(
                SESSION_DIR
            )

        const {
            version
        } =
            await fetchLatestBaileysVersion()

        conn =
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

        conn.isMainBot =
            true

        conn.isSubBot =
            false

        conn.isInit =
            false

        conn.sessionPath =
            SESSION_DIR

        conn.startTime =
            Date.now()

        global.conn =
            conn

        conn.ev.on(
            'creds.update',
            saveCreds
        )

        if (
            !sessionExists &&
            method === 'code'
        ) {
            const number =
                await question(
                    '\n📱 Ingresa tu número (ej: 521234567890): '
                )

            const phone =
                String(number)
                    .replace(
                        /\D/g,
                        ''
                    )

            if (
                !/^\d{8,15}$/.test(
                    phone
                )
            ) {
                console.log(
                    chalk.red(
                        '\n❌ Número inválido.'
                    )
                )

                console.log(
                    chalk.gray(
                        'Ejemplo: 521234567890'
                    )
                )

                console.log('')

                loginInProgress =
                    false

                try {
                    conn.ws?.close()
                } catch {}

                return
            }

            console.log(
                chalk.cyan(
                    '\n⏳ Preparando vinculación...'
                )
            )

            setTimeout(
                async () => {
                    try {
                        const code =
                            await conn.requestPairingCode(
                                phone
                            )

                        console.log('')

                        console.log(
                            chalk.green(
                                `🔑 Código de vinculación: ${code}`
                            )
                        )

                        console.log('')

                        console.log(
                            chalk.gray(
                                'WhatsApp → Dispositivos vinculados → Vincular con número de teléfono'
                            )
                        )

                        console.log('')

                    } catch (
                        error
                    ) {
                        console.error(
                            chalk.red(
                                '❌ Error generando código:'
                            )
                        )

                        console.error(
                            error?.message ||
                            error
                        )

                        loginInProgress =
                            false
                    }
                },
                3000
            )
        }

        if (
            !sessionExists &&
            method === 'qr'
        ) {
            conn.ev.on(
                'connection.update',
                ({ qr }) => {
                    if (qr) {
                        console.log(
                            chalk.green(
                                '\n📲 Escanea este QR:\n'
                            )
                        )

                        qrcode.generate(
                            qr,
                            {
                                small: true
                            }
                        )
                    }
                }
            )
        }

        conn.ev.on(
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
                    reconnecting =
                        false

                    loginInProgress =
                        false

                    conn.isMainBot =
                        true

                    conn.isSubBot =
                        false

                    conn.isInit =
                        true

                    global.conn =
                        conn

                    console.log(
                        chalk.green(
                            '\n✅ BOT CONECTADO\n'
                        )
                    )

                    console.log(
                        chalk.cyan(
                            `[EXCLUSIVE] Número: ${conn.user?.id || 'desconocido'}`
                        )
                    )

                    console.log('')

                    try {
                        const {
                            initHandler
                        } =
                            await import(
                                './handler.js'
                            )

                        await initHandler(
                            conn
                        )

                    } catch (
                        error
                    ) {
                        console.error(
                            chalk.red(
                                '[HANDLER] No se pudo iniciar:'
                            ),
                            error?.message ||
                            error
                        )
                    }

                    try {
                        const {
                            startSub
                        } =
                            await import(
                                './lib/resetsb.js'
                            )

                        if (
                            typeof startSub ===
                            'function'
                        ) {
                            await startSub()
                        }

                                        } catch (
                        error
                    ) {
                        console.error(
                            chalk.red(
                                '[SUBBOT] No se pudieron cargar las sesiones:'
                            )
                        )

                        console.error(
                            error?.stack ||
                            error
                        )
                    }

                    return
                }

                if (
                    connection !==
                    'close'
                ) {
                    return
                }

                conn.isInit =
                    false

                const reason =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode ??
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.payload
                        ?.statusCode ??
                    lastDisconnect
                        ?.error
                        ?.data
                        ?.statusCode ??
                    lastDisconnect
                        ?.error
                        ?.statusCode

                console.log('')

                console.log(
                    chalk.red(
                        `❌ Conexión cerrada (${reason ?? 'desconocido'})`
                    )
                )

                if (
                    reason ===
                        DisconnectReason.loggedOut ||
                    reason ===
                        DisconnectReason.badSession ||
                    reason === 401 ||
                    reason === 403 ||
                    reason === 405
                ) {
                    console.log(
                        chalk.red(
                            '[EXCLUSIVE] La sesión ya no es válida.'
                        )
                    )

                    console.log(
                        chalk.yellow(
                            '[EXCLUSIVE] Elimina sessions/exclusive y vuelve a vincular.'
                        )
                    )

                    loginInProgress =
                        false

                    return
                }

                if (
                    reconnecting
                ) {
                    return
                }

                reconnecting =
                    true

                console.log(
                    chalk.cyan(
                        '[EXCLUSIVE] Reconectando en 3 segundos...'
                    )
                )

                setTimeout(
                    async () => {
                        try {
                            reconnecting =
                                false

                            await startConnection(
                                'saved'
                            )

                        } catch (
                            error
                        ) {
                            console.error(
                                chalk.red(
                                    '[EXCLUSIVE] Error reconectando:'
                                ),
                                error?.message ||
                                error
                            )

                            reconnecting =
                                false

                            loginInProgress =
                                false
                        }
                    },
                    3000
                )
            }
        )

        return conn

    } catch (
        error
    ) {
        loginInProgress =
            false

        console.error(
            chalk.red(
                '[EXCLUSIVE] Error creando conexión:'
            ),
            error?.message ||
            error
        )

        throw error
    }
}

async function loginMenu() {
    if (
        loginInProgress
    ) {
        return
    }

    loginInProgress =
        true

    try {
        const credsPath =
            path.join(
                SESSION_DIR,
                'creds.json'
            )

        if (
            fs.existsSync(
                credsPath
            )
        ) {
            console.log('')

            console.log(
                chalk.green(
                    '🔐 Sesión detectada, conectando automáticamente...'
                )
            )

            console.log('')

            await startConnection(
                'saved'
            )

            return
        }

        console.log('')

        console.log(
            chalk.cyan(
                '╭────────────────────────────╮'
            )
        )

        console.log(
            chalk.cyan(
                '│     EXCLUSIVE BOT LOGIN    │'
            )
        )

        console.log(
            chalk.cyan(
                '╰────────────────────────────╯'
            )
        )

        console.log('')

        console.log(
            '1. Código de vinculación'
        )

        console.log(
            '2. Código QR'
        )

        console.log('')

        let option = ''

        while (
            option !== '1' &&
            option !== '2'
        ) {
            option =
                await question(
                    'Selecciona (1 o 2): '
                )

            if (
                option !== '1' &&
                option !== '2'
            ) {
                console.log(
                    chalk.yellow(
                        'Selecciona 1 o 2.'
                    )
                )
            }
        }

        await startConnection(
            option === '1'
                ? 'code'
                : 'qr'
        )

    } catch (
        error
    ) {
        loginInProgress =
            false

        console.error(
            chalk.red(
                '[MAIN] Error en el inicio:'
            ),
            error?.message ||
            error
        )
    }
}

if (
    process.connected
) {
    process.on(
        'message',
        async message => {
            if (
                message ===
                'reset'
            ) {
                try {
                    conn?.ws?.close()
                } catch {}

                process.send?.(
                    'reset'
                )

                return
            }

            if (
                message ===
                'uptime'
            ) {
                process.send?.(
                    process.uptime()
                )
            }
        }
    )
}

await loginMenu()