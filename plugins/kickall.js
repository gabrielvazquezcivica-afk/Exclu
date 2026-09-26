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

    const botId =
        sock.user?.id || ''

    const botLid =
        sock.user?.lid || ''

    const getNumber = jid => {
        if (!jid) return ''

        return jid
            .split(':')[0]
            .split('@')[0]
    }

    const botNumber =
        getNumber(botId)

    const botLidNumber =
        getNumber(botLid)

    const botParticipant =
        participants.find(p => {
            if (!p?.id) return false

            const participantNumber =
                getNumber(p.id)

            if (
                participantNumber ===
                botNumber
            ) {
                return true
            }

            if (
                botLidNumber &&
                participantNumber ===
                botLidNumber
            ) {
                return true
            }

            if (
                p.lid &&
                p.lid === botLid
            ) {
                return true
            }

            return false
        })

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
        getNumber(groupOwner)

    const toKick =
        participants
            .filter(p => {
                if (!p?.id) return false

                const number =
                    getNumber(p.id)

                if (
                    number === botNumber ||
                    (
                        botLidNumber &&
                        number === botLidNumber
                    )
                ) {
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
                error?.message || error
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