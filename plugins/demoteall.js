let handler = {}

handler.command = [
    'demoteall',
    'degradartodos',
    'quitaradmins'
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

            const number =
                getNumber(p.id)

            if (
                number === botNumber
            ) {
                return true
            }

            if (
                botLidNumber &&
                number === botLidNumber
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
                    text: '🗣️',
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

    const admins =
        participants
            .filter(p => {
                if (!p?.id) return false

                const isAdmin =
                    p.admin === 'admin' ||
                    p.admin === 'superadmin'

                if (!isAdmin) {
                    return false
                }

                const number =
                    getNumber(p.id)

                if (
                    number === botNumber
                ) {
                    return false
                }

                if (
                    botLidNumber &&
                    number === botLidNumber
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

    if (!admins.length) {
        return
    }

    try {
        await sock.groupParticipantsUpdate(
            m.chat,
            admins,
            'demote'
        )

        await sock.sendMessage(
            m.chat,
            {
                text:
                    `🔻 ADMINS DEGRADADOS\n` +
                    `> administradores degradados: ${admins.length}`
            },
            {
                quoted: m
            }
        )
    } catch (error) {
        console.error(
            '[DEMOTEALL] Error:',
            error?.message || error
        )
    }
}

export default handler