import * as baileys from '@whiskeysockets/baileys'

const proto =
    baileys.default?.proto ||
    baileys.proto

const areJidsSameUser =
    baileys.default?.areJidsSameUser ||
    baileys.areJidsSameUser

const jidDecode =
    baileys.default?.jidDecode ||
    baileys.jidDecode

const extractMessageContent =
    baileys.default?.extractMessageContent ||
    baileys.extractMessageContent

const MediaType = [
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'stickerMessage',
    'documentMessage'
]

function decodeJid(jid = '') {
    if (!jid || typeof jid !== 'string') {
        return jid
    }

    if (/:\d+@/gi.test(jid)) {
        const decode =
            jidDecode(jid) || {}

        if (
            decode.user &&
            decode.server
        ) {
            return `${decode.user}@${decode.server}`
        }
    }

    return jid.trim()
}

function ensureSocketMethods(conn) {
    if (!conn) return conn

    if (
        typeof conn.decodeJid !==
        'function'
    ) {
        conn.decodeJid = decodeJid
    }

    if (
        typeof conn.getName !==
        'function'
    ) {
        conn.getName = jid => {
            return jid || ''
        }
    }

    return conn
}

export function smsg(
    conn,
    m,
    hasParent
) {
    if (!m) return m

    conn =
        ensureSocketMethods(conn)

    m =
        proto.WebMessageInfo.fromObject(m)

    m.conn = conn

    let protocolMessageKey

    if (m.message) {
        if (
            m.mtype ===
            'protocolMessage' &&
            m.msg?.key
        ) {
            protocolMessageKey =
                m.msg.key

            if (
                protocolMessageKey.remoteJid ===
                'status@broadcast'
            ) {
                protocolMessageKey.remoteJid =
                    m.chat
            }

            if (
                !protocolMessageKey.participant ||
                protocolMessageKey.participant ===
                'status_me'
            ) {
                protocolMessageKey.participant =
                    m.sender
            }

            protocolMessageKey.fromMe =
                conn.decodeJid(
                    protocolMessageKey.participant
                ) ===
                conn.decodeJid(
                    conn.user?.id
                )

            if (
                !protocolMessageKey.fromMe &&
                protocolMessageKey.remoteJid ===
                conn.decodeJid(
                    conn.user?.id
                )
            ) {
                protocolMessageKey.remoteJid =
                    m.sender
            }
        }

        if (
            m.quoted &&
            !m.quoted.mediaMessage
        ) {
            delete m.quoted.download
        }
    }

    if (!m.mediaMessage) {
        delete m.download
    }

    try {
        if (
            protocolMessageKey &&
            m.mtype ===
            'protocolMessage'
        ) {
            conn.ev.emit(
                'message.delete',
                protocolMessageKey
            )
        }
    } catch {}

    return m
}

