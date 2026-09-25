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

    const cleanJid = jid => {
        if (!jid) {
            return ''
        }

        return jid
            .split(':')[0]
            .split('@')[0]
    }

    const botNumber =
        cleanJid(botJid)

    const botParticipant =
        participants.find(
            p =>
                cleanJid(p.id) ===
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
        cleanJid(groupOwner)

    const toKick =
        participants
            .filter(p => {
                const id =
                    p.id

                if (!id) {
                    return false
                }

                const number =
                    cleanJid(id)

                if (
                    number ===
                    botNumber
                ) {
                    return false
                }

                if (
                    ownerNumber &&
                    number ===
                        ownerNumber
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

    for (
        const jid
        of toKick
    ) {
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
            }
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