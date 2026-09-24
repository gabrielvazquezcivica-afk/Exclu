import * as baileys from '@whiskeysockets/baileys'

const B =
    baileys.default || baileys

const proto =
    B.proto ||
    baileys.proto

const jidDecode =
    B.jidDecode ||
    baileys.jidDecode

const areJidsSameUser =
    B.areJidsSameUser ||
    baileys.areJidsSameUser

const extractMessageContent =
    B.extractMessageContent ||
    baileys.extractMessageContent

const MediaType = [
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'stickerMessage',
    'documentMessage'
]

function decodeJid(jid = '') {
    if (
        !jid ||
        typeof jid !== 'string'
    ) {
        return jid
    }

    if (/:\d+@/i.test(jid)) {
        const decoded =
            jidDecode(jid) || {}

        if (
            decoded.user &&
            decoded.server
        ) {
            return (
                decoded.user +
                '@' +
                decoded.server
            )
        }
    }

    return jid.trim()
}

function prepareConnection(conn) {
    if (!conn) return conn

    if (
        typeof conn.decodeJid !==
        'function'
    ) {
        conn.decodeJid =
            decodeJid
    }

    if (
        typeof conn.getName !==
        'function'
    ) {
        conn.getName =
            jid => jid || ''
    }

    return conn
}

export function smsg(
    conn,
    m
) {
    if (!m) return m

    conn =
        prepareConnection(conn)

    const message =
        proto.WebMessageInfo.fromObject(m)

    message.conn =
        conn

    return message
}

export function serialize() {
    if (!proto?.WebMessageInfo) {
        throw new Error(
            'Baileys no proporcionó proto.WebMessageInfo'
        )
    }

    Object.defineProperties(
        proto.WebMessageInfo.prototype,
        {
            conn: {
                value: undefined,
                writable: true,
                enumerable: false,
                configurable: true
            },

            id: {
                get() {
                    return this.key?.id
                }
            },

            chat: {
                get() {
                    const jid =
                        this.key?.remoteJid ||
                        this.participant ||
                        ''

                    return this.conn
                        ? this.conn.decodeJid(jid)
                        : decodeJid(jid)
                },

                enumerable: true
            },

            isGroup: {
                get() {
                    return (
                        this.chat ||
                        ''
                    ).endsWith('@g.us')
                },

                enumerable: true
            },

            sender: {
                get() {
                    const jid =
                        this.key?.fromMe
                            ? this.conn?.user?.id
                            : (
                                this.participant ||
                                this.key?.participant ||
                                this.chat ||
                                ''
                            )

                    return this.conn
                        ? this.conn.decodeJid(jid)
                        : decodeJid(jid)
                },

                enumerable: true
            },

            fromMe: {
                get() {
                    if (
                        this.key?.fromMe
                    ) {
                        return true
                    }

                    if (
                        !this.conn?.user?.id
                    ) {
                        return false
                    }

                    return areJidsSameUser(
                        this.conn.user.id,
                        this.sender
                    )
                },

                enumerable: true
            },

            mtype: {
                get() {
                    if (!this.message) {
                        return ''
                    }

                    const keys =
                        Object.keys(
                            this.message
                        )

                    return (
                        keys.find(
                            key =>
                                key !==
                                'senderKeyDistributionMessage' &&
                                key !==
                                'messageContextInfo'
                        ) ||
                        keys[keys.length - 1] ||
                        ''
                    )
                },

                enumerable: true
            },

            msg: {
                get() {
                    if (!this.message) {
                        return null
                    }

                    return this.message[
                        this.mtype
                    ]
                },

                enumerable: true
            },

            text: {
                get() {
                    const msg =
                        this.msg

                    if (
                        typeof msg ===
                        'string'
                    ) {
                        return msg
                    }

                    return (
                        msg?.text ||
                        msg?.caption ||
                        msg?.contentText ||
                        msg?.selectedDisplayText ||
                        msg?.hydratedTemplate
                            ?.hydratedContentText ||
                        ''
                    )
                },

                enumerable: true
            },

            mentionedJid: {
                get() {
                    return (
                        this.msg
                            ?.contextInfo
                            ?.mentionedJid ||
                        []
                    )
                },

                enumerable: true
            },

            mediaMessage: {
                get() {
                    if (!this.message) {
                        return null
                    }

                    const content =
                        (
                            this.msg?.url ||
                            this.msg?.directPath
                        )
                            ? this.message
                            : extractMessageContent(
                                this.message
                            )

                    if (!content) {
                        return null
                    }

                    const type =
                        Object.keys(
                            content
                        )[0]

                    return MediaType.includes(
                        type
                    )
                        ? content
                        : null
                },

                enumerable: true
            },

            mediaType: {
                get() {
                    const media =
                        this.mediaMessage

                    if (!media) {
                        return null
                    }

                    return Object.keys(
                        media
                    )[0]
                },

                enumerable: true
            },

            quoted: {
                get() {
                    const msg =
                        this.msg

                    const context =
                        msg?.contextInfo

                    const quoted =
                        context?.quotedMessage

                    if (
                        !quoted ||
                        !context
                    ) {
                        return null
                    }

                    const type =
                        Object.keys(
                            quoted
                        )[0]

                    const data =
                        quoted[type]

                    return {
                        mtype: type,

                        id:
                            context.stanzaId,

                        chat:
                            decodeJid(
                                context.remoteJid ||
                                this.chat
                            ),

                        sender:
                            decodeJid(
                                context.participant ||
                                context.remoteJid ||
                                this.chat ||
                                ''
                            ),

                        text:
                            typeof data ===
                            'string'
                                ? data
                                : (
                                    data?.text ||
                                    data?.caption ||
                                    ''
                                ),

                        mentionedJid:
                            data?.contextInfo
                                ?.mentionedJid ||
                            [],

                        message:
                            quoted
                    }
                },

                enumerable: true
            },

            name: {
                get() {
                    return (
                        this.pushName ||
                        this.conn?.getName?.(
                            this.sender
                        ) ||
                        ''
                    )
                },

                enumerable: true
            }
        }
    )
}

export function protoType() {
    String.prototype.decodeJid =
        function () {
            return decodeJid(
                this.toString()
            )
        }

    String.prototype.isNumber =
        function () {
            return /^\d+$/.test(
                this.toString()
            )
        }

    String.prototype.capitalize =
        function () {
            const value =
                this.toString()

            return (
                value.charAt(0)
                    .toUpperCase() +
                value.slice(1)
            )
        }

    Number.prototype.getRandom =
        function () {
            return Math.floor(
                Math.random() *
                Number(this)
            )
        }

    Array.prototype.getRandom =
        function () {
            if (!this.length) {
                return undefined
            }

            return this[
                Math.floor(
                    Math.random() *
                    this.length
                )
            ]
        }
}

protoType()
serialize()