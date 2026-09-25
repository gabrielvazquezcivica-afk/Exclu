const handler = async (sock, m) => {
    if (!m?.isGroup) return

    const cleanJid = jid => {
        if (!jid || typeof jid !== 'string') {
            return ''
        }

        return jid
            .split(':')[0]
            .trim()
    }

    const getPN = async jid => {
        const normalized = cleanJid(jid)

        if (!normalized) {
            return ''
        }

        if (!normalized.endsWith('@lid')) {
            return normalized
        }

        try {
            const mapping =
                sock.signalRepository?.lidMapping

            if (!mapping) {
                return ''
            }

            const pn =
                await mapping.getPNForLID(
                    normalized
                )

            return pn || ''
        } catch (error) {
            console.error(
                '[KICKALL] Error resolviendo LID:',
                error
            )

            return ''
        }
    }

    const sender =
        m.sender ||
        m.key?.participant ||
        m.participant ||
        ''

    const botJid =
        sock.user?.id ||
        ''

    const senderPN =
        await getPN(sender)

    const botPN =
        await getPN(botJid)

    if (!senderPN || !botPN) {
        return
    }

    const senderNumber =
        cleanJid(senderPN)
            .replace('@s.whatsapp.net', '')

    const botNumber =
        cleanJid(botPN)
            .replace('@s.whatsapp.net', '')

    if (
        senderNumber !==
        botNumber
    ) {
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
                cleanJid(p?.id) ===
                cleanJid(botJid)
        ) ||
        participants.find(
            async p => {
                const pn =
                    await getPN(p?.id)

                return (
                    pn &&
                    cleanJid(pn) ===
                    cleanJid(botPN)
                )
            }
        )

    let isBotAdmin =
        botParticipant?.admin === 'admin' ||
        botParticipant?.admin === 'superadmin'

    if (!isBotAdmin) {
        for (const participant of participants) {
            const pn =
                await getPN(
                    participant?.id
                )

            if (
                pn &&
                cleanJid(pn) ===
                cleanJid(botPN)
            ) {
                isBotAdmin =
                    participant.admin === 'admin' ||
                    participant.admin === 'superadmin'

                break
            }
        }
    }

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
        await getPN(
            metadata.owner || ''
        )

    const groupOwnerNumber =
        groupOwner
            ? cleanJid(groupOwner)
                .replace('@s.whatsapp.net', '')
            : ''

    const toKick = []

    for (const participant of participants) {
        if (!participant?.id) {
            continue
        }

        const participantPN =
            await getPN(
                participant.id
            )

        if (!participantPN) {
            continue
        }

        const participantNumber =
            cleanJid(participantPN)
                .replace('@s.whatsapp.net', '')

        if (
            participantNumber ===
            botNumber
        ) {
            continue
        }

        if (
            groupOwnerNumber &&
            participantNumber ===
            groupOwnerNumber
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