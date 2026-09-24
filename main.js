import fs from 'fs'
import path from 'path'
import readline from 'readline'
import chalk from 'chalk'
import pino from 'pino'

import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'

// Rutas principales

const ROOT = process.cwd()

const SESSION_DIR = path.join(
  ROOT,
  'sessions',
  'exclusive'
)

const PLUGINS_DIR = path.join(
  ROOT,
  'plugins'
)

const LIB_DIR = path.join(
  ROOT,
  'lib'
)

const DATABASE_DIR = path.join(
  ROOT,
  'database'
)

const SUBBOTS_DIR = path.join(
  ROOT,
  'sessions',
  'subbots'
)

const TMP_DIR = path.join(
  ROOT,
  'tmp'
)

// Variables globales

global.conn = null
global.sock = null
global.mainBot = null
global.authFile = SESSION_DIR

let rl = null
let loginMethod = null
let phoneNumber = null
let reconnecting = false
let coreStarted = false

// Crear carpetas

function createDirectories() {
  const directories = [
    path.join(ROOT, 'sessions'),
    SESSION_DIR,
    SUBBOTS_DIR,
    PLUGINS_DIR,
    LIB_DIR,
    DATABASE_DIR,
    TMP_DIR
  ]

  for (const directory of directories) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {
        recursive: true
      })
    }
  }
}

// Crear readline

function createReadline() {
  if (rl) return rl

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  })

  return rl
}

// Pregunta en consola

function question(text) {
  return new Promise(resolve => {
    createReadline().question(
      text,
      answer => {
        resolve(answer.trim())
      }
    )
  })
}

// Cerrar readline

function closeReadline() {
  if (!rl) return

  try {
    rl.close()
  } catch {}

  rl = null
}

// Menú de inicio de sesión

async function selectLoginMethod() {
  const credsPath = path.join(
    SESSION_DIR,
    'creds.json'
  )

  if (fs.existsSync(credsPath)) {
    return 'saved'
  }

  let option = ''

  do {
    console.log('')

    console.log(
      chalk.cyan(
        '╭──────────────────────────────╮'
      )
    )

    console.log(
      chalk.cyan(
        '│   MÉTODO DE INICIO DE SESIÓN │'
      )
    )

    console.log(
      chalk.cyan(
        '╰──────────────────────────────╯'
      )
    )

    console.log('')

    console.log(
      chalk.white(
        '1. Código QR'
      )
    )

    console.log(
      chalk.white(
        '2. Código de vinculación'
      )
    )

    console.log('')

    option = await question(
      chalk.magenta(
        'Selecciona una opción → '
      )
    )

    if (
      option !== '1' &&
      option !== '2'
    ) {
      console.log('')

      console.log(
        chalk.red(
          '❌ Selecciona solamente 1 o 2.'
        )
      )
    }

  } while (
    option !== '1' &&
    option !== '2'
  )

  return option
}

// Pedir número para código

async function askPhoneNumber() {
  let number = ''

  do {
    console.log('')

    number = await question(
      chalk.green(
        '📱 Ingresa el número de WhatsApp con código de país\n' +
        chalk.magenta(
          '→ '
        )
      )
    )

    number = number.replace(
      /\D/g,
      ''
    )

    if (
      number.length < 8 ||
      number.length > 15
    ) {
      console.log('')

      console.log(
        chalk.red(
          '❌ Número inválido.'
        )
      )

      console.log(
        chalk.gray(
          'Ejemplo: 521XXXXXXXXXX'
        )
      )
    }

  } while (
    number.length < 8 ||
    number.length > 15
  )

  return number
}

// Crear conexión

