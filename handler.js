import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { smsg } from './lib/simple.js'

const plugins = new Map()

function getNumber(jid) {
    if (!jid || typeof jid !== 'string') return ''

    return jid
        .split('@')[0]
        .replace(/\D/g, '')
}

function isBotMessage(m) {
    return Boolean(
        m?.key?.fromMe ||
        m?.fromMe
    )
}

function isOldMessage(m) {
    if (!m?.messageTimestamp) return false

    const timestamp =
        Number(m.messageTimestamp) * 1000

    if (!Number.isFinite(timestamp)) {
        return false
    }

    return Date.now() - timestamp > 60000
}

function commandMatches(command, used) {
    if (!command) return false

    if (typeof command === 'string') {
        return command.toLowerCase() ===
            used.toLowerCase()
    }

    if (Array.isArray(command)) {
        return command.some(
            item => commandMatches(item, used)
        )
    }

    if (command instanceof RegExp) {
        command.lastIndex = 0
        return command.test(used)
    }

    return false
}

async function loadPlugins() {
    plugins.clear()

    const pluginsDir =
        path.join(
            process.cwd(),
            'plugins'
        )

    if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(
            pluginsDir,
            { recursive: true }
        )
    }

    const files =
        fs.readdirSync(pluginsDir)
            .filter(file =>
                file.endsWith('.js')
            )

    for (const file of files) {
        const filePath =
            path.join(
                pluginsDir,
                file
            )

        try {
            const pluginUrl =
                pathToFileURL(
                    filePath
                ).href

            const imported =
                await import(
                    `${pluginUrl}?update=${Date.now()}`
                )

            const plugin =
                imported.default ||
                imported

            if (!plugin) continue

            plugin.__file = file

            plugins.set(
                file,
                plugin
            )

            console.log(
                `[PLUGIN] ${file} cargado.`
            )
        } catch (error) {
            console.error(
                `[PLUGIN] Error cargando ${file}`
            )

            console.error(error)
        }
    }

    console.log(
        `[PLUGIN] ${plugins.size} plugin(s) cargado(s).`
    )
}

async function processMessage(
    sock,
    rawMessage
) {
    if (!rawMessage) return

    let m

    try {
        m =
            smsg(
                sock,
                rawMessage
            ) || rawMessage
    } catch (error) {
        console.error(
            '[HANDLER] Error serializando mensaje:',
            error
        )

        return
    }

    if (!m) return

    if (isOldMessage(m)) {
        return
    }

    const chat =
        m.chat ||
        m.key?.remoteJid ||
        ''

    const sender =
        m.sender ||
        m.key?.participant ||
        m.participant ||
        chat ||
        ''

    const text =
        typeof m.text === 'string'
            ? m.text.trim()
            : ''

    m.senderNumber =
        getNumber(sender)

    m.isBot =
        isBotMessage(m)

    if (!m.reply) {
        Object.defineProperty(
            m,
            'reply',
            {
                value: async (
                    text,
                    options = {}
                ) => {
                    return sock.sendMessage(
                        chat,
                        {
                            text,
                            ...options
                        },
                        {
                            quoted: m
                        }
                    )
                },
                configurable: true
            }
        )
    }

    if (!text) return

    const prefixMatch =
        text.match(
            /^[.!#$%&/?]/
        )

    if (!prefixMatch) return

    const prefix =
        prefixMatch[0]

    const body =
        text
            .slice(prefix.length)
            .trim()

    if (!body) return

    const parts =
        body.split(/\s+/)

    const used =
        parts
            .shift()
            .toLowerCase()

    const args =
        parts

    for (const plugin of plugins.values()) {
        if (!plugin) continue

        if (
            !commandMatches(
                plugin.command,
                used
            )
        ) {
            continue
        }

        try {
            if (
                typeof plugin.before ===
                'function'
            ) {
                await plugin.before(
                    sock,
                    m
                )
            }

            if (
                typeof plugin.run ===
                'function'
            ) {
                await plugin.run(
                    sock,
                    m,
                    args,
                    {
                        command: used,
                        prefix,
                        text,
                        body
                    }
                )
            } else if (
                typeof plugin ===
                'function'
            ) {
                await plugin(
                    sock,
                    m,
                    args
                )
            }
        } catch (error) {
            console.error(
                `[PLUGIN] Error ejecutando ${plugin.__file || used}:`
            )

            console.error(error)
        }

        break
    }
}

async function handler(
    sock,
    update
) {
    if (
        !update ||
        !Array.isArray(
            update.messages
        )
    ) {
        return
    }

    await Promise.all(
        update.messages.map(
            message =>
                processMessage(
                    sock,
                    message
                )
        )
    )
}

async function initHandler(sock) {
    await loadPlugins()

    console.log(
        '[HANDLER] Sistema de comandos iniciado.'
    )

    if (
        sock &&
        sock.ev
    ) {
        sock.ev.on(
            'messages.upsert',
            update => {
                handler(
                    sock,
                    update
                ).catch(
                    error => {
                        console.error(
                            '[HANDLER] Error procesando mensajes:',
                            error
                        )
                    }
                )
            }
        )
    }

    return handler
}

export {
    handler,
    initHandler,
    loadPlugins,
    processMessage
}

export default handler