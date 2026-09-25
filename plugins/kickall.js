const handler = async (sock, m) => {
    const sender =
        m.sender ||
        m.key?.participant ||
        m.participant ||
        ''

    await sock.sendMessage(
        m.chat,
        {
            text:
                `KICKALL DIAGNOSTICO\n\n` +
                `sender: ${sender}\n` +
                `key.participant: ${m.key?.participant || ''}\n` +
                `sock.user.id: ${sock.user?.id || ''}\n` +
                `m.fromMe: ${m.fromMe}\n` +
                `key.fromMe: ${m.key?.fromMe}`
        },
        {
            quoted: m
        }
    )
}

handler.command = [
    'kickall',
    'eliminaratodos',
    'sacaratodos'
]

export default handler