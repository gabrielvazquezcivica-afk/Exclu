import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import chalk from 'chalk'

import {
  connect,
  setOwnMessageHandler
} from './lib/connection.js'

const PREFIX = '.'

const ROOT = process.cwd()
const PLUGINS_DIR = path.join(ROOT, 'plugins')
const LIB_DIR = path.join(ROOT, 'lib')
const DATABASE_DIR = path.join(ROOT, 'database')

const START_TIME = Date.now()

const plugins = new Map()
const commandQueue = []

let processingQueue = false
let sock = null

global.plugins = plugins
global.conns = global.conns || []

global.botStartTime = START_TIME
global.commandQueue = commandQueue

const specialCommands = new Map()

function ensureDirectories() {
  const directories = [
    PLUGINS_DIR,
    LIB_DIR,
    DATABASE_DIR
  ]

  for (const directory of directories) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
  }
}

function getText(message) {
  if (!message) return ''

  if (typeof message.conversation === 'string') {
    return message.conversation
  }

  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text
  }

  if (message.imageMessage?.caption) {
    return message.imageMessage.caption
  }

  if (message.videoMessage?.caption) {
    return message.videoMessage.caption
  }

  if (message.documentMessage?.caption) {
    return message.documentMessage.caption
  }

  return ''
}

function getMessageText(m) {
  if (!m?.message) return ''
  return getText(m.message)
}

function getSender(m) {
  if (!m?.key) return 'Desconocido'

  if (m.key.participant) {
    return m.key.participant
  }

  if (m.key.remoteJid) {
    return m.key.remoteJid
  }

  return 'Desconocido'
}

function getPhone(jid) {
  if (!jid) return 'Desconocido'

  return jid
    .split('@')[0]
    .replace(/\D/g, '') || 'Desconocido'
}

function isGroup(m) {
  return m?.key?.remoteJid?.endsWith('@g.us') === true
}

async function getGroupName(m) {
  if (!isGroup(m) || !sock) {
    return 'Chat privado'
  }

  try {
    const metadata = await sock.groupMetadata(m.key.remoteJid)
    return metadata?.subject || 'Grupo desconocido'
  } catch {
    return 'Grupo desconocido'
  }
}

function isBotMessage(m) {
  if (!m?.key) return false

  if (m.key.fromMe === true) {
    return true
  }

  const sender = m.key.participant || m.key.remoteJid

  if (!sender || !sock?.user?.id) {
    return false
  }

  const botNumber = sock.user.id.split(':')[0]
  const senderNumber = sender.split('@')[0].split(':')[0]

  return botNumber === senderNumber
}

function parseCommand(text) {
  if (!text || !text.startsWith(PREFIX)) {
    return null
  }

  const withoutPrefix = text.slice(PREFIX.length).trim()

  if (!withoutPrefix) {
    return null
  }

  const parts = withoutPrefix.split(/\s+/)

  const command = parts.shift()?.toLowerCase()

  if (!command) {
    return null
  }

  return {
    command,
    args: parts
  }
}

function parseSpecialCommand(text) {
  if (!text) return null

  const clean = text.trim().toLowerCase()

  if (!specialCommands.has(clean)) {
    return null
  }

  return {
    command: specialCommands.get(clean),
    args: []
  }
}

function normalizeCommands(command) {
  if (!command) return []

  if (Array.isArray(command)) {
    return command
      .filter(Boolean)
      .map(item => String(item).toLowerCase())
  }

  return [String(command).toLowerCase()]
}

async function loadPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    return
  }

  const files = fs
    .readdirSync(PLUGINS_DIR)
    .filter(file => file.endsWith('.js'))

  for (const file of files) {
    await loadPlugin(file)
  }

  console.log(
    chalk.green(`[PLUGINS] ${plugins.size} comando(s) cargado(s).`)
  )
}

async function loadPlugin(file) {
  const filePath = path.join(PLUGINS_DIR, file)

  try {
    const url = `${pathToFileURL(filePath).href}?update=${Date.now()}`

    const imported = await import(url)

    const handler =
      imported.default ||
      imported.handler

    if (!handler) {
      console.log(
        chalk.yellow(`[PLUGINS] ${file} no exporta un handler.`)
      )
      return
    }

    const commands = normalizeCommands(handler.command)

    if (commands.length === 0) {
      console.log(
        chalk.yellow(`[PLUGINS] ${file} no tiene handler.command.`)
      )
      return
    }

    for (const command of commands) {
      plugins.set(command, {
        ...handler,
        file
      })
    }

    console.log(
      chalk.cyan(`[PLUGIN] ${file} → ${commands.join(', ')}`)
    )
  } catch (error) {
    console.error(
      chalk.red(`[PLUGINS] Error cargando ${file}:`),
      error.message
    )
  }
}

async function reloadPlugin(file) {
  const filePath = path.join(PLUGINS_DIR, file)

  if (!fs.existsSync(filePath)) {
    return
  }

  for (const [command, plugin] of plugins.entries()) {
    if (plugin.file === file) {
      plugins.delete(command)
    }
  }

  await loadPlugin(file)
}

function watchPlugins() {
  fs.watch(
    PLUGINS_DIR,
    async (event, filename) => {
      if (!filename || !filename.endsWith('.js')) {
        return
      }

      if (event === 'change' || event === 'rename') {
        setTimeout(async () => {
          try {
            await reloadPlugin(filename)
            console.log(
              chalk.green(`[PLUGINS] Recargado: ${filename}`)
            )
          } catch (error) {
            console.error(
              chalk.red(`[PLUGINS] Error recargando ${filename}:`),
              error.message
            )
          }
        }, 300)
      }
    }
  )
}