async function createConnection() {
  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(
    SESSION_DIR
  )

  const {
    version
  } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
    version,

    logger: pino({
      level: 'silent'
    }),

    browser:
      Browsers.macOS(
        'Desktop'
      ),

    printQRInTerminal:
      loginMethod === '1',

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

    markOnlineOnConnect: true,

    generateHighQualityLinkPreview: true,

    syncFullHistory: false,

    defaultQueryTimeoutMs:
      undefined
  })

  global.conn = conn
  global.sock = conn
  global.mainBot = conn

  conn.isMainBot = true
  conn.isInit = false
  conn.sessionPath = SESSION_DIR
  conn.startTime = Date.now()

  conn.ev.on(
    'creds.update',
    saveCreds
  )

  conn.ev.on(
    'connection.update',
    update => {
      handleConnectionUpdate(
        conn,
        update
      )
    }
  )

  return conn
}

// Solicitar código de vinculación

async function requestPairingCode(conn) {
  if (
    loginMethod !== '2' ||
    !phoneNumber
  ) {
    return
  }

  if (
    conn.authState?.creds?.registered
  ) {
    return
  }

  try {
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          2000
        )
    )

    let code =
      await conn.requestPairingCode(
        phoneNumber
      )

    code =
      code
        ?.match(/.{1,4}/g)
        ?.join('-') ||
      code

    console.log('')

    console.log(
      chalk.cyan(
        '╭──────────────────────────────╮'
      )
    )

    console.log(
      chalk.cyan(
        '│     CÓDIGO DE VINCULACIÓN     │'
      )
    )

    console.log(
      chalk.cyan(
        '╰──────────────────────────────╯'
      )
    )

    console.log('')

    console.log(
      chalk.bold.white(
        `        ${code}`
      )
    )

    console.log('')

    console.log(
      chalk.gray(
        'Introduce este código en WhatsApp para vincular el dispositivo.'
      )
    )

    console.log('')

  } catch (error) {
    console.error('')

    console.error(
      chalk.red(
        '❌ No se pudo solicitar el código de vinculación.'
      )
    )

    console.error(
      chalk.gray(
        error?.message || error
      )
    )

    console.error('')
  }
}

// Cargar el núcleo del bot

async function startCore(conn) {
  if (
    coreStarted &&
    global.botCoreSocket === conn
  ) {
    return
  }

  try {
    const module =
      await import(
        `./lib/core.js?update=${Date.now()}`
      )

    if (
      typeof module.default === 'function'
    ) {
      await module.default(
        conn
      )
    } else if (
      typeof module.initBot === 'function'
    ) {
      await module.initBot(
        conn
      )
    }

    global.botCoreSocket = conn
    coreStarted = true

  } catch (error) {
    if (
      error?.code === 'ERR_MODULE_NOT_FOUND'
    ) {
      console.log(
        chalk.yellow(
          '[BOT] lib/core.js todavía no existe.'
        )
      )

      console.log(
        chalk.gray(
          'La conexión principal quedó lista.'
        )
      )

      return
    }

    console.error(
      chalk.red(
        '[BOT] Error cargando el núcleo:'
      )
    )

    console.error(error)
  }
}

// Actualización de conexión

