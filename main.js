import process from 'process'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1'

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import chalk from 'chalk'
import pino from 'pino'
import { spawn } from 'child_process'

import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers
} from '@whiskeysockets/baileys'

const ROOT = process.cwd()

const SESSION_DIR = path.join(
  ROOT,
  'sessions',
  'exclusive'
)

const INDEX_FILE = path.join(
  ROOT,
  'index.js'
)

const PORT =
  process.env.PORT ||
  process.env.SERVER_PORT ||
  3000

global.opts = global.opts || {}

global.authFile = SESSION_DIR
global.conn = null
global.sock = null

let rl = null
let child = null
let reconnecting = false
let loginMethod = null
let phoneNumber = null

function createDirectories() {
  const directories = [
    path.join(ROOT, 'sessions'),
    SESSION_DIR,
    path.join(ROOT, 'plugins'),
    path.join(ROOT, 'lib'),
    path.join(ROOT, 'database'),
    path.join(ROOT, 'tmp')
  ]

  for (const directory of directories) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, {
        recursive: true
      })
    }
  }
}

function createReadline() {
  if (rl) return rl

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  })

  return rl
}

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

function closeReadline() {
  if (!rl) return

  try {
    rl.close()
  } catch {}

  rl = null
}

function showBanner() {
  console.log('')
  console.log(
    chalk.cyan(
      '╔══════════════════════════════════════╗'
    )
  )

  console.log(
    chalk.cyan(
      '║          EXCLUSIVE BOT              ║'
    )
  )

  console.log(
    chalk.cyan(
      '╚══════════════════════════════════════╝'
    )
  )

  console.log('')
}

async function selectLoginMethod() {
  const credsPath = path.join(
    SESSION_DIR,
    'creds.json'
  )

  if (fs.existsSync(credsPath)) {
    return 'saved'
  }

  let option

  do {
    console.log(
      chalk.white(
        'Selecciona una opción para iniciar sesión:\n'
      )
    )

    console.log(
      chalk.green(
        '1. Código QR'
      )
    )

    console.log(
      chalk.green(
        '2. Código de vinculación'
      )
    )

    console.log('')

    option = await question(
      chalk.cyan(
        '---> '
      )
    )

    if (
      option !== '1' &&
      option !== '2'
    ) {
      console.log('')
      console.log(
        chalk.red(
          'Por favor, selecciona solamente 1 o 2.'
        )
      )

      console.log('')
    }
  } while (
    option !== '1' &&
    option !== '2'
  )

  return option
}

async function askPhoneNumber() {
  let number = ''

  do {
    number = await question(
      chalk.green(
        '\n🌹 Ingresa el número de WhatsApp\n' +
        chalk.magenta(
          '---> '
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
          'Número inválido. Introduce el número con código de país.'
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

  const socketOptions = {
    version,

    logger: pino({
      level: 'silent'
    }),

    browser:
      loginMethod === '1'
        ? Browsers.macOS('Desktop')
        : Browsers.macOS('Desktop'),

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

    defaultQueryTimeoutMs: undefined
  }

  const conn =
    makeWASocket(
      socketOptions
    )

  global.conn = conn
  global.sock = conn

  conn.ev.on(
    'creds.update',
    saveCreds
  )

  conn.ev.on(
    'connection.update',
    async update => {
      await handleConnectionUpdate(
        conn,
        update
      )
    }
  )

  return conn
}

async function requestPairingCode(conn) {
  if (
    !phoneNumber ||
    loginMethod !== '2'
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
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      )
    )

    console.log(
      chalk.bold.white(
        '🏝️ Código de vinculación:'
      )
    )

    console.log(
      chalk.bold.magenta(
        `      ${code}`
      )
    )

    console.log(
      chalk.gray(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      )
    )

    console.log('')

  } catch (error) {
    console.error(
      chalk.red(
        '❌ No se pudo solicitar el código de vinculación.'
      )
    )

    console.error(
      chalk.gray(
        error?.message ||
        error
      )
    )
  }
}

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
        '[WA] Nueva sesión detectada.'
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
        '\n🌿 Escanea el código QR mostrado en la consola.'
      )
    )
  }

  if (
    connection === 'open'
  ) {
    reconnecting = false

    closeReadline()

    console.log('')
    console.log(
      chalk.green(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      )
    )

    console.log(
      chalk.bold.green(
        '       🌱 CONECTADO CORRECTAMENTE'
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

      console.log(
        chalk.white(
          `       Número: +${number}`
        )
      )
    }

    console.log(
      chalk.green(
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
      )
    )

    console.log('')

    startIndex()

    return
  }

  if (
    connection !== 'close'
  ) {
    return
  }

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
        'La sesión principal fue cerrada.'
      )
    )

    console.log(
      chalk.yellow(
        'Elimina sessions/exclusive y vuelve a iniciar el bot.'
      )
    )

    return
  }

  if (reconnecting) {
    return
  }

  reconnecting = true

  console.log(
    chalk.yellow(
      '[WA] Reconectando en 3 segundos...'
    )
  )

  setTimeout(
    async () => {
      try {
        await createConnection()

        if (
          loginMethod === '2' &&
          !global.conn?.authState?.creds?.registered
        ) {
          await requestPairingCode(
            global.conn
          )
        }
      } catch (error) {
        reconnecting = false

        console.error(
          chalk.red(
            '[WA] Error al reconectar:'
          ),
          error?.message ||
          error
        )
      }
    },
    3000
  )
}

