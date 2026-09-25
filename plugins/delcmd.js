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

function deleteStickerFile(
    saved
) {
    if (!saved) {
        return
    }

    const stickerFile =
        saved.stickerFile

    if (
        stickerFile &&
        typeof stickerFile === 'string' &&
        fs.existsSync(stickerFile)
    ) {
        try {
            fs.unlinkSync(
                stickerFile
            )

            return
        } catch (error) {
            console.error(
                '[STICKER CMD] Error eliminando archivo:',
                error
            )
        }
    }

    const commandHash =
        saved.hash

    if (!commandHash) {
        return
    }

    const fileName =
        `${Buffer.from(commandHash).toString('hex')}.webp`

    const filePath =
        path.join(
            stickersDir,
            fileName
        )

    if (
        fs.existsSync(
            filePath
        )
    ) {
        try {
            fs.unlinkSync(
                filePath
            )
        } catch (error) {
            console.error(
                '[STICKER CMD] Error eliminando archivo:',
                error
            )
        }
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

    const saved =
        sticker[hash]

    if (!saved) {
        await m.reply(
            '❌ Este sticker no tiene ningún comando registrado.'
        )

        return
    }

    if (
        saved.locked
    ) {
        await m.reply(
            '❌ Este comando está bloqueado y no puede eliminarse.'
        )

        return
    }

    const command =
        saved.command ||
        saved.text ||
        ''

    deleteStickerFile(
        {
            ...saved,
            hash
        }
    )

    delete sticker[hash]

    try {
        saveDB(
            sticker
        )
    } catch (error) {
        console.error(
            '[STICKER CMD] Error eliminando:',
            error
        )

        await m.reply(
            '❌ No se pudo actualizar la base de datos.'
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