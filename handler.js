import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { pathToFileURL } from 'url'

const PLUGINS_DIR = path.join(
    process.cwd(),
    'plugins'
)

global.plugins =
    global.plugins ||
    new Map()

global.exclusiveStartedAt =
    global.exclusiveStartedAt ||
    Date.now()

async function resolveLid(
    sock,
    jid
) {

    if (
        !jid ||
        typeof jid !== 'string'
    ) {
        return jid
    }

    if (
        !jid.endsWith('@lid')
    ) {
        return jid
    }

    try {

        const mapping =
            sock?.signalRepository
                ?.lidMapping

        if (
            mapping &&
            typeof mapping.getPNForLID ===
            'function'
        ) {

            const phone =
                await mapping.getPNForLID(
                    jid
                )

            if (
                phone
            ) {
                return phone
            }
        }

    } catch (
        error
    ) {

        console.log(
            chalk.yellow(
                `[LID] No se pudo resolver ${jid}: ${error?.message || error}`
            )
        )
    }

    return jid
}

function getText(m) {

    if (
        !m?.message
    ) {
        return ''
    }

    const message =
        m.message

    if (
        typeof message.conversation ===
        'string'
    ) {
        return message.conversation
    }

    if (
        typeof message.extendedTextMessage?.text ===
        'string'
    ) {
        return message.extendedTextMessage.text
    }

    if (
        typeof message.imageMessage?.caption ===
        'string'
    ) {
        return message.imageMessage.caption
    }

    if (
        typeof message.videoMessage?.caption ===
        'string'
    ) {
        return message.videoMessage.caption
    }

    if (
        typeof message.documentMessage?.caption ===
        'string'
    ) {
        return message.documentMessage.caption
    }

    return ''
}

function getNumber(jid) {

    if (
        !jid
    ) {
        return ''
    }

    return String(jid)
        .split(':')[0]
        .split('@')[0]
        .replace(
            /\D/g,
            ''
        )
}

function isBotMessage(
    sock,
    m
) {

    if (
        m?.key?.fromMe
    ) {
        return true
    }

    const sender =
        m?.key?.participant ||
        m?.participant ||
        m?.key?.remoteJid

    const senderNumber =
        getNumber(
            sender
        )

    if (
        !senderNumber
    ) {
        return false
    }

    const botNumbers = [
        sock?.user?.id,
        sock?.user?.jid,
        sock?.user?.lid
    ]
        .map(
            getNumber
        )
        .filter(
            Boolean
        )

    return botNumbers.includes(
        senderNumber
    )
}

function isOldMessage(m) {

    const timestamp =
        Number(
            m?.messageTimestamp ||
            m?.key?.messageTimestamp ||
            0
        )

    if (
        !timestamp
    ) {
        return false
    }

    const timestampMs =
        timestamp >
        100000000000
            ? timestamp
            : timestamp * 1000

    return (
        timestampMs <
        global.exclusiveStartedAt
    )
}

function commandMatches(
    pluginCommand,
    command
) {

    if (
        typeof pluginCommand ===
        'string'
    ) {

        return (
            pluginCommand.toLowerCase() ===
            command
        )
    }

    if (
        Array.isArray(
            pluginCommand
        )
    ) {

        return pluginCommand.some(
            cmd => {

                if (
                    typeof cmd ===
                    'string'
                ) {

                    return (
                        cmd.toLowerCase() ===
                        command
                    )
                }

                if (
                    cmd instanceof RegExp
                ) {

                    cmd.lastIndex = 0

                    return cmd.test(
                        command
                    )
                }

                return false
            }
        )
    }

    if (
        pluginCommand instanceof RegExp
    ) {

        pluginCommand.lastIndex = 0

        return pluginCommand.test(
            command
        )
    }

    return false
}

