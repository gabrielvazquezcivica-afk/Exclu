let handler = {}

handler.command = [
    'kickall',
    'eliminaratodos',
    'sacaratodos'
]

handler.run = async (sock, m) => {
    if (!m.isGroup) return

    const metadata =
        await sock.groupMetadata(m.chat)

    const participants =
        metadata.participants || []

    const botJid =
        sock.user?.id || ''

    const botNumber =
        botJid
            .split(':')[0]
            .split('@')[0]

    const botParticipant =
        participants.find(
            p =>
                p.id
                    ?.split(':')[0]
                    .split('@')[0] ===
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

    const ownerNumber =
        groupOwner
            .split(':')[0]
            .split('@')[0]

    const toKick =
        participants
            .filter(p => {
                if (!p?.id) return false

                const number =
                    p.id
                        .split(':')[0]
                        .split('@')[0]

                if (number === botNumber) {
                    return false
                }

                if (
                    ownerNumber &&
                    number === ownerNumber
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
