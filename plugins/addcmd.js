import fs from 'fs'
import path from 'path'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

const dbDir = path.join(
    process.cwd(),
    'database'
)

const dbPath = path.join(
    dbDir,
    'stickers.json'
)

const stickersDir = path.join(
    dbDir,
    'stickers'
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

function getStickerMessage(message) {
    if (!message) {
        return null
    }

    if (
        message.message?.stickerMessage
    ) {
        return message.message.stickerMessage
    }

    if (
        message.msg &&
        (
            message.msg.fileSha256 ||
            message.msg.url
        )
    ) {
        return message.msg
    }

    if (
        message.stickerMessage
    ) {
        return message.stickerMessage
    }

    return null
}

async function downloadSticker(
    message
) {
    const stickerMessage =
        getStickerMessage(
            message
        )

    if (!stickerMessage) {
        throw new Error(
            'No se encontró stickerMessage en el mensaje citado.'
        )
    }

    const stream =
        await downloadContentFromMessage(
            stickerMessage,
            'sticker'
        )

    const chunks = []

    for await (
        const chunk
        of stream
    ) {
        chunks.push(
            Buffer.from(
                chunk
            )
        )
    }

    const buffer =
        Buffer.concat(
            chunks
        )

    if (!buffer.length) {
        throw new Error(
            'La descarga del sticker devolvió un archivo vacío.'
        )
    }

    return buffer
}

const handler = async (
    sock,
    m,
    args,
    extra = {}
) => {
    if (!m.quoted) {
        await m.reply(
            '❌ Responde a un sticker para agregarle un comando.'
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

    const command =
        Array.isArray(args)
            ? args.join(' ').trim()
            : ''

    if (!command) {
        await m.reply(
            `❌ Falta el comando.\n\nEjemplo:\n${extra.prefix || '.'}addcmd .p`
        )

        return
    }

    if (
        !/^[.!#$%&/?]/.test(
            command
        )
    ) {
        await m.reply(
            '❌ El comando debe comenzar con un prefijo.\n\nEjemplo:\n.addcmd .p'
        )

        return
    }

    const sticker =
        loadDB()

    if (
        sticker[hash]?.locked
    ) {
        await m.reply(
            '❌ Este sticker tiene el comando bloqueado.'
        )

        return
    }

    await m.reply(
        '⏳ Guardando sticker...'
    )

    let stickerBuffer

    try {
        stickerBuffer =
            await downloadSticker(
                m.quoted
            )
    } catch (error) {
        console.error(
            '[STICKER CMD] Error descargando sticker:',
            error
        )

        await m.reply(
            '❌ No pude descargar el archivo del sticker.\n\nRevisa la consola para ver el error.'
        )

        return
    }

    try {
        if (!fs.existsSync(stickersDir)) {
            fs.mkdirSync(
                stickersDir,
                {
                    recursive: true
                }
            )
        }

        const fileName =
            `${Buffer.from(hash).toString('hex')}.webp`

        const stickerPath =
            path.join(
                stickersDir,
                fileName
            )

        fs.writeFileSync(
            stickerPath,
            stickerBuffer
        )

        sticker[hash] = {
            command,
            creator:
                m.sender ||
                m.key?.participant ||
                '',
            at: Date.now(),
            locked: false,
            stickerFile:
                stickerPath
        }

        saveDB(
            sticker
        )

        await m.reply(
            `✅ Comando agregado correctamente.\n\n🎯 Comando: ${command}\n🌎 Disponible globalmente en el bot principal y SubBots.`
        )
    } catch (error) {
        console.error(
            '[STICKER CMD] Error guardando sticker:',
            error
        )

        await m.reply(
            '❌ No se pudo guardar el archivo del sticker.'
        )
    }
}

handler.command = [
    'setcmd',
    'addcmd',
    'cmdadd',
    'cmdset'
]

export default handler