function startIndex() {
  if (child) {
    return
  }

  console.log(
    chalk.cyan(
      '[MAIN] Iniciando index.js...'
    )
  )

  child = spawn(
    process.execPath,
    [INDEX_FILE],
    {
      cwd: ROOT,

      stdio: [
        'inherit',
        'inherit',
        'inherit',
        'ipc'
      ]
    }
  )

  child.on(
    'message',
    async message => {
      if (
        message === 'reset'
      ) {
        await restartBot()
        return
      }

      if (
        message === 'uptime'
      ) {
        child?.send?.({
          type: 'uptime',
          value:
            process.uptime()
        })

        return
      }

      if (
        message?.type === 'reset'
      ) {
        await restartBot()
      }
    }
  )

  child.on(
    'error',
    error => {
      console.error(
        chalk.red(
          '[MAIN] Error en index.js:'
        ),
        error
      )
    }
  )

  child.on(
    'exit',
    (code, signal) => {
      child = null

      console.log(
        chalk.yellow(
          `[MAIN] index.js finalizó. Código: ${code ?? 'null'}`
        )
      )

      if (
        signal === 'SIGTERM' ||
        signal === 'SIGINT'
      ) {
        return
      }
    }
  )
}

async function restartBot() {
  if (reconnecting) {
    return
  }

  reconnecting = true

  console.log(
    chalk.yellow(
      '[MAIN] Reiniciando Exclusive Bot...'
    )
  )

  try {
    if (child) {
      child.kill()
      child = null
    }
  } catch {}

  try {
    global.conn?.ws?.close()
  } catch {}

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        2000
      )
  )

  reconnecting = false

  try {
    await createConnection()

    if (
      loginMethod === '2' &&
      phoneNumber
    ) {
      await requestPairingCode(
        global.conn
      )
    }
  } catch (error) {
    reconnecting = false

    console.error(
      chalk.red(
        '[MAIN] Error reiniciando:'
      ),
      error
    )
  }
}

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
        await restartBot()
      }

      if (
        message === 'uptime'
      ) {
        process.send?.({
          type: 'uptime',
          value:
            process.uptime()
        })
      }

      if (
        message?.type === 'reset'
      ) {
        await restartBot()
      }
    }
  )
}

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
      child?.kill()
    } catch {}

    try {
      global.conn?.ws?.close()
    } catch {}

    closeReadline()

    process.exit(0)
  }
)

async function main() {
  createDirectories()
  showBanner()
  setupIPC()

  const credsPath = path.join(
    SESSION_DIR,
    'creds.json'
  )

  if (
    fs.existsSync(credsPath)
  ) {
    console.log(
      chalk.green(
        '[WA] Sesión existente encontrada.'
      )
    )

    loginMethod = 'saved'
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
      phoneNumber &&
      !conn.authState?.creds?.registered
    ) {
      await requestPairingCode(
        conn
      )
    }
  } catch (error) {
    console.error(
      chalk.red(
        '[MAIN] Error iniciando WhatsApp:'
      )
    )

    console.error(error)

    process.exit(1)
  }
}

main()