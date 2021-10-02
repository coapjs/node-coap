'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const parameters = require('./parameters').parameters
const EventEmitter = require('events').EventEmitter
const parse = require('coap-packet').parse

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
                if (err) {
                    this.emit('error', err)
                }
            })

        const messageId = parse(this._message).messageId
        if (messageId !== this._lastMessageId) {
            this._lastMessageId = messageId
            this._sendAttemp = 0
        }

        if (!avoidBackoff && ++this._sendAttemp <= this._maxRetransmit) {
            this._bOffTimer = setTimeout(this._bOff, this._currentTime)
        }

        this.emit('sending', this._message)
    }

    send (message, avoidBackoff) {
        this._message = message
        this._send(avoidBackoff)

        const timeout = avoidBackoff ? parameters.maxRTT : parameters.exchangeLifetime
        this._timer = setTimeout(() => {
            const err = new Error('No reply in ' + timeout + 's')
            err.retransmitTimeout = timeout
            if (!avoidBackoff) {
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
