const handler = async (
    sock,
    m
) => {
    if (!m.isGroup) {
        return
    }

    const metadata =
        await sock.groupMetadata(
            m.chat
        )

    const participants =
        metadata.participants || []

    const botJid =
        sock.user?.id || ''

    const normalize = jid =>
        (jid || '')
            .split(':')[0]
            .split('@')[0]

    const botNumber =
        normalize(botJid)

    const senderNumber =
        normalize(
            m.sender ||
            m.key?.participant ||
            ''
        )

    if (
        !m.key?.fromMe &&
        senderNumber !== botNumber
    ) {
        return
    }

    const botParticipant =
        participants.find(
            p =>
                normalize(p.id) ===
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
        metadata.owner || ''

    const toKick =
        participants
            .filter(p => {
                const id =
                    p.id

                if (!id) {
                    return false
                }

                if (
                    normalize(id) ===
                    botNumber
                ) {
                    return false
                }

                if (
                    groupOwner &&
                    normalize(id) ===
                        normalize(groupOwner)
                ) {
                    return false
                }

                return true
            })
            .map(p => p.id)

    if (!toKick.length) {
        return
    }

    try {
        await sock.groupParticipantsUpdate(
            m.chat,
            toKick,
            'remove'
        )

        await sock.sendMessage(
            m.chat,
            {
                text:
                    `DOMADOS X EXCLUSIVE\n` +
                    `> miembros domados: ${toKick.length}`
            }
        )
    } catch (error) {
        console.error(
            '[KICKALL]',
            error
        )
    }
}

handler.command = [
    'kickall',
    'eliminaratodos',
    'sacaratodos'
]

handler.group = true

export default handler