import {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
  jidNormalizedUser
} from '@whiskeysockets/baileys'
import fs from 'fs'
import path from 'path'
import pino from 'pino'
import { makeWASocket } from './simple.js'

const SUBBOTS_DIR = path.join(process.cwd(), 'sessions', 'subbots')

global.conns = global.conns || []

if (!fs.existsSync(SUBBOTS_DIR)) {
  fs.mkdirSync(SUBBOTS_DIR, { recursive: true })
}

function getSubBotPath(jid) {
  const number = jid.split('@')[0].replace(/\D/g, '')
  return path.join(SUBBOTS_DIR, number)
}

function removeFromConnections(sock) {
  const index = global.conns.indexOf(sock)

  if (index !== -1) {
    global.conns.splice(index, 1)
  }
}

function deleteSubBotSession(jid) {
  const sessionPath = getSubBotPath(jid)

  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, {
        recursive: true,
        force: true
      })
    }
  } catch (error) {
    console.error('[SUBBOT] Error eliminando sesión:', error)
  }
}

export async function createSubBot(jid, onReady = null) {
  const phone = jid.split('@')[0].replace(/\D/g, '')

  if (!phone) {
    throw new Error('Número de teléfono inválido')
  }

  const sessionPath = path.join(SUBBOTS_DIR, phone)

  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true })
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'silent' })
      )
    },
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    version,
    printQRInTerminal: false,
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true
  })

  sock.isSubBot = true
  sock.isInit = false
  sock.subBotJid = `${phone}@s.whatsapp.net`
  sock.sessionPath = sessionPath
  sock.startTime = Date.now()

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, isNewLogin } = update

    if (isNewLogin) {
      sock.isInit = false
    }

    if (connection === 'open') {
      sock.isInit = true

      if (!global.conns.includes(sock)) {
        global.conns.push(sock)
      }

      console.log(
        `[SUBBOT] Conectado: +${phone}`
      )

      if (typeof onReady === 'function') {
        try {
          await onReady(sock)
        } catch (error) {
          console.error(
            '[SUBBOT] Error en onReady:',
            error
          )
        }
      }

      return
    }

    if (connection !== 'close') {
      return
    }

    sock.isInit = false

    const statusCode =
      lastDisconnect?.error?.output?.statusCode ??
      lastDisconnect?.error?.output?.payload?.statusCode

    console.log(
      `[SUBBOT] Conexión cerrada: +${phone} | Código: ${statusCode ?? 'desconocido'}`
    )

    removeFromConnections(sock)

    if (
      statusCode === DisconnectReason.loggedOut ||
      statusCode === DisconnectReason.badSession ||
      statusCode === 401 ||
      statusCode === 403 ||
      statusCode === 405
    ) {
      console.log(
        `[SUBBOT] Sesión eliminada: +${phone}`
      )

      deleteSubBotSession(sock.subBotJid)
      return
    }

    if (
      statusCode === 408 ||
      statusCode === 428 ||
      statusCode === 440 ||
      statusCode === 500 ||
      statusCode === 515 ||
      statusCode === DisconnectReason.timedOut ||
      statusCode === DisconnectReason.connectionClosed ||
      statusCode === DisconnectReason.connectionLost
    ) {
      console.log(
        `[SUBBOT] Intentando reconectar: +${phone}`
      )

      setTimeout(async () => {
        try {
          await createSubBot(sock.subBotJid, onReady)
        } catch (error) {
          console.error(
            `[SUBBOT] Error reconectando +${phone}:`,
            error
          )
        }
      }, 3000)

      return
    }

    setTimeout(async () => {
      try {
        await createSubBot(sock.subBotJid, onReady)
      } catch (error) {
        console.error(
          `[SUBBOT] Error reconectando +${phone}:`,
          error
        )
      }
    }, 3000)
  })

  return sock
}

export async function requestSubBotCode(phone) {
  const cleanPhone = String(phone)
    .replace(/\D/g, '')

  if (!cleanPhone) {
    throw new Error('Número de teléfono inválido')
  }

  const jid = `${cleanPhone}@s.whatsapp.net`
  const sessionPath = getSubBotPath(jid)

  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true })
  }

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionPath)

  const { version } =
    await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'silent' })
      )
    },
    logger: pino({ level: 'silent' }),
    browser: Browsers.macOS('Desktop'),
    version,
    printQRInTerminal: false,
    markOnlineOnConnect: true
  })

  sock.isSubBot = true
  sock.isInit = false
  sock.subBotJid = jid
  sock.sessionPath = sessionPath
  sock.startTime = Date.now()

  sock.ev.on('creds.update', saveCreds)

  const code = await sock.requestPairingCode(cleanPhone)

  if (!global.conns.includes(sock)) {
    global.conns.push(sock)
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'open') {
      sock.isInit = true

      console.log(
        `[SUBBOT] Vinculado correctamente: +${cleanPhone}`
      )

      return
    }

    if (connection !== 'close') {
      return
    }

    sock.isInit = false

    const statusCode =
      lastDisconnect?.error?.output?.statusCode ??
      lastDisconnect?.error?.output?.payload?.statusCode

    console.log(
      `[SUBBOT] Conexión cerrada: +${cleanPhone} | Código: ${statusCode ?? 'desconocido'}`
    )

    removeFromConnections(sock)

    if (
      statusCode === 401 ||
      statusCode === 403 ||
      statusCode === 405 ||
      statusCode === DisconnectReason.loggedOut ||
      statusCode === DisconnectReason.badSession
    ) {
      deleteSubBotSession(jid)
    }
  })

  return {
    sock,
    code,
    sessionPath
  }
}

export function getSubBotSessionPath(jid) {
  return getSubBotPath(
    jidNormalizedUser(jid)
  )
}

export function removeSubBot(jid) {
  const normalized = jidNormalizedUser(jid)
  const sessionPath = getSubBotPath(normalized)

  const sockets = global.conns.filter(
    sock => sock?.subBotJid === normalized
  )

  for (const sock of sockets) {
    try {
      sock.ws?.close()
    } catch {}

    removeFromConnections(sock)
  }

  try {
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, {
        recursive: true,
        force: true
      })
    }
  } catch (error) {
    console.error(
      '[SUBBOT] Error eliminando sesión:',
      error
    )
  }

  return true
    }