async function loadPlugins() {

    if (
        !fs.existsSync(
            PLUGINS_DIR
        )
    ) {

        fs.mkdirSync(
            PLUGINS_DIR,
            {
                recursive: true
            }
        )
    }

    const files =
        fs.readdirSync(
            PLUGINS_DIR
        )
            .filter(
                file =>
                    file.endsWith(
                        '.js'
                    )
            )
            .sort()

    global.plugins.clear()

    for (
        const file of files
    ) {

        try {

            const filePath =
                path.join(
                    PLUGINS_DIR,
                    file
                )

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
                imported.handler

            if (
                !plugin
            ) {
                continue
            }

            if (
                !plugin.command
            ) {

                console.log(
                    chalk.yellow(
                        `[PLUGIN] ${file} no tiene command`
                    )
                )

                continue
            }

            global.plugins.set(
                file,
                plugin
            )

        } catch (
            error
        ) {

            console.error(
                chalk.red(
                    `[PLUGIN] Error cargando ${file}`
                )
            )

            console.error(
                error
            )
        }
    }

    console.log(
        chalk.green(
            `[PLUGIN] ${global.plugins.size} plugin(s) cargado(s).`
        )
    )
}

async function processMessage(
    sock,
    m
) {

    if (
        !m?.key ||
        !m.message
    ) {
        return
    }

    if (
        isBotMessage(
            sock,
            m
        )
    ) {
        return
    }

    if (
        isOldMessage(
            m
        )
    ) {
        return
    }

    const text =
        getText(
            m
        ).trim()

    if (
        !text
    ) {
        return
    }

    if (
        !text.startsWith(
            '.'
        )
    ) {
        return
    }

    const content =
        text
            .slice(1)
            .trim()

    if (
        !content
    ) {
        return
    }

    const parts =
        content.split(
            /\s+/
        )

    const command =
        (
            parts.shift() ||
            ''
        ).toLowerCase()

    const args =
        parts

    m.text =
        text

    m.chat =
        m.key.remoteJid

    const rawSender =
        m.key.participant ||
        m.participant ||
        m.key.remoteJid

    const resolvedSender =
        await resolveLid(
            sock,
            rawSender
        )

    m.sender =
        resolvedSender

    m.senderLid =
        rawSender?.endsWith('@lid')
            ? rawSender
            : null

    m.isGroup =
        m.chat?.endsWith(
            '@g.us'
        ) ||
        false

    for (
        const [
            filename,
            plugin
        ] of global.plugins
    ) {

        if (
            !plugin
        ) {
            continue
        }

        if (
            plugin.disabled
        ) {
            continue
        }

        if (
            !commandMatches(
                plugin.command,
                command
            )
        ) {
            continue
        }

        m.plugin =
            filename

        m.isCommand =
            true

        const extra = {
            command,
            args,
            text: args.join(' '),
            usedPrefix: '.',
            prefix: '.',
            conn: sock,
            sock,
            m,
            message: m,
            chatUpdate: null,
            __dirname: PLUGINS_DIR,
            __filename:
                path.join(
                    PLUGINS_DIR,
                    filename
                )
        }

        try {

            if (
                typeof plugin.before ===
                'function'
            ) {

                const result =
                    await plugin.before(
                        sock,
                        m,
                        extra
                    )

                if (
                    result
                ) {
                    return
                }
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

                await plugin.call(
                    sock,
                    m,
                    extra
                )
            }

        } catch (
            error
        ) {

            console.error(
                chalk.red(
                    `[PLUGIN] ${filename}`
                )
            )

            console.error(
                error
            )

        } finally {

            if (
                typeof plugin.after ===
                'function'
            ) {

                try {

                    await plugin.after(
                        sock,
                        m,
                        extra
                    )

                } catch (
                    error
                ) {

                    console.error(
                        error
                    )
                }
            }
        }

        break
    }
}

export async function handler(
    sock,
    update
) {

    if (
        !update?.messages?.length
    ) {
        return
    }

    await Promise.all(
        update.messages.map(
            async m => {

                try {

                    await processMessage(
                        sock,
                        m
                    )

                } catch (
                    error
                ) {

                    console.error(
                        chalk.red(
                            '[HANDLER]'
                        ),
                        error
                    )
                }
            }
        )
    )
}

export async function initHandler(
    sock
) {

    global.exclusiveStartedAt =
        Date.now()

    await loadPlugins()

    if (
        sock.__exclusiveHandler
    ) {
        return
    }

    sock.__exclusiveHandler =
        true

    sock.ev.on(
        'messages.upsert',
        async update => {

            try {

                await handler(
                    sock,
                    update
                )

            } catch (
                error
            ) {

                console.error(
                    chalk.red(
                        '[HANDLER]'
                    ),
                    error
                )
            }
        }
    )

    console.log(
        chalk.green(
            '[HANDLER] Sistema de comandos iniciado.'
        )
    )
}

export default initHandler