import fs from 'fs'
import path from 'path'
import {
  createSubBot
} from './subbot.js'

const SUBBOTS_DIR = path.join(
  process.cwd(),
  'sessions',
  'subbots'
)

global.conns = global.conns || []

if (!fs.existsSync(SUBBOTS_DIR)) {
  fs.mkdirSync(SUBBOTS_DIR, {
    recursive: true
  })
}

function getSessionFolders() {
  try {
    return fs.readdirSync(SUBBOTS_DIR).filter(name => {
      const folder = path.join(SUBBOTS_DIR, name)

      try {
        return fs.statSync(folder).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

function hasValidCredentials(folder) {
  const sessionPath = path.join(
    SUBBOTS_DIR,
    folder
  )

  const credsPath = path.join(
    sessionPath,
    'creds.json'
  )

  if (!fs.existsSync(credsPath)) {
    return false
  }

  try {
    const creds = JSON.parse(
      fs.readFileSync(credsPath, 'utf8')
    )

    return !!creds
  } catch {
    return false
  }
}

export async function startSubBots() {
  const folders = getSessionFolders()

  if (folders.length === 0) {
    console.log(
      '[SUBBOT] No hay sesiones guardadas.'
    )
    return
  }

  let connected = 0

  for (const folder of folders) {
    if (!hasValidCredentials(folder)) {
      console.log(
        `[SUBBOT] Sesión inválida: ${folder}`
      )
      continue
    }

    const jid = `${folder}@s.whatsapp.net`

    const alreadyConnected =
      global.conns.some(
        sock =>
          sock?.isSubBot &&
          sock?.subBotJid === jid
      )

    if (alreadyConnected) {
      continue
    }

    try {
      await createSubBot(jid)

      connected++

      console.log(
        `[SUBBOT] Cargando sesión: +${folder}`
      )
    } catch (error) {
      console.error(
        `[SUBBOT] No se pudo cargar +${folder}:`,
        error.message
      )
    }
  }

  console.log(
    `[SUBBOT] Se cargaron ${connected} sesión(es).`
  )
}

export async function checkSubBots() {
  const sockets = [...global.conns]

  for (const sock of sockets) {
    if (!sock?.isSubBot) {
      continue
    }

    if (!sock.user) {
      removeSocket(sock)
      continue
    }

    const ws = sock.ws

    if (!ws) {
      removeSocket(sock)
      continue
    }

    const socket = ws.socket

    if (!socket) {
      continue
    }

    const readyState = socket.readyState

    if (readyState === 3) {
      removeSocket(sock)
    }
  }
}

function removeSocket(sock) {
  const index =
    global.conns.indexOf(sock)

  if (index !== -1) {
    global.conns.splice(index, 1)
  }

  try {
    sock.ws?.close()
  } catch {}
}

export function getActiveSubBots() {
  return global.conns.filter(
    sock =>
      sock?.isSubBot &&
      sock?.user &&
      sock?.ws?.socket &&
      sock.ws.socket.readyState === 1
  )
}

export function getSubBot(jid) {
  return global.conns.find(
    sock =>
      sock?.isSubBot &&
      sock?.subBotJid === jid
  )
}

export function getSubBotCount() {
  return getActiveSubBots().length
}