import fs from 'fs'
import path from 'path'

const dbDir = path.join(
    process.cwd(),
    'database'
)

const dbPath = path.join(
    dbDir,
    'stickers.json'
)

function loadDB() {
    try {
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(
                dbDir,
                {
                    recursive: true
                }
            )
        }

        if (!fs.existsSync(dbPath)) {
            fs.writeFileSync(
                dbPath,
                '{}',
                'utf8'
            )
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

function saveDB(db) {
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(
            dbDir,
            {
                recursive: true
            }
        )
    }

    fs.writeFileSync(
        dbPath,
        JSON.stringify(
            db,
            null,
            2
        ),
        'utf8'
    )
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

const handler = async (
    sock,
    m,
    args,
    extra = {}
) => {
    if (!m.quoted) {
        await m.reply(
            '❌ Por favor, responde a un sticker para agregar el comando.'
        )

        return
    }

    const hash =
        getStickerHash(
            m.quoted
        )

    if (!hash) {
        await m.reply(
            '❌ El mensaje citado no es un sticker válido.'
        )

        return
    }

    const text =
        Array.isArray(args)
            ? args.join(' ').trim()
            : ''

    if (!text) {
        const prefix =
            extra.prefix || '.'

        const command =
            extra.command || 'addcmd'

        await m.reply(
            `❌ Falta el texto para el comando.\n\nUso:\n${prefix}${command} <texto>\n\nEjemplo:\n${prefix}${command} hola`
        )

        return
    }

    const sticker =
        loadDB()

    if (
        sticker[hash] &&
        sticker[hash].locked
    ) {
        await m.reply(
            '❌ No puedes modificar este comando, está bloqueado.'
        )

        return
    }

    sticker[hash] = {
        text,
        mentionedJid:
            Array.isArray(
                m.mentionedJid
            )
                ? m.mentionedJid
                : [],
        creator:
            m.sender ||
            m.key?.participant ||
            '',
        at:
            Date.now(),
        locked: false
    }

    try {
        saveDB(sticker)
    } catch (error) {
        await m.reply(
            '❌ No se pudo guardar el comando del sticker.'
        )

        return
    }

    await m.reply(
        '✅ Comando agregado al sticker correctamente.\n\n🌎 Este sticker funcionará globalmente en todos los grupos donde esté el bot o un SubBot.'
    )
}

handler.command = [
    'setcmd',
    'addcmd',
    'cmdadd',
    'cmdset'
]

export default handler