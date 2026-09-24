import fs from 'fs'
import path from 'path'
import pino from 'pino'
import chalk from 'chalk'
import readline from 'readline'

import {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} from '@whiskeysockets/baileys'

const SESSION_DIR = path.join(
    process.cwd(),
    'sessions',
    'exclusive'
)

const SUBBOTS_DIR = path.join(
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

// Preguntar por consola

function question(text) {
    const rl =
        readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

    return new Promise(resolve => {

        rl.question(
            text,
            answer => {

                rl.close()

                resolve(
                    answer.trim()
                )
            }
        )
    })
}

// Menú de inicio

async function loginMenu() {

    if (
        loginInProgress
    ) {
        return
    }

    loginInProgress = true

    try {

        const credsPath =
            path.join(
                SESSION_DIR,
                'creds.json'
            )

        // Si existe una sesión,
        // no volver a pedir el número

        if (
            fs.existsSync(
                credsPath
            )
        ) {

            loginInProgress =
                false

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
            chalk.white(
                '1. Código de vinculación'
            )
        )

        console.log(
            chalk.white(
                '2. Código QR'
            )
        )

        console.log('')

        let option = ''

        while (
            option !== '1' &&
            option !== '2'
        ) {

            option =
                await question(
                    chalk.magenta(
                        'Selecciona una opción: '
                    )
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

        if (
            option === '1'
        ) {

            await startConnection(
                'code'
            )

        } else {

            await startConnection(
                'qr'
            )
        }

    } catch (error) {

        console.error(
            chalk.red(
                '[MAIN] Error en el menú:'
            ),
            error?.message ||
            error
        )

        loginInProgress =
            false
    }
}

// Crear conexión

async function startConnection(
    method
) {

    try {

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
                    method === 'qr',

                markOnlineOnConnect:
                    true,

                generateHighQualityLinkPreview:
                    true
            })

        // Identificar el Bot Principal

        conn.isMainBot =
            true

        conn.isSubBot =
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

        // Código de vinculación

        if (
            method === 'code' &&
            !state.creds.registered
        ) {

            let phone =
                await question(
                    chalk.green(
                        '\nIngresa el número de WhatsApp del Bot Principal:\n> '
                    )
                )

            // Quitar +, espacios, guiones,
            // paréntesis y cualquier otro carácter

            phone =
                String(phone)
                    .replace(
                        /\D/g,
                        ''
                    )

            // Validar número internacional

            if (
                !/^\d{8,15}$/.test(
                    phone
                )
            ) {

                console.log('')

                console.log(
                    chalk.red(
                        '❌ Número inválido.'
                    )
                )

                console.log(
                    chalk.gray(
                        'Ejemplo: 12514487515'
                    )
                )

                console.log('')

                try {
                    conn.ws?.close()
                } catch {}

                loginInProgress =
                    false

                return
            }

            console.log('')

            console.log(
                chalk.cyan(
                    `[EXCLUSIVE] Solicitando código para +${phone}...`
                )
            )

            try {

                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            1500
                        )
                )

                let code =
                    await conn.requestPairingCode(
                        phone
                    )

                code =
                    code
                        ?.match(
                            /.{1,4}/g
                        )
                        ?.join('-') ||
                    code

                console.log('')

                console.log(
                    chalk.magenta(
                        '╭────────────────────────────╮'
                    )
                )

                console.log(
                    chalk.magenta(
                        '│   CÓDIGO DE VINCULACIÓN    │'
                    )
                )

                console.log(
                    chalk.magenta(
                        '╰────────────────────────────╯'
                    )
                )

                console.log('')

                console.log(
                    chalk.white.bold(
                        code
                    )
                )

                console.log('')

                console.log(
                    chalk.gray(
                        'WhatsApp → Dispositivos vinculados → Vincular con número de teléfono'
                    )
                )

                console.log('')

            } catch (error) {

                console.error(
                    chalk.red(
                        '[EXCLUSIVE] No se pudo solicitar el código.'
                    )
                )

                console.error(
                    chalk.gray(
                        error?.message ||
                        error
                    )
                )

                try {
                    conn.ws?.close()
                } catch {}

                loginInProgress =
                    false

                return
            }
        }

        // Eventos de conexión

        conn.ev.on(
            'connection.update',
            async update => {

                const {
                    connection,
                    lastDisconnect
                } = update

                // Conectado

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

                    global.conn =
                        conn

                    console.log('')

                    console.log(
                        chalk.green(
                            '[EXCLUSIVE] Bot Principal conectado.'
                        )
                    )

                    console.log(
                        chalk.cyan(
                            `[EXCLUSIVE] Número: ${conn.user?.id || 'desconocido'}`
                        )
                    )

                    console.log('')

                    // Cargar handler

                    try {

                        const {
                            initHandler
                        } =
                            await import(
                                './handler.js?update=' +
                                Date.now()
                            )

                        await initHandler(
                            conn
                        )

                    } catch (error) {

                        console.error(
                            chalk.red(
                                '[HANDLER] No se pudo iniciar:'
                            ),
                            error?.message ||
                            error
                        )
                    }

                    // Cargar SubBots guardados

                    try {

                        const {
                            startSub
                        } =
                            await import(
                                './lib/resetsb.js?update=' +
                                Date.now()
                            )

                        if (
                            typeof startSub ===
                            'function'
                        ) {

                            await startSub()
                        }

                    } catch (error) {

                        console.error(
                            chalk.red(
                                '[SUBBOT] No se pudieron cargar las sesiones:'
                            ),
                            error?.message ||
                            error
                        )
                    }

                    return
                }

                // Si no se cerró,
                // no hacer nada

                if (
                    connection !==
                    'close'
                ) {
                    return
                }

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

                console.log('')

                console.log(
                    chalk.yellow(
                        `[EXCLUSIVE] Conexión cerrada. Código: ${statusCode ?? 'desconocido'}`
                    )
                )

                // Sesión cerrada definitivamente

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

                    return
                }

                // Evitar múltiples reconexiones

                if (
                    reconnecting
                ) {
                    return
                }

                reconnecting =
                    true

                console.log(
                    chalk.cyan(
                        '[EXCLUSIVE] Intentando reconectar en 3 segundos...'
                    )
                )

                setTimeout(
                    async () => {

                        try {

                            loginInProgress =
                                false

                            await startConnection(
                                method
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
                        }

                    },
                    3000
                )
            }
        )

    } catch (error) {

        loginInProgress =
            false

        console.error(
            chalk.red(
                '[EXCLUSIVE] Error creando conexión:'
            ),
            error?.message ||
            error
        )

        if (
            !reconnecting
        ) {

            reconnecting =
                true

            setTimeout(
                async () => {

                    reconnecting =
                        false

                    try {
                        await loginMenu()
                    } catch {}

                },
                3000
            )
        }
    }
}

// Comunicación con index.js

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

                return
            }
        }
    )
}

// Iniciar Bot Principal

await loginMenu()