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

    const metadata =
        await sock.groupMetadata(m.chat)

    const participants =
        metadata.participants || []

    const botId =
        sock.user?.id || ''

    const botLid =
        sock.user?.lid || ''

    const clean = jid => {
        if (!jid) return ''

        return jid
            .split(':')[0]
            .trim()
    }

    const senderId =
        clean(sender)

    const possibleBotIds = [
        clean(botId),
        clean(botLid)
    ].filter(Boolean)

    const botParticipant =
        participants.find(
            p => {
                const id =
                    clean(p?.id)

                return possibleBotIds.includes(id)
            }
        )

    if (!botParticipant) {
        return
    }

    if (
        senderId !==
        clean(botParticipant.id)
    ) {
        return
    }

    const isBotAdmin =
        botParticipant.admin === 'admin' ||
        botParticipant.admin === 'superadmin'

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

        if (
            id ===
            clean(botParticipant.id)
        ) {
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