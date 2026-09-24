import { areJidsSameUser } from '@whiskeysockets/baileys'

let handler = {}

handler.run = async (
sock,
m,
args
) => {
const from =
m.key?.remoteJid || ''

let target = null

if (m.quoted?.key) {
    target =
        m.quoted.key.participant ||
        m.quoted.key.remoteJid
}

else if (
    m.message?.extendedTextMessage
        ?.contextInfo
        ?.mentionedJid
        ?.length
) {
    target =
        m.message
            .extendedTextMessage
            .contextInfo
            .mentionedJid[0]
}

else {
    target =
        m.key?.participant ||
        m.key?.remoteJid
}

if (!target) {
    await sock.sendMessage(
        from,
        {
            text:
                '❌ No pude identificar al usuario.'
        },
        {
            quoted: m
        }
    )

    return
}

let lid = null
let jid = null

if (from.endsWith('@g.us')) {
    try {
        const metadata =
            await sock.groupMetadata(
                from
            )

        const participante =
            metadata.participants.find(
                p => {
                    const ids = [
                        p.id,
                        p.jid,
                        p.lid
                    ].filter(Boolean)

                    return ids.some(
                        id =>
                            id === target ||
                            areJidsSameUser(
                                id,
                                target
                            )
                    )
                }
            )

        if (participante) {
            lid =
                participante.lid ||
                (
                    participante.id?.endsWith(
                        '@lid'
                    )
                        ? participante.id
                        : null
                )

            jid =
                participante.jid ||
                (
                    participante.id?.endsWith(
                        '@s.whatsapp.net'
                    )
                        ? participante.id
                        : null
                )
        }
    } catch {}
}

if (!lid && target.endsWith('@lid')) {
    lid = target
}

if (
    !jid &&
    target.endsWith('@s.whatsapp.net')
) {
    jid = target
}

lid =
    lid ||
    'No encontrado'

jid =
    jid ||
    'No encontrado'

const texto =
    [
        '╭───〔 IDENTIDAD 〕───',
        `│`,
        `│ LID`,
        `│ ${lid}`,
        `│`,
        `│ JID`,
        `│ ${jid}`,
        `│`,
        '╰────────────────────'
    ].join('\n')

await sock.sendMessage(
    from,
    {
        text: texto
    },
    {
        quoted: m
    }
)

}

handler.command = [
'lid',
'idlid'
]

handler.help = [
'lid'
]

handler.tags = [
'informacion'
]

handler.menu = true

export default handler