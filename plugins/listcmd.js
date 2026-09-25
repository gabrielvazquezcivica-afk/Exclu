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

function getStickerPath(
    saved
) {
    if (
        !saved ||
        typeof saved.stickerFile !== 'string'
    ) {
        return null
    }

    if (
        !fs.existsSync(
            saved.stickerFile
        )
    ) {
        return null
    }

    return saved.stickerFile
}

const handler = async (
    sock,
    m
) => {
    const sticker =
        loadDB()

    const entries =
        Object.entries(
            sticker
        ).filter(
            ([, data]) =>
                data &&
                typeof data === 'object' &&
                data.command
        )

    if (!entries.length) {
        await m.reply(
            '📋 No hay ningún comando agregado a stickers.'
        )

        return
    }

    await m.reply(
        `📋 *COMANDOS POR STICKER*\n\n📦 Total: ${entries.length}\n\n⏳ Enviando stickers...`
    )

    let index = 0

    for (
        const [, data]
        of entries
    ) {
        index++

        const stickerPath =
            getStickerPath(
                data
            )

        if (!stickerPath) {
            await m.reply(
                `⚠️ Sticker #${index}\n🎯 Comando: ${data.command}\n❌ Archivo del sticker no encontrado.`
            )

            continue
        }

        try {
            const stickerBuffer =
                fs.readFileSync(
                    stickerPath
                )

            await sock.sendMessage(
                m.chat,
                {
                    sticker:
                        stickerBuffer
                }
            )

            await m.reply(
                `🎴 *STICKER #${index}*\n\n🎯 Comando: ${data.command}\n🔒 Estado: ${data.locked ? 'Bloqueado' : 'Disponible'}`
            )
        } catch (error) {
            console.error(
                '[STICKER CMD] Error enviando sticker:',
                error
            )

            await m.reply(
                `⚠️ No se pudo enviar el sticker #${index}.\n🎯 Comando: ${data.command}`
            )
        }
    }
}

handler.command = [
    'listcmd',
    'listcmds',
    'cmds',
    'stickercommands'
]

export default handler