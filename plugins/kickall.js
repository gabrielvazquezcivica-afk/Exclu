let handler = {}

handler.command = [
    'kickall',
    'eliminaratodos',
    'sacaratodos'
]

handler.run = async (sock, m) => {
    if (!m.isGroup) return

    const sender =
        m.sender ||
        m.key?.participant ||
        ''

    const botId =
        sock.user?.id ||
        ''

    const botLid =
        sock.user?.lid ||
        ''

    const normalize = jid => {
        if (!jid) return ''

        return jid
            .split(':')[0]
            .trim()
    }

    const senderId =
        normalize(sender)

    const mainBotId =
        normalize(botId)

    const mainBotLid =
        normalize(botLid)

    const isBot =
        senderId === mainBotId ||
        senderId === mainBotLid

    if (!isBot) {
        return
    }

    const metadata =
        await sock.groupMetadata(
            m.chat
        )

    const participants =
        metadata.participants || []

    const botParticipant =
        participants.find(
            p =>
                normalize(p?.id) ===
                senderId
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
        metadata.owner || ''

    const groupOwnerId =
        normalize(groupOwner)

    const toKick =
        participants
            .filter(p => {
                if (!p?.id) return false

                const id =
                    normalize(p.id)

                if (id === senderId) {
                    return false
                }

                if (
                    groupOwnerId &&
                    id === groupOwnerId
                ) {
                    return false
                }

                return true
            })
            .map(p => p.id)

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