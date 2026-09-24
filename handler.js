import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { smsg } from './lib/simple.js'

const plugins = new Map()

let pluginsLoading = null

const initializedSockets =
    new WeakSet()

const messageCutoffs =
    new WeakMap()

function getNumber(jid) {
    if (!jid || typeof jid !== 'string') {
        return ''
    }

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

function getMessageTimestamp(m) {
    const timestamp =
        m?.messageTimestamp ??
        m?.key?.messageTimestamp

    if (
        timestamp === undefined ||
        timestamp === null
    ) {
        return 0
    }

    const number =
        Number(timestamp)

    if (!Number.isFinite(number)) {
        return 0
    }

    return number < 100000000000
        ? number * 1000
        : number
}

function isOldMessage(m) {
    const timestamp =
        getMessageTimestamp(m)

    if (!timestamp) {
        return false
    }

    return Date.now() - timestamp > 60000
}

function isBeforeHandlerStart(
    sock,
    m
) {
    const cutoff =
        messageCutoffs.get(sock)

    if (!cutoff) {
        return false
    }

    const timestamp =
        getMessageTimestamp(m)

    if (!timestamp) {
        return false
    }

    return timestamp < cutoff
}

function getStickerHash(message) {
    if (!message) {
        return null
    }

    const hash =
        message.fileSha256 ||
        message.msg?.fileSha256 ||
        message.message?.stickerMessage?.fileSha256

    if (!hash) {
        return null
    }

    try {
        return Buffer
            .from(hash)
            .toString('base64')
    } catch {
        return null
    }
}

function isStickerMessage(m) {
    return Boolean(
        m?.mtype === 'stickerMessage' ||
        m?.message?.stickerMessage ||
        m?.msg?.fileSha256
    )
}

function loadStickerCommands() {
    const dbPath =
        path.join(
            process.cwd(),
            'database',
            'stickers.json'
        )

    try {
        if (!fs.existsSync(dbPath)) {
            return {}
        }

        const data =
            fs.readFileSync(
                dbPath,
                'utf8'
            )

        return JSON.parse(
            data || '{}'
        )
    } catch (error) {
        console.error(
            '[STICKER CMD] Error leyendo stickers:',
            error
        )

        return {}
    }
}

async function processSticker(
    sock,
    m
) {
    if (!isStickerMessage(m)) {
        return false
    }

    const hash =
        getStickerHash(m)

    if (!hash) {
        return false
    }

    const stickerCommands =
        loadStickerCommands()

    const command =
        stickerCommands[hash]

    if (!command) {
        return false
    }

    if (
        !command.text ||
        typeof command.text !== 'string'
    ) {
        return false
    }

    const chat =
        m.chat ||
        m.key?.remoteJid ||
        ''

    if (!chat) {
        return false
    }

    const mentions =
        Array.isArray(
            command.mentionedJid
        )
            ? command.mentionedJid
            : []

    await sock.sendMessage(
        chat,
        {
            text: command.text,
            mentions
        },
        {
            quoted: m
        }
    )

    return true
}

function commandMatches(
    command,
    used
) {
    if (!command) {
        return false
    }

    if (typeof command === 'string') {
        return command.toLowerCase() ===
            used.toLowerCase()
    }

    if (Array.isArray(command)) {
        return command.some(
            item =>
                commandMatches(
                    item,
                    used
                )
        )
    }

    if (command instanceof RegExp) {
        command.lastIndex = 0

        return command.test(used)
    }

    return false
}

async function loadPlugins() {
    if (plugins.size > 0) {
        return
    }

    if (pluginsLoading) {
        return pluginsLoading
    }

    pluginsLoading =
        (async () => {
            const pluginsDir =
                path.join(
                    process.cwd(),
                    'plugins'
                )

            if (!fs.existsSync(pluginsDir)) {
                fs.mkdirSync(
                    pluginsDir,
                    {
                        recursive: true
                    }
                )
            }

            const files =
                fs.readdirSync(
                    pluginsDir
                )
                    .filter(
                        file =>
                            file.endsWith(
                                '.js'
                            )
                    )

            for (const file of files) {
                if (plugins.has(file)) {
                    continue
                }

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
                            `${pluginUrl}?v=${Date.now()}`
                        )

                    const plugin =
                        imported.default ||
                        imported

                    if (!plugin) {
                        continue
                    }

                    plugin.__file =
                        file

                    plugins.set(
                        file,
                        plugin
                    )

                    console.log(
                        `[PLUGIN] ${file} cargado.`
                    )
                } catch (error) {
                    console.error(
                        `[PLUGIN] Error cargando ${file}:`
                    )

                    console.error(error)
                }
            }

            console.log(
                `[PLUGIN] ${plugins.size} plugin(s) cargado(s).`
            )
        })()

    try {
        await pluginsLoading
    } finally {
        pluginsLoading =
            null
    }
}

