const handler = async (sock, m) => {
    await sock.sendMessage(
        m.chat,
        {
            text:
                `KICKALL RECIBIDO\n` +
                `fromMe: ${m.key?.fromMe}\n` +
                `m.fromMe: ${m.fromMe}\n` +
                `chat: ${m.chat}`
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