function commandLog(m, text, groupName) {
  const sender = getSender(m)
  const phone = getPhone(sender)

  const pushName =
    m?.pushName ||
    m?.verifiedBizName ||
    'Usuario'

  const type = isGroup(m)
    ? 'GRUPO'
    : 'PRIVADO'

  console.log('')
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(chalk.cyan('⚡ NUEVO COMANDO'))
  console.log(chalk.white(`👤 Usuario: ${pushName}`))
  console.log(chalk.white(`📱 Número: +${phone}`))
  console.log(chalk.white(`💬 Tipo: ${type}`))
  console.log(chalk.white(`📍 Lugar: ${groupName}`))
  console.log(chalk.white(`📝 Comando: ${text}`))
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
}

function enqueueCommand(data) {
  commandQueue.push(data)
  processQueue()
}

async function processQueue() {
  if (processingQueue) return

  processingQueue = true

  while (commandQueue.length > 0) {
    const data = commandQueue.shift()

    try {
      await executeCommand(data)
    } catch (error) {
      console.error(
        chalk.red('[COMMAND] Error:'),
        error
      )
    }
  }

  processingQueue = false
}

async function executeCommand(data) {
  const {
    m,
    command,
    args,
    text
  } = data

  const plugin = plugins.get(command)

  if (!plugin) {
    return
  }

  if (typeof plugin.run !== 'function') {
    console.log(
      chalk.yellow(`[COMMAND] ${command} no tiene handler.run`)
    )
    return
  }

  const groupName = await getGroupName(m)

  commandLog(
    m,
    text,
    groupName
  )

  await plugin.run(
    sock,
    m,
    args
  )
}

function registerSpecialCommands() {
  // Los alias especiales pueden agregarse aquí.
  // Ejemplo:
  // specialCommands.set('hola bot', 'menu')
}

function handleIncomingMessage(m) {
  if (!m?.key) {
    return
  }

  if (isBotMessage(m)) {
    return
  }

  const messageTimestamp =
    Number(m.messageTimestamp || 0) * 1000

  if (
    messageTimestamp &&
    messageTimestamp < START_TIME
  ) {
    return
  }

  const text = getMessageText(m)

  if (!text) {
    return
  }

  const commandData =
    parseCommand(text) ||
    parseSpecialCommand(text)

  if (!commandData) {
    return
  }

  if (!plugins.has(commandData.command)) {
    return
  }

  enqueueCommand({
    m,
    command: commandData.command,
    args: commandData.args,
    text
  })
}

function setupOwnMessageHandler() {
  try {
    if (typeof setOwnMessageHandler === 'function') {
      setOwnMessageHandler(message => {
        return
      })
    }
  } catch (error) {
    console.error(
      chalk.yellow('[INDEX] No se pudo configurar ownMessageHandler:'),
      error.message
    )
  }
}

function setupIPC() {
  if (!process.send) {
    return
  }

  process.on('message', async data => {
    if (!data) return

    if (typeof data === 'string') {
      if (data === 'reset') {
        process.send?.('reset')
        return
      }

      if (data === 'uptime') {
        process.send?.({
          type: 'uptime',
          value: process.uptime()
        })
        return
      }

      return
    }

    if (data.type === 'uptime') {
      process.send?.({
        type: 'uptime',
        value: process.uptime()
      })
    }
  })
}

async function start() {
  ensureDirectories()

  console.log(
    chalk.cyan('[INDEX] Iniciando Exclusive Bot...')
  )

  console.log(
    chalk.gray(`[INDEX] Inicio: ${new Date(START_TIME).toLocaleString()}`)
  )

  registerSpecialCommands()

  await loadPlugins()

  watchPlugins()

  setupIPC()

  setupOwnMessageHandler()

  try {
    sock = await connect()

    if (!sock) {
      throw new Error('connection.js no devolvió un socket')
    }

    global.sock = sock

    console.log(
      chalk.green('[INDEX] Socket principal iniciado.')
    )

    console.log(
      chalk.green(`[INDEX] Comandos disponibles: ${plugins.size}`)
    )

    if (sock.ev) {
      sock.ev.on(
        'messages.upsert',
        async update => {
          if (!update?.messages) return

          for (const message of update.messages) {
            handleIncomingMessage(message)
          }
        }
      )
    }

    console.log(
      chalk.green('[INDEX] Sistema de comandos activo.')
    )
  } catch (error) {
    console.error(
      chalk.red('[INDEX] Error iniciando el bot:')
    )

    console.error(error)

    setTimeout(() => {
      if (process.send) {
        process.send('reset')
      } else {
        process.exit(1)
      }
    }, 5000)
  }
}

process.on('uncaughtException', error => {
  console.error(
    chalk.red('[INDEX] Uncaught Exception:')
  )

  console.error(error)
})

process.on('unhandledRejection', error => {
  console.error(
    chalk.red('[INDEX] Unhandled Rejection:')
  )

  console.error(error)
})

process.on('SIGINT', () => {
  console.log(
    chalk.yellow('[INDEX] Cerrando Exclusive Bot...')
  )

  try {
    sock?.ws?.close()
  } catch {}

  process.exit(0)
})

process.on('SIGTERM', () => {
  try {
    sock?.ws?.close()
  } catch {}

  process.exit(0)
})

start()