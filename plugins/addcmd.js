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

function getStickerMessage(
    quoted
) {
    if (!quoted) {
        return null
    }

    let message =
        quoted.message

    if (!message) {
        return null
    }

    if (
        message.stickerMessage
    ) {
        return message.stickerMessage
    }

    if (
        message.ephemeralMessage
            ?.message
            ?.stickerMessage
    ) {
        return message
            .ephemeralMessage
            .message
            .stickerMessage
    }

    if (
        message.viewOnceMessage
            ?.message
            ?.stickerMessage
    ) {
        return message
            .viewOnceMessage
            .message
            .stickerMessage
    }

    if (
        message.viewOnceMessageV2
            ?.message
            ?.stickerMessage
    ) {
        return message
            .viewOnceMessageV2
            .message
            .stickerMessage
    }

    if (
        message.viewOnceMessageV2Extension
            ?.message
            ?.stickerMessage
    ) {
        return message
            .viewOnceMessageV2Extension
            .message
            .stickerMessage
    }

    return null
}

function getStickerHash(
    quoted
) {
    const stickerMessage =
        getStickerMessage(
            quoted
        )

    if (
        !stickerMessage?.fileSha256
    ) {
        return null
    }

    try {
        return Buffer
            .from(
                stickerMessage.fileSha256
            )
            .toString('base64')
    } catch {
        return null
    }
}

async function downloadSticker(
    quoted
) {
    const stickerMessage =
        getStickerMessage(
            quoted
        )

    if (!stickerMessage) {
        throw new Error(
            'No se encontró stickerMessage en m.quoted.message.'
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
            'El sticker descargado está vacío.'
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

    if (
        m.quoted.mtype !==
        'stickerMessage'
    ) {
        await m.reply(
            '❌ El mensaje citado no es un sticker.'
        )

        return
    }

    const hash =
        getStickerHash(
            m.quoted
        )

    if (!hash) {
        await m.reply(
            '❌ No se pudo obtener la identificación del sticker.'
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
            '❌ No pude descargar el archivo del sticker.'
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