async function handleConnectionUpdate(
  conn,
  update
) {
  const {
    connection,
    lastDisconnect,
    isNewLogin
  } = update

  if (isNewLogin) {
    console.log(
      chalk.green(
        '[WA] Nueva sesión iniciada.'
      )
    )
  }

  if (
    connection === 'connecting'
  ) {
    console.log(
      chalk.yellow(
        '[WA] Conectando...'
      )
    )
  }

  if (
    update.qr &&
    loginMethod === '1'
  ) {
    console.log(
      chalk.yellow(
        '🌿 Escanea el código QR mostrado en la consola.'
      )
    )
  }

  if (
    connection === 'open'
  ) {
    reconnecting = false
    closeReadline()

    conn.isInit = true

    console.log('')

    console.log(
      chalk.green(
        '╭──────────────────────────────╮'
      )
    )

    console.log(
      chalk.green(
        '│    EXCLUSIVE BOT CONECTADO   │'
      )
    )

    console.log(
      chalk.green(
        '╰──────────────────────────────╯'
      )
    )

    if (conn.user?.id) {
      const number =
        conn.user.id
          .split(':')[0]
          .replace(
            /\D/g,
            ''
          )

      if (number) {
        console.log(
          chalk.white(
            `Número: +${number}`
          )
        )
      }
    }

    console.log('')

    await startCore(conn)

    return
  }

  if (
    connection !== 'close'
  ) {
    return
  }

  conn.isInit = false

  const reason =
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
    chalk.red(
      `[WA] Conexión cerrada: ${reason ?? 'desconocido'}`
    )
  )

  // Sesión cerrada definitivamente

  if (
    reason === DisconnectReason.loggedOut ||
    reason === DisconnectReason.badSession ||
    reason === 401 ||
    reason === 403 ||
    reason === 405
  ) {
    console.log(
      chalk.red(
        '[WA] La sesión principal fue cerrada.'
      )
    )

    console.log(
      chalk.yellow(
        `Elimina ${path.relative(ROOT, SESSION_DIR)} y vuelve a vincular el número.`
      )
    )

    return
  }

  // Evitar múltiples reconexiones

  if (reconnecting) {
    return
  }

  reconnecting = true

  console.log(
    chalk.yellow(
      '[WA] Reconectando en 3 segundos...'
    )
  )

  try {
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          3000
        )
    )

    try {
      conn.ws?.close()
    } catch {}

    const newConn =
      await createConnection()

    if (
      loginMethod === '2' &&
      phoneNumber
    ) {
      await requestPairingCode(
        newConn
      )
    }

  } catch (error) {
    console.error(
      chalk.red(
        '[WA] Error al reconectar:'
      ),
      error?.message || error
    )
  }

  reconnecting = false
}

// IPC con index.js

function setupIPC() {
  if (!process.send) {
    return
  }

  process.on(
    'message',
    async message => {

      if (
        message === 'reset'
      ) {
        try {
          global.conn?.ws?.close()
        } catch {}

        process.send?.(
          'reset'
        )

        return
      }

      if (
        message === 'uptime'
      ) {
        process.send?.({
          type: 'uptime',
          value:
            process.uptime()
        })

        return
      }

      if (
        message &&
        typeof message === 'object'
      ) {

        if (
          message.type === 'reset'
        ) {
          try {
            global.conn?.ws?.close()
          } catch {}

          process.send?.(
            'reset'
          )
        }

      }

    }
  )
}

// Errores globales

process.on(
  'uncaughtException',
  error => {
    console.error(
      chalk.red(
        '[MAIN] Uncaught Exception:'
      )
    )

    console.error(error)
  }
)

process.on(
  'unhandledRejection',
  error => {
    console.error(
      chalk.red(
        '[MAIN] Unhandled Rejection:'
      )
    )

    console.error(error)
  }
)

// Cerrar proceso

process.on(
  'SIGINT',
  () => {
    console.log('')

    console.log(
      chalk.yellow(
        '[MAIN] Cerrando Exclusive Bot...'
      )
    )

    try {
      global.conn?.ws?.close()
    } catch {}

    closeReadline()

    process.exit(0)
  }
)

// Inicio principal

async function main() {
  createDirectories()
  setupIPC()

  const credsPath = path.join(
    SESSION_DIR,
    'creds.json'
  )

  if (
    fs.existsSync(credsPath)
  ) {
    loginMethod = 'saved'

    console.log(
      chalk.green(
        '[WA] Sesión principal encontrada.'
      )
    )

  } else {
    loginMethod =
      await selectLoginMethod()

    if (
      loginMethod === '2'
    ) {
      phoneNumber =
        await askPhoneNumber()

      closeReadline()
    }
  }

  try {
    const conn =
      await createConnection()

    if (
      loginMethod === '2' &&
      phoneNumber
    ) {
      await requestPairingCode(
        conn
      )
    }

  } catch (error) {
    console.error('')

    console.error(
      chalk.red(
        '[MAIN] Error iniciando Exclusive Bot:'
      )
    )

    console.error(error)

    process.exit(1)
  }
}

main()