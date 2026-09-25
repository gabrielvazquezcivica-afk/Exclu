const handler = async (
    sock,
    m
) => {
    if (!m.isGroup) {
        return
    }

    const botJid =
        sock.user?.id || ''

    const sender =
        m.sender || ''

    const isBot =
        m.fromMe ||
        sender === botJid ||
        sender.split('@')[0] === botJid.split('@')[0]

    if (!isBot) {
        return
    }

    const metadata =
        await sock.groupMetadata(
            m.chat
        )

    const participants =
        metadata.participants || []

    const groupOwner =
        metadata.owner || ''

    const toKick =
        participants
            .filter(p => {
                const id = p.id

                if (!id) {
                    return false
                }

                if (
                    id === botJid ||
                    id.split('@')[0] === botJid.split('@')[0]
                ) {
                    return false
                }

                if (
                    groupOwner &&
                    id === groupOwner
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