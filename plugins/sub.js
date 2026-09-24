import fs from 'fs'
import path from 'path'
import config from '../config.js'

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

function limpiar(n) {
return (n || '')
.replace(/[^0-9]/g, '')
}

function getNumber(jid) {
return limpiar(
String(jid || '')
.split(':')[0]
.split('@')[0]
)
}

function esBotPrincipal(sock) {
return Boolean(
sock?.isMainBot === true ||
sock === global.conn
)
}

function esDueno(m) {
const remitente =
m?.key?.participant ||
m?.key?.remoteJid ||
''

const remNum =
    limpiar(remitente)

const owners =
    Array.isArray(config.owner)
        ? config.owner
        : []

const ownerLids =
    Array.isArray(config.ownerLid)
        ? config.ownerLid
        : []

return (
    owners.some(
        numero =>
            limpiar(numero) === remNum
    ) ||
    ownerLids.some(
        lid =>
            limpiar(lid) === remNum
    )
)

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
if (!startTime) {
return 'Desconocido'
}

const elapsed =
    Date.now() - startTime

if (elapsed < 0) {
    return '0 segundos'
}

const seconds =
    Math.floor(
        elapsed / 1000
    )

const minutes =
    Math.floor(
        seconds / 60
    )

const hours =
    Math.floor(
        minutes / 60
    )

const days =
    Math.floor(
        hours / 24
    )

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

async function enviarNoOwner(
sock,
m,
texto
) {
await sock.sendMessage(
m.chat,
{
text: texto
},
{
quoted: m
}
)
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
    if (!esBotPrincipal(sock)) {
        return
    }

    const sockets =
        getSubBots()

    if (sockets.length === 0) {
        await enviarNoOwner(
            sock,
            m,
            '🌐 *SubBots conectados*\n\nNo hay SubBots conectados.'
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
    if (!esBotPrincipal(sock)) {
        return
    }

    if (!esDueno(m)) {
        await enviarNoOwner(
            sock,
            m,
            '🚫 Solo el owner principal puede eliminar SubBots.'
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
        await enviarNoOwner(
            sock,
            m,
            '❌ Debes indicar el número del SubBot que quieres eliminar.\n\nEjemplo:\n.deletesesion 1\n.deletesesion 2\n\nUsa .bots para ver la lista.'
        )

        return
    }

    const socket =
        getSubBotByIndex(index)

    if (!socket) {
        await enviarNoOwner(
            sock,
            m,
            `❌ No existe un SubBot con el número ${index}.\n\nUsa .bots para ver los SubBots disponibles.`
        )

        return
    }

    const number =
        getNumber(
            socket.subBotJid ||
            socket.user?.id
        )

    if (!number) {
        await enviarNoOwner(
            sock,
            m,
            '❌ No pude obtener el número de ese SubBot.'
        )

        return
    }

    const removed =
        await removeSubBotSafely(
            number,
            socket
        )

    if (!removed) {
        await enviarNoOwner(
            sock,
            m,
            `❌ No se pudo eliminar la sesión del SubBot ${index}.`
        )

        return
    }

    await enviarNoOwner(
        sock,
        m,
        `🗑️ Sesión del SubBot ${index} (+${number}) eliminada correctamente.`
    )

    return
}

if (
    stopCommands.includes(
        command
    )
) {
    if (!esBotPrincipal(sock)) {
        return
    }

    if (!esDueno(m)) {
        await enviarNoOwner(
            sock,
            m,
            '🚫 Solo el owner principal puede detener SubBots.'
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
        await enviarNoOwner(
            sock,
            m,
            '❌ Debes indicar el número del SubBot.\n\nEjemplo:\n.stop 1\n.stop 2\n\nUsa .bots para ver la lista.'
        )

        return
    }

    const socket =
        getSubBotByIndex(index)

    if (!socket) {
        await enviarNoOwner(
            sock,
            m,
            `❌ No existe un SubBot con el número ${index}.\n\nUsa .bots para ver la lista.`
        )

        return
    }

    const number =
        getNumber(
            socket.subBotJid ||
            socket.user?.id
        )

    closeSocket(socket)

    await enviarNoOwner(
        sock,
        m,
        `⏸️ SubBot ${index}${number ? ` (+${number})` : ''} detenido.`
    )
}

}

export default handler