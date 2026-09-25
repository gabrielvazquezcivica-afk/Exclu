let handler = {}

handler.command = [
    'kickall',
    'eliminaratodos',
    'sacaratodos'
]

handler.run = async (sock, m, args, extra = {}) => {
    if (!m.isGroup) return

    if (!extra.isBot) {
        return
    }

    const metadata =
        await sock.groupMetadata(m.chat)

    const participants =
        metadata.participants || []

    const botJid =
        sock.user?.id || ''

    const clean = jid => {
        if (!jid) return ''

        return jid
            .split(':')[0]
            .split('@')[0]
    }

    const botNumber =
        clean(botJid)

    const botParticipant =
        participants.find(
            p =>
                clean(p?.id) ===
                botNumber
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

    const groupOwner =
        clean(metadata.owner)

    const toKick = []

    for (const participant of participants) {
        if (!participant?.id) {
            continue
        }

        const id =
            clean(participant.id)

        if (id === botNumber) {
            continue
        }

        if (
            groupOwner &&
            id === groupOwner
        ) {
            continue
        }

        toKick.push(
            participant.id
        )
    }

    if (!toKick.length) {
        return
    }

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
                '[KICKALL] Error:',
                error
            )
        }
    }

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

export default handler
