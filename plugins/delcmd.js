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
    m
) => {
    if (!m.quoted) {
        await m.reply(
            '❌ Responde al sticker cuyo comando quieres borrar.'
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

    const sticker =
        loadDB()

    if (!sticker[hash]) {
        await m.reply(
            '❌ Este sticker no tiene ningún comando registrado.'
        )

        return
    }

    if (
        sticker[hash].locked
    ) {
        await m.reply(
            '❌ Este comando está bloqueado y no puede eliminarse.'
        )

        return
    }

    const command =
        sticker[hash].command ||
        sticker[hash].text ||
        ''

    delete sticker[hash]

    try {
        saveDB(sticker)
    } catch (error) {
        console.error(
            '[STICKER CMD] Error eliminando:',
            error
        )

        await m.reply(
            '❌ No se pudo eliminar el comando.'
        )

        return
    }

    await m.reply(
        `✅ Comando del sticker eliminado correctamente.${command ? `\n\n🗑️ Comando eliminado: ${command}` : ''}`
    )
}

handler.command = [
    'delcmd',
    'deletecmd',
    'removecmd',
    'unsetcmd'
]

export default handler