import { join, dirname } from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { watchFile, unwatchFile } from 'fs'
import cfonts from 'cfonts'
import { createInterface } from 'readline'
import yargs from 'yargs'
import { spawn } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(__dirname)

const { name, description, author, version } = require(join(__dirname, './package.json'))

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
})

cfonts.say('exclusive', {
  font: 'block',
  align: 'center',
  colors: ['cyan', 'white'],
  background: 'black'
})

cfonts.say('Exclusive Bot', {
  font: 'console',
  align: 'center',
  colors: ['magenta']
})

console.log('')
console.log(`Nombre: ${name}`)
console.log(`Versión: ${version}`)
console.log(`Autor: ${author || 'Exclusive'}`)
console.log('')

let isRunning = false
let child = null
let restarting = false

function start(file) {
  if (isRunning) return

  isRunning = true

  const filePath = join(__dirname, file)
  const args = [filePath, ...process.argv.slice(2)]

  console.log('[MAIN] Iniciando Exclusive Bot...')

  child = spawn(
    process.execPath,
    args,
    {
      cwd: __dirname,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc']
    }
  )

  child.on('message', data => {
    if (data === 'reset') {
      restart(file)
      return
    }

    if (data === 'uptime') {
      if (child && child.connected) {
        child.send({
          type: 'uptime',
          value: process.uptime()
        })
      }
    }
  })

  child.on('error', error => {
    console.error('[MAIN] Error del proceso:', error)
  })

  child.on('exit', (code, signal) => {
    isRunning = false

    if (restarting) {
      restarting = false
      return
    }

    console.log('')
    console.log(`[MAIN] Exclusive Bot terminó.`)
    console.log(`[MAIN] Código: ${code ?? 'null'}`)
    console.log(`[MAIN] Señal: ${signal ?? 'ninguna'}`)
    console.log('')

    process.exit(code || 0)
  })

  const opts = yargs(process.argv.slice(2))
    .exitProcess(false)
    .parse()

  if (!opts.test) {
    if (!rl.listenerCount('line')) {
      rl.on('line', line => {
        const input = line.trim()

        if (!input) return

        if (child && child.connected) {
          child.send({
            type: 'stdin',
            value: input
          })
        }
      })
    }
  }

  watchFile(filePath, { interval: 1000 }, () => {
    console.log('')
    console.log('[MAIN] Cambio detectado en index.js.')
    console.log('[MAIN] Reiniciando Exclusive Bot...')

    unwatchFile(filePath)

    restart(file)
  })
}

function restart(file) {
  if (restarting) return

  restarting = true
  isRunning = false

  if (child) {
    try {
      child.kill()
    } catch {}
  }

  child = null

  setTimeout(() => {
    start(file)
  }, 1000)
}

process.on('warning', warning => {
  if (warning.name === 'MaxListenersExceededWarning') {
    console.warn('[MAIN] Advertencia de listeners:')
    console.warn(warning.stack)
  }
})

process.on('uncaughtException', error => {
  console.error('[MAIN] Error no controlado:')
  console.error(error)
})

process.on('unhandledRejection', error => {
  console.error('[MAIN] Promesa rechazada:')
  console.error(error)
})

process.on('SIGINT', () => {
  console.log('')
  console.log('[MAIN] Cerrando Exclusive Bot...')

  if (child) {
    try {
      child.kill()
    } catch {}
  }

  try {
    rl.close()
  } catch {}

  process.exit(0)
})

start('index.js')