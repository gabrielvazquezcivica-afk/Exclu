import fs from 'fs'
import path from 'path'
import config from '../config.js'

const dbDir = path.join(process.cwd(), 'database')
const dbPath = path.join(dbDir, 'stickers.json')

function loadDB() {
    try {
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true })
        }

        if (!fs.existsSync(dbPath)) {
            fs.writeFileSync(
                dbPath,
                '{}',
                'utf8'
            )
        }

        const data = fs.readFileSync(
            dbPath,
            'utf8'
        )

        return JSON.parse(data || '{}')
    } catch (error) {
        console.error(
            '[STICKER CMD] Error leyendo database/stickers.json:',
            error
        )

        return {}
    }
}

function saveDB(db) {
    try {
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true })
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
    } catch (error) {
        console.error(
            '[STICKER CMD] Error guardando database/stickers.json:',
            error
        )

        throw new Error(
            'No se pudo guardar el comando del sticker.'
        )
    }
}

function getNumber(jid) {
    if (!jid || typeof jid !== 'string') {
        return ''
    }

    return jid
        .split('@')[0]
        .replace(/\D/g, '')
}

function isOwner(jid) {
    const number = getNumber(jid)

    const owners = Array.isArray(config.owner)
        ? config.owner
        : []

    const ownerLids = Array.isArray(config.ownerLid)
        ? config.ownerLid
        : []

    return (
        owners
            .filter(Boolean)
            .map(String)
            .includes(number) ||
        ownerLids
            .filter(Boolean)
            .map(String)
            .includes(
                String(jid)
            )
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
    if (!isOwner(m.sender)) {
        return
    }

    if (!m.quoted) {
        throw new Error(
            'Por favor, responde a un sticker para agregar el comando.'
        )
    }

    const hash =
        getStickerHash(m.quoted)

    if (!hash) {
        throw new Error(
            'El mensaje citado no es un sticker válido.'
        )
    }

    const text =
        args
            ?.join(' ')
            ?.trim() || ''

    if (!text) {
        throw new Error(
            `Falta el texto para el comando.\n\nEjemplo:\n${extra.prefix || '.'}${extra.command || 'addcmd'} hola`
        )
    }

    const sticker = loadDB()

    if (
        sticker[hash] &&
        sticker[hash].locked
    ) {
        throw new Error(
            'No puedes modificar este comando, está bloqueado.'
        )
    }

    sticker[hash] = {
        text,
        mentionedJid:
            Array.isArray(m.mentionedJid)
                ? m.mentionedJid
                : [],
        creator:
            m.sender || '',
        at: Date.now(),
        locked: false
    }

    saveDB(sticker)

    await m.reply(
        'Comando agregado al sticker correctamente.'
    )
}

handler.command = [
    'setcmd',
    'addcmd',
    'cmdadd',
    'cmdset'
]

export default handler