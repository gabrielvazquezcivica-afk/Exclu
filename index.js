import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  watchFile,
  unwatchFile,
  existsSync,
  mkdirSync
} from 'fs'
import cfonts from 'cfonts'
import { createInterface } from 'readline'
import yargs from 'yargs'
import chalk from 'chalk'
import { spawn } from 'child_process'

const __dirname = dirname(
  fileURLToPath(import.meta.url)
)

const { say } = cfonts

const rl = createInterface(
  process.stdin,
  process.stdout
)

// Crear carpetas necesarias

function verify() {
  const dirs = [
    'tmp',
    'sessions',
    'sessions/exclusive',
    'sessions/subbots',
    'plugins',
    'lib',
    'database'
  ]

  for (const dir of dirs) {
    const folder = join(__dirname, dir)

    if (!existsSync(folder)) {
      mkdirSync(folder, {
        recursive: true
      })
    }
  }
}

verify()

// Banner de Exclusive Bot

say('exclusive bot', {
  font: 'block',
  align: 'center',
  colors: ['cyan', 'white'],
  background: 'black'
})

say('Exclusive Bot', {
  font: 'console',
  align: 'center',
  colors: ['magenta']
})

// Variables del proceso

let isRunning = false
let child = null

// Iniciar main.js

function start(file) {
  if (isRunning) return

  isRunning = true

  const filePath = join(
    __dirname,
    file
  )

  const args = [
    filePath,
    ...process.argv.slice(2)
  ]

  console.log('')

  console.log(
    chalk.cyan(
      '[EXCLUSIVE] Iniciando main.js...'
    )
  )

  console.log('')

  child = spawn(
    process.execPath,
    args,
    {
      cwd: __dirname,
      stdio: [
        'inherit',
        'inherit',
        'inherit',
        'ipc'
      ]
    }
  )

  // Mensajes enviados desde main.js

  child.on(
    'message',
    data => {
      if (data === 'reset') {
        try {
          child.kill()
        } catch {}

        isRunning = false
        start(file)
        return
      }

      if (data === 'uptime') {
        if (
          child &&
          child.connected
        ) {
          child.send(
            process.uptime()
          )
        }

        return
      }

      if (
        data &&
        typeof data === 'object' &&
        data.type === 'reset'
      ) {
        try {
          child.kill()
        } catch {}

        isRunning = false
        start(file)
      }
    }
  )

  // Error del proceso

  child.on(
    'error',
    error => {
      console.error(
        chalk.red(
          '[EXCLUSIVE] Error iniciando main.js:'
        ),
        error?.message || error
      )
    }
  )

  // Cuando main.js termina

  child.on(
    'exit',
    (code, signal) => {
      isRunning = false
      child = null

      if (
        signal === 'SIGINT' ||
        signal === 'SIGTERM'
      ) {
        return
      }

      console.error(
        chalk.red(
          `[EXCLUSIVE] main.js terminó con código: ${code ?? 'null'}`
        )
      )

      process.exit(
        code ?? 0
      )
    }
  )

  // Recibir comandos enviados desde la consola

  const opts = yargs(
    process.argv.slice(2)
  )
    .exitProcess(false)
    .parse()

  if (!opts.test) {
    if (!rl.listenerCount('line')) {
      rl.on(
        'line',
        line => {
          if (
            child &&
            child.connected
          ) {
            child.send(
              line.trim()
            )
          }
        }
      )
    }
  }

  // Vigilar cambios en main.js

  watchFile(
    filePath,
    () => {
      unwatchFile(filePath)

      console.log(
        chalk.yellow(
          '[EXCLUSIVE] main.js fue modificado. Reiniciando...'
        )
      )

      if (child) {
        try {
          child.kill()
        } catch {}
      }

      isRunning = false
      start(file)
    }
  )
}

// Advertencia de demasiados listeners

process.on(
  'warning',
  warning => {
    if (
      warning.name ===
      'MaxListenersExceededWarning'
    ) {
      console.warn(
        chalk.yellow(
          '⚠️ Se excedió el límite de listeners.'
        )
      )

      console.warn(
        warning.stack
      )
    }
  }
)

// Cerrar correctamente

process.on(
  'SIGINT',
  () => {
    console.log('')

    console.log(
      chalk.yellow(
        '[EXCLUSIVE] Cerrando bot...'
      )
    )

    if (child) {
      try {
        child.kill()
      } catch {}
    }

    try {
      rl.close()
    } catch {}

    process.exit(0)
  }
)

// Iniciar el bot

start('main.js')