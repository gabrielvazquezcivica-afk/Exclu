import {
    proto,
    areJidsSameUser,
    jidDecode,
    extractMessageContent
} from '@whiskeysockets/baileys'

const MediaType = [
    'imageMessage',
    'videoMessage',
    'audioMessage',
    'stickerMessage',
    'documentMessage'
]

export function smsg(conn, m, hasParent) {
    if (!m) return m

    m = proto.WebMessageInfo.fromObject(m)
    m.conn = conn

    let protocolMessageKey

    if (m.message) {
        if (m.mtype === 'protocolMessage' && m.msg?.key) {
            protocolMessageKey = m.msg.key

            if (protocolMessageKey.remoteJid === 'status@broadcast') {
                protocolMessageKey.remoteJid = m.chat
            }

            if (
                !protocolMessageKey.participant ||
                protocolMessageKey.participant === 'status_me'
            ) {
                protocolMessageKey.participant = m.sender
            }

            protocolMessageKey.fromMe =
                conn.decodeJid(protocolMessageKey.participant) ===
                conn.decodeJid(conn.user?.id)

            if (
                !protocolMessageKey.fromMe &&
                protocolMessageKey.remoteJid === conn.decodeJid(conn.user?.id)
            ) {
                protocolMessageKey.remoteJid = m.sender
            }
        }

        if (m.quoted && !m.quoted.mediaMessage) {
            delete m.quoted.download
        }
    }

    if (!m.mediaMessage) {
        delete m.download
    }

    try {
        if (
            protocolMessageKey &&
            m.mtype === 'protocolMessage'
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

                    return (
                        this.key?.remoteJid ||
                        (
                            senderKeyDistributionMessage &&
                            senderKeyDistributionMessage !==
                            'status@broadcast'
                                ? senderKeyDistributionMessage
                                : ''
                        )
                    ).decodeJid()
                }
            },

            isGroup: {
                get() {
                    return this.chat.endsWith('@g.us')
                },
                enumerable: true
            },

            sender: {
                get() {
                    return this.conn?.decodeJid(
                        this.key?.fromMe &&
                        this.conn?.user?.id ||
                        this.participant ||
                        this.key?.participant ||
                        this.chat ||
                        ''
                    )
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
                    if (!this.message) return ''

                    const type =
                        Object.keys(this.message)

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
                            type[1] !== 'messageContextInfo' &&
                            type[1]
                        ) ||
                        type[type.length - 1]
                    )
                },
                enumerable: true
            },

            msg: {
                get() {
                    if (!this.message) return null
                    return this.message[this.mtype]
                }
            },

            mediaMessage: {
                get() {
                    if (!this.message) return null

                    const Message =
                        (
                            this.msg?.url ||
                            this.msg?.directPath
                        )
                            ? { ...this.message }
                            : extractMessageContent(
                                this.message
                            )

                    if (!Message) return null

                    const mtype =
                        Object.keys(Message)[0]

                    return MediaType.includes(mtype)
                        ? Message
                        : null
                },
                enumerable: true
            },

            mediaType: {
                get() {
                    const message =
                        this.mediaMessage

                    if (!message) return null

                    return Object.keys(message)[0]
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
                        Object.keys(quoted)[0]

                    const q = quoted[type]

                    const text =
                        typeof q === 'string'
                            ? q
                            : q?.text

                    return Object.defineProperties(
                        JSON.parse(
                            JSON.stringify(
                                typeof q === 'string'
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
                                    return (
                                        contextInfo.remoteJid ||
                                        self.chat
                                    )
                                },
                                enumerable: true
                            },

                            sender: {
                                get() {
                                    return (
                                        contextInfo.participant ||
                                        this.chat ||
                                        ''
                                    ).decodeJid()
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
                                            ? { ...quoted }
                                            : extractMessageContent(
                                                quoted
                                            )

                                    if (!Message) return null

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
                                            fromMe: this.fromMe,
                                            remoteJid: this.chat,
                                            id: this.id
                                        },
                                        message: quoted,
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
                                    return self.conn?.reply(
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
                                    return self.conn?.sendMessage(
                                        jid,
                                        {
                                            forward: this.vM,
                                            force,
                                            ...options
                                        },
                                        { ...options }
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
                                    return self.conn?.copyNForward(
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
                                    return self.conn?.cMod(
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
                                    return self.conn?.sendMessage(
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
                                    return self.conn?.sendMessage(
                                        this.chat,
                                        {
                                            react: {
                                                text,
                                                key: this.vM.key
                                            }
                                        }
                                    )
                                },
                                enumerable: true
                            }
                        }
                    )
                },
                enumerable: true
            },

            _text: {
                value: null,
                writable: true
            },

            text: {
                get() {
                    const msg = this.msg

                    const text =
                        (
                            typeof msg === 'string'
                                ? msg
                                : msg?.text
                        ) ||
                        msg?.caption ||
                        msg?.contentText ||
                        ''

                    if (
                        typeof this._text ===
                        'string'
                    ) {
                        return this._text
                    }

                    return (
                        typeof text === 'string'
                            ? text
                            : (
                                text?.selectedDisplayText ||
                                text?.hydratedTemplate
                                    ?.hydratedContentText ||
                                text
                            )
                    ) || ''
                },

                set(str) {
                    this._text = str
                },

                enumerable: true
            },

            mentionedJid: {
                get() {
                    return (
                        this.msg
                            ?.contextInfo
                            ?.mentionedJid
                            ?.length &&
                        this.msg.contextInfo.mentionedJid
                    ) || []
                },
                enumerable: true
            },

            name: {
                get() {
                    return (
                        this.pushName ||
                        this.conn?.getName?.(
                            this.sender
                        )
                    )
                },
                enumerable: true
            },

            download: {
                value(saveToFile = false) {
                    const mtype =
                  this.mediaType

                    return this.conn?.downloadM?.(
                        this.mediaMessage?.[
                            mtype
                        ],
                        mtype?.replace(
                            /message/i,
                            ''
                        ),
                        saveToFile
                    )
                },
                enumerable: true,
                configurable: true
            },

            reply: {
                value(
                    text,
                    chatId,
                    options
                ) {
                    return this.conn?.reply?.(
                        chatId ||
                        this.chat,
                        text,
                        this,
                        options
                    )
                },
                enumerable: true
            },

            copy: {
                value() {
                    return smsg(
                        this.conn,
                        proto.WebMessageInfo.fromObject(
                            proto.WebMessageInfo.toObject(
                                this
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
                    return this.conn?.sendMessage(
                        jid,
                        {
                            forward: this,
                            force,
                            ...options
                        },
                        { ...options }
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
                    return this.conn?.copyNForward(
                        jid,
                        this,
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
                    return this.conn?.cMod?.(
                        jid,
                        this,
                        text,
                        sender,
                        options
                    )
                },
                enumerable: true
            },

            getQuotedObj: {
                value() {
                    if (!this.quoted?.id) {
                        return null
                    }

                    const quoted =
                        this.conn?.loadMessage?.(
                            this.quoted.id
                        ) ||
                        this.quoted.vM

                    if (!quoted) return null

                    return smsg(
                        this.conn,
                        proto.WebMessageInfo.fromObject(
                            quoted
                        )
                    )
                },
                enumerable: true
            },

            getQuotedMessage: {
                get() {
                    return this.getQuotedObj()
                }
            },

            delete: {
                value() {
                    return this.conn?.sendMessage(
                        this.chat,
                        {
                            delete: this.key
                        }
                    )
                },
                enumerable: true
            },

            react: {
                value(text) {
                    return this.conn?.sendMessage(
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

export function logic(check, inp, out) {
    if (inp.length !== out.length) {
        throw new Error(
            'Input and Output must have same length'
        )
    }

    for (const i in inp) {
        if (
            util.isDeepStrictEqual(
                check,
                inp[i]
            )
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
                .map(v => v.capitalize())
                .join(' ')
        }

    String.prototype.decodeJid =
        function decodeJid() {
            if (/:\d+@/gi.test(this)) {
                const decode =
                    jidDecode(this) || {}

                return (
                    decode.user &&
                    decode.server
                        ? `${decode.user}@${decode.server}`
                        : this
                ).trim()
            }

            return this.trim()
        }

    Number.prototype.getRandom =
        String.prototype.getRandom =
        Array.prototype.getRandom =
        getRandom
}

function isNumber() {
    const int = parseInt(this)
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