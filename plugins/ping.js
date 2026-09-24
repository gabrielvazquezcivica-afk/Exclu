let handler = {}

handler.command = ['p']

handler.run = async (sock, m) => {
    const inicio = Date.now()

    const msg = await sock.sendMessage(m.chat, {
        text: '🏓 Calculando...'
    })

    const ping = Date.now() - inicio

    await sock.sendMessage(m.chat, {
        text: `🏓 Pong!\n\n⚡ Velocidad: ${ping} ms`
    })
}

export default handler