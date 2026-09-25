const handler = async (
    sock,
    m,
    args,
    extra = {}
) => {
    await sock.sendMessage(
        m.chat,
        {
            text:
                `KICKALL RECIBIDO\n` +
                `fromMe: ${m.key?.fromMe}\n` +
                `m.fromMe: ${m.fromMe}\n` +
                `isBot: ${extra.isBot}`
        }
    )
}

handler.command = [
    'kickall',
    'eliminaratodos',
    'sacaratodos'
]

handler.group = true

export default handler