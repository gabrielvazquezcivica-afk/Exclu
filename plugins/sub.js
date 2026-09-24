import config from '../config.js'

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
if (!socket) {
return '🔴 Desconectado'
}

if (socket.isInit === true) {
    return '🟢 Activo'
}

if (!socket.ws?.socket) {
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
return (
socket?.startTime ||
socket?.connectedAt ||
socket?.createdAt ||
Date.now()
)
}

async function getSubBots() {
try {
const module =
await import(
'../lib/resetsb.js'
)

    if (
        typeof module.getActiveSubBots !==
        'function'
    ) {
        return []
    }

    const bots =
        module.getActiveSubBots()

    return bots
        .map(
            bot =>
                bot?.sock
        )
        .filter(
            socket =>
                socket?.isSubBot === true
        )
} catch (error) {
    console.error(
        '[SUB] Error obteniendo SubBots:',
        error?.message ||
        error
    )

    return []
}

}

async function getSubBotByIndex(index) {
const sockets =
await getSubBots()

if (
    !Number.isInteger(index) ||
    index < 1 ||
    index > sockets.length
) {
    return null
}

return sockets[index - 1]

}

async function enviar(
sock,
m,
text
) {
return sock.sendMessage(
m.chat,
{
text
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
        await getSubBots()

    if (
        sockets.length === 0
    ) {
        await enviar(
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

    await enviar(
        sock,
        m,
        response
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
        await enviar(
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
        await enviar(
            sock,
            m,
            '❌ Indica el número del SubBot.\n\nEjemplo:\n.deletesesion 1\n.deletesesion 2\n\nUsa .bots para ver la lista.'
        )

        return
    }

    const socket =
        await getSubBotByIndex(
            index
        )

    if (!socket) {
        await enviar(
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

    if (!number) {
        await enviar(
            sock,
            m,
            '❌ No pude obtener el número de ese SubBot.'
        )

        return
    }

    let removed = false

    try {
        const module =
            await import(
                '../lib/resetsb.js'
            )

        if (
            typeof module.removeSubBot ===
            'function'
        ) {
            removed =
                module.removeSubBot(
                    number
                )
        }
    } catch (error) {
        console.error(
            '[SUB] Error eliminando SubBot:',
            error?.message ||
            error
        )
    }

    if (!removed) {
        await enviar(
            sock,
            m,
            `❌ No se pudo eliminar la sesión del SubBot ${index}.`
        )

        return
    }

    await enviar(
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
        await enviar(
            sock,
            m,
            '🚫 Solo el owner puede detener SubBots.'
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
        await enviar(
            sock,
            m,
            '❌ Indica el número del SubBot.\n\nEjemplo:\n.stop 1\n.stop 2\n\nUsa .bots para ver la lista.'
        )

        return
    }

    const socket =
        await getSubBotByIndex(
            index
        )

    if (!socket) {
        await enviar(
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

    try {
        const module =
            await import(
                '../lib/resetsb.js'
            )

        if (
            typeof module.stopSubBot ===
            'function'
        ) {
            await module.stopSubBot(
                number
            )
        } else {
            try {
                socket.end(
                    undefined
                )
            } catch {}
        }
    } catch {
        try {
            socket.end(
                undefined
            )
        } catch {}
    }

    await enviar(
        sock,
        m,
        `⏸️ SubBot ${index}${number ? ` (+${number})` : ''} detenido.`
    )
}

}

export default handler