export function serialize() {
    return Object.defineProperties(
        proto.WebMessageInfo.prototype,
        {
            conn: {
                value: undefined,
                enumerable: false,
                writable: true
            },

            id: {
                get() {
                    return this.key?.id
                }
            },

            isBaileys: {
                get() {
                    return (
                        this.id?.length === 16 ||
                        (
                            this.id?.startsWith('3EB0') &&
                            this.id?.length === 12
                        ) ||
                        false
                    )
                }
            },

            chat: {
                get() {
                    const senderKeyDistributionMessage =
                        this.message
                            ?.senderKeyDistributionMessage
                            ?.groupId

                    const chat =
                        this.key?.remoteJid ||
                        (
                            senderKeyDistributionMessage &&
                            senderKeyDistributionMessage !==
                            'status@broadcast'
                                ? senderKeyDistributionMessage
                                : ''
                        )

                    return decodeJid(chat)
                }
            },

            isGroup: {
                get() {
                    return this.chat.endsWith(
                        '@g.us'
                    )
                },
                enumerable: true
            },

            sender: {
                get() {
                    const jid =
                        this.key?.fromMe &&
                        this.conn?.user?.id ||
                        this.participant ||
                        this.key?.participant ||
                        this.chat ||
                        ''

                    return this.conn
                        ? this.conn.decodeJid(jid)
                        : decodeJid(jid)
                },
                enumerable: true
            },

            fromMe: {
                get() {
                    return (
                        this.key?.fromMe ||
                        areJidsSameUser(
                            this.conn?.user?.id,
                            this.sender
                        ) ||
                        false
                    )
                }
            },

            mtype: {
                get() {
                    if (!this.message) {
                        return ''
                    }

                    const type =
                        Object.keys(
                            this.message
                        )

                    return (
                        (
                            ![
                                'senderKeyDistributionMessage',
                                'messageContextInfo'
                            ].includes(type[0]) &&
                            type[0]
                        ) ||
                        (
                            type.length >= 3 &&
                            type[1] !==
                            'messageContextInfo' &&
                            type[1]
                        ) ||
                        type[type.length - 1]
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
                }
            },

            mediaMessage: {
                get() {
                    if (!this.message) {
                        return null
                    }

                    const Message =
                        (
                            this.msg?.url ||
                            this.msg?.directPath
                        )
                            ? {
                                ...this.message
                            }
                            : extractMessageContent(
                                this.message
                            )

                    if (!Message) {
                        return null
                    }

                    const mtype =
                        Object.keys(
                            Message
                        )[0]

                    return MediaType.includes(
                        mtype
                    )
                        ? Message
                        : null
                },

                enumerable: true
            },

            mediaType: {
                get() {
                    const message =
                        this.mediaMessage

                    if (!message) {
                        return null
                    }

                    return Object.keys(
                        message
                    )[0]
                },

                enumerable: true
            },

            quoted: {
                get() {
                    const self = this
                    const msg = self.msg
                    const contextInfo =
                        msg?.contextInfo

                    const quoted =
                        contextInfo?.quotedMessage

                    if (
                        !msg ||
                        !contextInfo ||
                        !quoted
                    ) {
                        return null
                    }

                    const type =
                        Object.keys(
                            quoted
                        )[0]

                    const q =
                        quoted[type]

                    const text =
                        typeof q === 'string'
                            ? q
                            : q?.text

                    return Object.defineProperties(
                        JSON.parse(
                            JSON.stringify(
                                typeof q ===
                                'string'
                                    ? { text: q }
                                    : q
                            )
                        ),
                        {
                            mtype: {
                                get() {
                                    return type
                                },
                                enumerable: true
                            },

                            id: {
                                get() {
                                    return contextInfo.stanzaId
                                },
                                enumerable: true
                            },

                            chat: {
                                get() {
                                    return decodeJid(
                                        contextInfo.remoteJid ||
                                        self.chat
                                    )
                                },
                                enumerable: true
                            },

                            sender: {
                                get() {
                                    return decodeJid(
                                        contextInfo.participant ||
                                        this.chat ||
                                        ''
                                    )
                                },
                                enumerable: true
                            },

                            fromMe: {
                                get() {
                                    return areJidsSameUser(
                                        this.sender,
                                        self.conn?.user?.id
                                    )
                                },
                                enumerable: true
                            },

                            text: {
                                get() {
                                    return (
                                        text ||
                                        this.caption ||
                                        this.contentText ||
                                        this.selectedDisplayText ||
                                        ''
                                    )
                                },
                                enumerable: true
                            },

                            mentionedJid: {
                                get() {
                                    return (
                                        q?.contextInfo
                                            ?.mentionedJid ||
                                        []
                                    )
                                },
                                enumerable: true
                            },

                            mediaMessage: {
                                get() {
                                    const Message =
                                        (
                                            q?.url ||
                                            q?.directPath
                                        )
                                            ? {
                                                ...quoted
                                            }
                                            : extractMessageContent(
                                                quoted
                                            )

                                    if (!Message) {
                                        return null
                                    }

                                    const mtype =
                                        Object.keys(
                                            Message
                                        )[0]

                                    return MediaType.includes(
                                        mtype
                                    )
                                        ? Message
                                        : null
                                },

                                enumerable: true
                            },

                            mediaType: {
                                get() {
                                    const message =
                                        this.mediaMessage

                                    if (!message) {
                                        return null
                                    }

                                    return Object.keys(
                                        message
                                    )[0]
                                },

                                enumerable: true
                            },

                            vM: {
                                get() {
                                    return proto.WebMessageInfo.fromObject({
                                        key: {
                                            fromMe:
                                                this.fromMe,
                                            remoteJid:
                                                this.chat,
                                            id:
                                                this.id
                                        },
                                        message:
                                            quoted,
                                        ...(self.isGroup
                                            ? {
                                                participant:
                                                    this.sender
                                            }
                                            : {})
                                    })
                                }
                            },

                            fakeObj: {
                                get() {
                                    return this.vM
                                }
                            },

                            reply: {
                                value(
                                    text,
                                    chatId,
                                    options
                                ) {
                                    return self.conn?.reply?.(
                                        chatId ||
                                        this.chat,
                                        text,
                                        this.vM,
                                        options
                                    )
                                },

                                enumerable: true
                            },

                            copy: {
                                value() {
                                    return smsg(
                                        self.conn,
                                        proto.WebMessageInfo.fromObject(
                                            proto.WebMessageInfo.toObject(
                                                this.vM
                                            )
                                        )
                                    )
                                },

                                enumerable: true
                            },

                            forward: {
                                value(
                                    jid,
                                    force = false,
                                    options = {}
                                ) {
                                    return self.conn?.sendMessage?.(
                                        jid,
                                        {
                                            forward:
                                                this.vM,
                                            force,
                                            ...options
                                        },
                                        {
                                            ...options
                                        }
                                    )
                                },

                                enumerable: true
                            },

                            copyNForward: {
                                value(
                                    jid,
                                    forceForward = false,
                                    options = {}
                                ) {
                                    return self.conn?.copyNForward?.(
                                        jid,
                                        this.vM,
                                        forceForward,
                                        options
                                    )
                                },

                                enumerable: true
                            },

                            cMod: {
                                value(
                                    jid,
                                    text = '',
                                    sender = this.sender,
                                    options = {}
                                ) {
                                    return self.conn?.cMod?.(
                                        jid,
                                        this.vM,
                                        text,
                                        sender,
                                        options
                                    )
                                },

                                enumerable: true
                            },

                            delete: {
                                value() {
                                    return self.conn?.sendMessage?.(
                                        this.chat,
                                        {
                                            delete:
                                                this.vM.key
                                        }
                                    )
                                },

                                enumerable: true
                            },

                            react: {
                                value(text) {
                                return this.conn?.sendMessage?.(
                        this.chat,
                        {
                            react: {
                                text,
                                key: this.key
                            }
                        }
                    )
                },

                enumerable: true
            }
        }
    )
}

export function logic(
    check,
    inp,
    out
) {
    if (
        inp.length !==
        out.length
    ) {
        throw new Error(
            'Input and Output must have same length'
        )
    }

    for (const i in inp) {
        if (
            JSON.stringify(check) ===
            JSON.stringify(inp[i])
        ) {
            return out[i]
        }
    }

    return null
}

export function protoType() {
    Buffer.prototype.toArrayBuffer =
        function toArrayBufferV2() {
            const ab =
                new ArrayBuffer(
                    this.length
                )

            const view =
                new Uint8Array(ab)

            for (
                let i = 0;
                i < this.length;
                ++i
            ) {
                view[i] = this[i]
            }

            return ab
        }

    Buffer.prototype.toArrayBufferV2 =
        function toArrayBuffer() {
            return this.buffer.slice(
                this.byteOffset,
                this.byteOffset +
                this.byteLength
            )
        }

    ArrayBuffer.prototype.toBuffer =
        function toBuffer() {
            return Buffer.from(
                new Uint8Array(this)
            )
        }

    String.prototype.isNumber =
        Number.prototype.isNumber =
        isNumber

    String.prototype.capitalize =
        function capitalize() {
            return (
                this.charAt(0).toUpperCase() +
                this.slice(1)
            )
        }

    String.prototype.capitalizeV2 =
        function capitalizeV2() {
            return this
                .split(' ')
                .map(
                    v => v.capitalize()
                )
                .join(' ')
        }

    String.prototype.decodeJid =
        function decodeJid() {
            return decodeJid(this)
        }

    Number.prototype.getRandom =
        String.prototype.getRandom =
        Array.prototype.getRandom =
        getRandom
}

function isNumber() {
    const int =
        parseInt(this)

    return (
        typeof int === 'number' &&
        !isNaN(int)
    )
}

function getRandom() {
    if (
        Array.isArray(this) ||
        this instanceof String
    ) {
        return this[
            Math.floor(
                Math.random() *
                this.length
            )
        ]
    }

    return Math.floor(
        Math.random() * this
    )
}

protoType()
serialize()