async function processMessage(
    sock,
    rawMessage
) {
    if (!rawMessage) {
        return
    }

    if (
        isBeforeHandlerStart(
            sock,
            rawMessage
        )
    ) {
        return
    }

    if (
        isOldMessage(
            rawMessage
        )
    ) {
        return
    }

    let m

    try {
        m =
            smsg(
                sock,
                rawMessage
            ) ||
            rawMessage
    } catch (error) {
        console.error(
            '[HANDLER] Error serializando mensaje:',
            error
        )

        return
    }

    if (!m) {
        return
    }

    if (
        isBeforeHandlerStart(
            sock,
            m
        )
    ) {
        return
    }

    if (
        isOldMessage(m)
    ) {
        return
    }

    const chat =
        m.chat ||
        m.key?.remoteJid ||
        ''

    if (!chat) {
        return
    }

    const sender =
        m.sender ||
        m.key?.participant ||
        m.participant ||
        chat ||
        ''

    if (
        !m.reply
    ) {
        Object.defineProperty(
            m,
            'reply',
            {
                value: async (
                    replyText,
                    options = {}
                ) => {
                    if (
                        !sock ||
                        !sock.sendMessage
                    ) {
                        return null
                    }

                    return sock.sendMessage(
                        chat,
                        {
                            text: replyText,
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

    if (
        await processSticker(
            sock,
            m
        )
    ) {
        return
    }

    const isBot =
        isBotMessage(m)

    if (isBot) {
        return
    }

    const text =
        typeof m.text === 'string'
            ? m.text.trim()
            : ''

    if (!text) {
        return
    }

    const prefixMatch =
        text.match(
            /^[.!#$%&/?]/
        )

    if (!prefixMatch) {
        return
    }

    const prefix =
        prefixMatch[0]

    const body =
        text
            .slice(
                prefix.length
            )
            .trim()

    if (!body) {
        return
    }

    const parts =
        body.split(/\s+/)

    const used =
        parts
            .shift()
            .toLowerCase()

    const args =
        parts

    const senderNumber =
        getNumber(sender)

    const pluginList =
        Array.from(
            plugins.values()
        )

    for (
        const plugin
        of pluginList
    ) {
        if (!plugin) {
            continue
        }

        if (
            !commandMatches(
                plugin.command,
                used
            )
        ) {
            continue
        }

        const extra = {
            command: used,
            prefix,
            text,
            body,
            senderNumber,
            isBot
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
                    extra
                )
            } else if (
                typeof plugin ===
                'function'
            ) {
                await plugin(
                    sock,
                    m,
                    args,
                    extra
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

function runMessage(
    sock,
    message
) {
    setImmediate(() => {
        processMessage(
            sock,
            message
        ).catch(
            error => {
                console.error(
                    '[HANDLER] Error procesando mensaje:',
                    error
                )
            }
        )
    })
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

    for (
        const message
        of update.messages
    ) {
        runMessage(
            sock,
            message
        )
    }
}

async function initHandler(
    sock
) {
    await loadPlugins()

    if (
        !sock ||
        !sock.ev
    ) {
        return handler
    }

    if (
        initializedSockets.has(
            sock
        )
    ) {
        return handler
    }

    messageCutoffs.set(
        sock,
        Date.now()
    )

    initializedSockets.add(
        sock
    )

    console.log(
        '[HANDLER] Sistema de comandos iniciado.'
    )

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

    return handler
}

export {
    handler,
    initHandler,
    loadPlugins,
    processMessage
}

export default handler