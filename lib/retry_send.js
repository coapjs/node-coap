'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const { EventEmitter } = require('events')
const { parse } = require('coap-packet')
const { parameters } = require('./parameters')

class RetrySendError extends Error {
    constructor (retransmitTimeout) {
        super(`No reply in ${retransmitTimeout} seconds.`)
        this.retransmitTimeout = retransmitTimeout
    }
}

class RetrySend extends EventEmitter {
    constructor (sock, port, host, maxRetransmit) {
        super()

        this._sock = sock

        this._port = port || parameters.coapPort

        this._host = host

        this._maxRetransmit = maxRetransmit || parameters.maxRetransmit
        this._sendAttemp = 0
        this._lastMessageId = -1
        this._currentTime = parameters.ackTimeout * (1 + (parameters.ackRandomFactor - 1) * Math.random()) * 1000

        this._bOff = () => {
            this._currentTime = this._currentTime * 2
            this._send()
        }
    }

    _send (avoidBackoff) {
        this._sock.send(this._message, 0, this._message.length,
            this._port, this._host, (err, bytes) => {
                this.emit('sent', err, bytes)
                if (err != null) {
                    this.emit('error', err)
                }
            })

        const messageId = parse(this._message).messageId
        if (messageId !== this._lastMessageId) {
            this._lastMessageId = messageId
            this._sendAttemp = 0
        }

        if (avoidBackoff !== true && ++this._sendAttemp <= this._maxRetransmit) {
            this._bOffTimer = setTimeout(this._bOff, this._currentTime)
        }

        this.emit('sending', this._message)
    }

    send (message, avoidBackoff) {
        this._message = message
        this._send(avoidBackoff)

        const timeout = avoidBackoff === true ? parameters.maxRTT : parameters.exchangeLifetime
        this._timer = setTimeout(() => {
            const err = new RetrySendError(timeout)
            if (avoidBackoff === false) {
                this.emit('error', err)
            }
            this.emit('timeout', err)
        }, timeout * 1000)
    }

    reset () {
        clearTimeout(this._timer)
        clearTimeout(this._bOffTimer)
    }
}

module.exports = RetrySend
