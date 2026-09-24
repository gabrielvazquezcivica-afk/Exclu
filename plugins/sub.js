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
    'start',
    'reanudar',
    'reactivar',
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

function getState(bot) {
    if (!bot) {
        return '🔴 Desconectado'
    }

    if (bot.stopped === true) {
        return '⏸️ Pausado'
    }

    const socket =
        bot.sock

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

async function getSubModule() {
    try {
        return await import(
            '../lib/resetsb.js'
        )
    } catch (error) {
        console.error(
            '[SUB] Error cargando resetsb:',
            error?.message ||
            error
        )

        return null
    }
}

async function getSubBots() {
    const module =
        await getSubModule()

    if (
        typeof module?.getActiveSubBots !==
        'function'
    ) {
        return []
    }

    return module.getActiveSubBots()
}

async function getSubBotByIndex(index) {
    const bots =
        await getSubBots()

    if (
        !Number.isInteger(index) ||
        index < 1 ||
        index > bots.length
    ) {
        return null
    }

    return bots[index - 1]
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

    const startCommands = [
        'start',
        'reanudar',
        'reactivar'
    ]

    if (
        listCommands.includes(
            command
        )
    ) {
        if (!esBotPrincipal(sock)) {
            return
        }

        const bots =
            await getSubBots()

        if (
            bots.length === 0
        ) {
            await enviar(
                sock,
                m,
                '🌐 *SubBots*\n\nNo hay SubBots registrados.'
            )

            return
        }

        const list =
            bots
                .map(
                    (
                        bot,
                        index
                    ) => {
                        const socket =
                            bot?.sock

                        const number =
                            getNumber(
                                bot?.phone ||
                                socket?.subBotJid ||
                                socket?.user?.id
                            )

                        const name =
                            socket?.user?.name ||
                            socket?.user?.verifiedName ||
                            'SubBot'

                        const startTime =
                            socket?.startTime

                        const state =
                            getState(
                                bot
                            )

                        const connected =
                            socket?.isInit === true

                        return [
                            `*${index + 1}. ${name}*`,
                            `📱 +${number || 'Desconocido'}`,
                            `🔗 Estado: ${state}`,
                            connected
                                ? `⏱️ Conectado: ${formatTime(startTime)}`
                                : '⏱️ Conectado: No',
                            startTime
                                ? `📅 Desde: ${new Date(startTime).toLocaleString('es-MX')}`
                                : ''
                        ]
                            .filter(Boolean)
                            .join('\n')
                    }
                )
                .join(
                    '\n\n> ───────────────\n\n'
                )

        const response =
            [
                '🌐 *SubBots*',
                '',
                `🤖 *Total:* ${bots.length}`,
                '',
                list,
                '',
                '⏸️ Para pausar: .stop 1',
                '▶️ Para reactivar: .start 1',
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

        const bot =
            await getSubBotByIndex(
                index
            )

        if (!bot) {
            await enviar(
                sock,
                m,
                `❌ No existe un SubBot con el número ${index}.\n\nUsa .bots para ver la lista.`
            )

            return
        }

        const number =
            getNumber(
                bot.phone ||
                bot.sock?.subBotJid ||
                bot.sock?.user?.id
            )

        if (!number) {
            await enviar(
                sock,
                m,
                '❌ No pude obtener el número de ese SubBot.'
            )

            return
        }

        try {
            const module =
                await getSubModule()

            if (
                typeof module?.removeSubBot !==
                'function'
            ) {
                await enviar(
                    sock,
                    m,
                    '❌ El sistema de eliminación no está disponible.'
                )

                return
            }

            const removed =
                module.removeSubBot(
                    number
                )

            if (!removed) {
                await enviar(
                    sock,
                    m,
                    `❌ No se pudo eliminar el SubBot ${index}.`
                )

                return
            }

        } catch (error) {
            console.error(
                '[SUB] Error eliminando:',
                error?.message ||
                error
            )

            await enviar(
                sock,
                m,
                '❌ Ocurrió un error al eliminar el SubBot.'
            )

            return
        }

        await enviar(
            sock,
            m,
            `🗑️ SubBot ${index} (+${number}) eliminado correctamente.`
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
                '🚫 Solo el owner principal puede pausar SubBots.'
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

        const bot =
            await getSubBotByIndex(
                index
            )

        if (!bot) {
            await enviar(
                sock,
                m,
                `❌ No existe un SubBot con el número ${index}.`
            )

            return
        }

        if (
            bot.stopped === true
        ) {
            await enviar(
                sock,
                m,
                `⏸️ El SubBot ${index} ya está pausado.`
            )

            return
        }

        const number =
            getNumber(
                bot.phone ||
                bot.sock?.subBotJid ||
                bot.sock?.user?.id
            )

        try {
            const module =
                await getSubModule()

            if (
                typeof module?.stopSubBot !==
                'function'
            ) {
                await enviar(
                    sock,
                    m,
                    '❌ El sistema de pausa no está disponible.'
                )

                return
            }

            const stopped =
                await module.stopSubBot(
                    number
                )

            if (!stopped) {
                await enviar(
                    sock,
                    m,
                    `❌ No se pudo pausar el SubBot ${index}.`
                )

                return
            }

        } catch (error) {
            console.error(
                '[SUB] Error pausando:',
                error?.message ||
                error
            )

            await enviar(
                sock,
                m,
                '❌ Ocurrió un error al pausar el SubBot.'
            )

            return
        }

        await enviar(
            sock,
            m,
            `⏸️ SubBot ${index} (+${number}) pausado.\n\n▶️ Puedes reactivarlo con:\n.start ${index}`
        )

        return
    }

    if (
        startCommands.includes(
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
                '🚫 Solo el owner principal puede reactivar SubBots.'
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
                '❌ Indica el número del SubBot.\n\nEjemplo:\n.start 1\n.start 2\n\nUsa .bots para ver la lista.'
            )

            return
        }

        const bots =
            await getSubBots()

        const bot =
            bots[index - 1]

        if (!bot) {
            await enviar(
                sock,
                m,
                `❌ No existe un SubBot con el número ${index}.`
            )

            return
        }

        if (
            bot.stopped !== true
        ) {
            if (
                bot.sock?.isInit === true
            ) {
                await enviar(
                    sock,
                    m,
                    `🟢 El SubBot ${index} ya está activo.`
                )

                return
            }
        }

        const number =
            getNumber(
                bot.phone ||
                bot.sock?.subBotJid ||
                bot.sock?.user?.id
            )

        if (!number) {
            await enviar(
                sock,
                m,
                `❌ No pude obtener el número del SubBot ${index}.`
            )

            return
        }

        try {
            const module =
                await getSubModule()

            if (
                typeof module?.startSubBot !==
                'function'
            ) {
                await enviar(
                    sock,
                    m,
                    '❌ El sistema de reactivación no está disponible.'
                )

                return
            }

            const started =
                await module.startSubBot(
                    number
                )

            if (!started) {
                await enviar(
                    sock,
                    m,
                    `❌ No se pudo reactivar el SubBot ${index} (+${number}).`
                )

                return
            }

        } catch (error) {
            console.error(
                '[SUB] Error reactivando:',
                error?.message ||
                error
            )

            await enviar(
                sock,
                m,
                '❌ Ocurrió un error al reactivar el SubBot.'
            )

            return
        }

        await enviar(
            sock,
            m,
            `▶️ Reactivando SubBot ${index} (+${number})...\n\nEspera unos segundos y usa .bots para comprobarlo.`
        )

        return
    }
}

export default handler