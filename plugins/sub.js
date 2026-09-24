import fs from 'fs'
import path from 'path'

const SUBBOTS_DIR = path.join(
    process.cwd(),
    'sessions',
    'subbots'
)

let handler = {}

handler.command = [
    'deletesesion',
    'deletebot',
    'deletesession',
    'deletesesaion',
    'stop',
    'pausarai',
    'pausarbot',
    'bots',
    'listjadibots',
    'subbots'
]

function getNumber(jid) {
    if (!jid) return ''

    return String(jid)
        .split(':')[0]
        .split('@')[0]
        .replace(/\D/g, '')
}

function getState(socket) {
    if (!socket?.ws?.socket) {
        return '🔴 Desconectado'
    }

    const state =
        socket.ws.socket.readyState

    if (state === 0) {
        return '🟡 Conectando'
    }

    if (state === 1) {
        return '🟢 Activo'
    }

    if (state === 2) {
        return '🟠 Cerrando'
    }

    if (state === 3) {
        return '🔴 Cerrado'
    }

    return '⚪ Desconocido'
}

function formatTime(startTime) {
    if (
        !startTime ||
        Number.isNaN(
            Number(startTime)
        )
    ) {
        return '0s'
    }

    const elapsed =
        Math.max(
            0,
            Date.now() -
                Number(startTime)
        )

    const totalSeconds =
        Math.floor(
            elapsed / 1000
        )

    const days =
        Math.floor(
            totalSeconds / 86400
        )

    const hours =
        Math.floor(
            (totalSeconds % 86400) /
                3600
        )

    const minutes =
        Math.floor(
            (totalSeconds % 3600) /
                60
        )

    const seconds =
        totalSeconds % 60

    const parts = []

    if (days > 0) {
        parts.push(`${days}d`)
    }

    if (hours > 0) {
        parts.push(`${hours}h`)
    }

    if (minutes > 0) {
        parts.push(`${minutes}m`)
    }

    if (
        seconds > 0 ||
        parts.length === 0
    ) {
        parts.push(`${seconds}s`)
    }

    return parts.join(' ')
}

function getStartTime(socket) {
    if (
        socket?.connectionStartTime
    ) {
        return Number(
            socket.connectionStartTime
        )
    }

    if (
        socket?.startTime
    ) {
        return Number(
            socket.startTime
        )
    }

    if (
        socket?.uptime
    ) {
        return Number(
            socket.uptime
        )
    }

    return Date.now()
}

function closeSocket(socket) {
    try {
        socket?.ws?.close()
    } catch {}

    try {
        socket?.ev?.removeAllListeners()
    } catch {}

    const index =
        global.conns.indexOf(
            socket
        )

    if (index !== -1) {
        global.conns.splice(
            index,
            1
        )
    }
}

function deleteSession(number) {
    const sessionPath =
        path.join(
            SUBBOTS_DIR,
            number
        )

    if (
        !fs.existsSync(
            sessionPath
        )
    ) {
        return false
    }

    fs.rmSync(
        sessionPath,
        {
            recursive: true,
            force: true
        }
    )

    return true
}

handler.run = async (
    sock,
    m,
    args,
    extra
) => {
    const command =
        String(
            extra?.command ||
            ''
        ).toLowerCase()

    // Eliminar sesión

    if (
        [
            'deletesesion',
            'deletebot',
            'deletesession',
            'deletesesaion'
        ].includes(command)
    ) {
        let target =
            m.key?.participant ||
            m.sender

        if (
            args[0] &&
            /^\d+$/.test(
                args[0]
            )
        ) {
            target =
                `${args[0]}@s.whatsapp.net`
        }

        const number =
            getNumber(target)

        if (!number) {
            await sock.sendMessage(
                m.chat,
                {
                    text:
                        '❌ No se encontró la sesión.'
                },
                {
                    quoted: m
                }
            )

            return
        }

        const sockets =
            [
                ...global.conns
            ].filter(
                socket =>
                    socket?.isSubBot &&
                    getNumber(
                        socket.subBotJid ||
                        socket.user?.id
                    ) === number
            )

        for (
            const socket of sockets
        ) {
            closeSocket(
                socket
            )
        }

        const deleted =
            deleteSession(
                number
            )

        if (!deleted) {
            await sock.sendMessage(
                m.chat,
                {
                    text:
                        `❌ No existe una sesión de subbot para +${number}.`
                },
                {
                    quoted: m
                }
            )

            return
        }

        await sock.sendMessage(
            m.chat,
            {
                text:
                    `🗑️ La sesión del SubBot +${number} fue eliminada.`
            },
            {
                quoted: m
            }
        )

        return
    }

    // Detener subbot

    if (
        [
            'stop',
            'pausarai',
            'pausarbot'
        ].includes(command)
    ) {
        let target =
            m.key?.participant ||
            m.sender

        if (
            args[0] &&
            /^\d+$/.test(
                args[0]
            )
        ) {
            target =
                `${args[0]}@s.whatsapp.net`
        }

        const number =
            getNumber(target)

        const socket =
            global.conns.find(
                item =>
                    item?.isSubBot &&
                    getNumber(
                        item.subBotJid ||
                        item.user?.id
                    ) === number
            )

        if (!socket) {
            await sock.sendMessage(
                m.chat,
                {
                    text:
                        '❌ No se encontró el SubBot conectado.'
                },
                {
                    quoted: m
                }
            )

            return
        }

        closeSocket(
            socket
        )

        await sock.sendMessage(
            m.chat,
            {
                text:
                    `⏸️ SubBot +${number} detenido.`
            },
            {
                quoted: m
            }
        )

        return
    }

    // Lista de subbots

    if (
        [
            'bots',
            'listjadibots',
            'subbots'
        ].includes(command)
    ) {
        const sockets =
            [
                ...new Set(
                    global.conns.filter(
                        socket =>
                            socket?.isSubBot &&
                            socket?.user
                    )
                )
            ]

        if (
            sockets.length === 0
        ) {
            await sock.sendMessage(
                m.chat,
                {
                    text:
                        '🌐 *SubBots conectados*\n\nNo hay SubBots conectados.'
                },
                {
                    quoted: m
                }
            )

            return
        }

        const list =
            sockets.map(
                (
                    socket,
                    index
                ) => {
                    const number =
                        getNumber(
                            socket.subBotJid ||
                            socket.user?.id
                        )

                    const name =
                        socket.user?.name ||
                        socket.user?.verifiedName ||
                        'SubBot'

                    const startTime =
                        getStartTime(
                            socket
                        )

                    const state =
                        getState(
                            socket
                        )

                    return [
                        `*${index + 1}. ${name}*`,
                        `📱 +${number}`,
                        `🔗 Estado: ${state}`,
                        `⏱️ Conectado: ${formatTime(startTime)}`,
                        `📅 Desde: ${new Date(startTime).toLocaleString('es-MX')}`
                    ].join('\n')
                }
            )
            .join(
                '\n\n> ───────────────\n\n'
            )

        const response =
            [
                '🌐 *SubBots conectados*',
                '',
                `🤖 *Total activos:* ${sockets.length}`,
                '',
                list,
                '',
                '💡 El tiempo se actualiza en cada consulta.'
            ].join('\n')

        await sock.sendMessage(
            m.chat,
            {
                text: response
            },
            {
                quoted: m
            }
        )
    }
}

export default handler