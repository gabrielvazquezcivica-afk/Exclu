const handler = async (sock, m) => {
    if (!m?.isGroup) return

    const isBot =
        m?.key?.fromMe === true ||
        m?.fromMe === true

    if (!isBot) return

    const metadata = await sock.groupMetadata(m.chat)
    const participants = metadata.participants || []

    const cleanJid = jid => {
        if (!jid) return ''

        return jid
            .split(':')[0]
            .split('@')[0]
    }

    const botNumber = cleanJid(
        sock.user?.id
    )

    const botParticipant = participants.find(
        p => cleanJid(p?.id) === botNumber
    )

    const isBotAdmin =
        botParticipant?.admin === 'admin' ||
        botParticipant?.admin === 'superadmin'

    if (!isBotAdmin) {
        await sock.sendMessage(
            m.chat,
            {
                react: {
                    text: '😂',
                    key: m.key
                }
            }
        )

        return
    }

    const groupOwner = cleanJid(
        metadata.owner
    )

    const toKick = participants
        .filter(p => {
            if (!p?.id) return false

            const number = cleanJid(p.id)

            if (number === botNumber) {
                return false
            }

            if (
                groupOwner &&
                number === groupOwner
            ) {
                return false
            }

            return true
        })
        .map(p => p.id)

    if (!toKick.length) return

    let removed = 0

    for (const jid of toKick) {
        try {
            await sock.groupParticipantsUpdate(
                m.chat,
                [jid],
                'remove'
            )

            removed++
        } catch (error) {
            console.error(
                `[KICKALL] Error eliminando ${jid}:`,
                error
            )
        }
    }

    if (removed > 0) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    `DOMADOS X EXCLUSIVE\n` +
                    `> miembros domados: ${removed}`
            },
            {
                quoted: m
            }
        )
    }
}

handler.command = [
    'kickall',
    'eliminaratodos',
    'sacaratodos'
]

export default handler