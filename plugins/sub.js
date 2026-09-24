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
if (!jid) {
return ''
}

return String(jid)
    .split(':')[0]
    .split('@')[0]
    .replace(/\D/g, '')

}

function isMainBot(sock) {
return Boolean(
sock?.isMainBot === true ||
sock === global.conn
)
}

function isOwner(m, extra) {
if (extra?.isOwner === true) {
return true
}

if (m?.isOwner === true) {
    return true
}

if (m?.senderNumber && global.owner) {
    const sender =
        String(m.senderNumber)
            .replace(/\D/g, '')

    const owners = Array.isArray(global.owner)
        ? global.owner
        : [global.owner]

    return owners.some(owner => {
        const number =
            typeof owner === 'object'
                ? owner?.number ||
                  owner?.id ||
                  owner?.jid
                : owner

        return (
            getNumber(number) ===
            sender
        )
    })
}

return false

}

function getState(socket) {
if (!socket?.ws?.socket) {
return '🔴 Desconectado'
}

const state =
    socket.ws.socket.readyState

if (state === 0) return '🟡 Conectando'
if (state === 1) return '🟢 Activo'
if (state === 2) return '🟠 Cerrando'
if (state === 3) return '🔴 Cerrado'

return '⚪ Desconocido'

}

function formatTime(startTime) {
if (!startTime) {
return 'Desconocido'
}

const elapsed =
    Date.now() - startTime

if (elapsed < 0) {
    return '0 segundos'
}

const seconds =
    Math.floor(elapsed / 1000)

const minutes =
    Math.floor(seconds / 60)

const hours =
    Math.floor(minutes / 60)

const days =
    Math.floor(hours / 24)

if (days > 0) {
    return `${days} día(s), ${hours % 24} hora(s)`
}

if (hours > 0) {
    return `${hours} hora(s), ${minutes % 60} minuto(s)`
}

if (minutes > 0) {
    return `${minutes} minuto(s), ${seconds % 60} segundo(s)`
}

return `${seconds} segundo(s)`

}

function getStartTime(socket) {
if (socket?.startTime) {
return socket.startTime
}

if (socket?.connectedAt) {
    return socket.connectedAt
}

if (socket?.createdAt) {
    return socket.createdAt
}

return Date.now()

}

function getSubBots() {
return [
...new Set(
(global.conns || [])
.filter(
socket =>
socket?.isSubBot &&
socket?.user &&
socket?.isPairingSocket !== true
)
)
]
}

function getSubBotByIndex(index) {
const sockets =
getSubBots()

if (
    !Number.isInteger(index) ||
    index < 1 ||
    index > sockets.length
) {
    return null
}

return sockets[index - 1]

}

function closeSocket(socket) {
if (!socket) {
return
}

try {
    socket.ws?.close()
} catch {}

try {
    socket.ev?.removeAllListeners()
} catch {}

const index =
    (global.conns || []).indexOf(
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

if (!fs.existsSync(sessionPath)) {
    return false
}

try {
    fs.rmSync(
        sessionPath,
        {
            recursive: true,
            force: true
        }
    )

    return true
} catch {
    return false
}

}

async function removeSubBotSafely(
number,
socket
) {
try {
const module =
await import(
'../lib/resetsb.js'
)

    if (
        typeof module.removeSubBot ===
        'function'
    ) {
        return await module.removeSubBot(
            number
        )
    }
} catch {}

closeSocket(socket)

await new Promise(
    resolve =>
        setTimeout(
            resolve,
            500
        )
)

return deleteSession(number)

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

const listCommands = [
    'bots',
    'listjadibots',
    'subbots'
]

const deleteCommands = [
    'deletesesion',
    'deletebot',
    'deletesession',
    'deletesesaion'
]

const stopCommands = [
    'stop',
    'pausarai',
    'pausarbot'
]

if (
    listCommands.includes(
        command
    )
) {
    if (!isMainBot(sock)) {
        return
    }

    const sockets =
        getSubBots()

    if (sockets.length === 0) {
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
        sockets
            .map(
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
            '💡 Para detener: .stop 1',
            '🗑️ Para eliminar: .deletesesion 1'
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

    return
}

if (
    deleteCommands.includes(
        command
    )
) {
    if (!isMainBot(sock)) {
        return
    }

    if (!isOwner(m, extra)) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    '❌ Solo el owner puede eliminar SubBots.'
            },
            {
                quoted: m
            }
        )

        return
    }

    const index =
        Number(
            args?.[0]
        )

    if (
        !Number.isInteger(index) ||
        index < 1
    ) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    '❌ Debes indicar el número del SubBot que quieres eliminar.\n\nEjemplo:\n.deletesesion 1\n.deletesesion 2\n\nUsa .bots para ver la lista.'
            },
            {
                quoted: m
            }
        )

        return
    }

    const socket =
        getSubBotByIndex(index)

    if (!socket) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    `❌ No existe un SubBot con el número ${index}.\n\nUsa .bots para ver los SubBots disponibles.`
            },
            {
                quoted: m
            }
        )

        return
    }

    const number =
        getNumber(
            socket.subBotJid ||
            socket.user?.id
        )

    if (!number) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    '❌ No pude obtener el número de ese SubBot.'
            },
            {
                quoted: m
            }
        )

        return
    }

    const removed =
        await removeSubBotSafely(
            number,
            socket
        )

    if (!removed) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    `❌ No se pudo eliminar la sesión del SubBot ${index}.`
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
                `🗑️ Sesión del SubBot ${index} (+${number}) eliminada correctamente.`
        },
        {
            quoted: m
        }
    )

    return
}

if (
    stopCommands.includes(
        command
    )
) {
    if (!isMainBot(sock)) {
        return
    }

    if (!isOwner(m, extra)) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    '❌ Solo el owner puede detener SubBots.'
            },
            {
                quoted: m
            }
        )

        return
    }

    const index =
        Number(
            args?.[0]
        )

    if (
        !Number.isInteger(index) ||
        index < 1
    ) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    '❌ Debes indicar el número del SubBot.\n\nEjemplo:\n.stop 1\n.stop 2\n\nUsa .bots para ver la lista.'
            },
            {
                quoted: m
            }
        )

        return
    }

    const socket =
        getSubBotByIndex(index)

    if (!socket) {
        await sock.sendMessage(
            m.chat,
            {
                text:
                    `❌ No existe un SubBot con el número ${index}.\n\nUsa .bots para ver los SubBots disponibles.`
            },
            {
                quoted: m
            }
        )

        return
    }

    const number =
        getNumber(
            socket.subBotJid ||
            socket.user?.id
        )

    closeSocket(socket)

    await sock.sendMessage(
        m.chat,
        {
            text:
                `⏸️ SubBot ${index}${number ? ` (+${number})` : ''} detenido.`
        },
        {
            quoted: m
        }
    )
}

}

export default handler