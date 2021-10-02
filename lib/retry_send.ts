/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { EventEmitter } from 'events'
import { parse } from 'coap-packet'
import { parameters } from './parameters'
import { Socket } from 'dgram'

class RetrySendError extends Error {
    retransmitTimeout: number
    constructor (retransmitTimeout: number) {
        super(`No reply in ${retransmitTimeout} seconds.`)
        this.retransmitTimeout = retransmitTimeout
    }
}

export default class RetrySend extends EventEmitter {
    _sock: Socket
    _port: number
    _host?: string
    _maxRetransmit: number
    _sendAttemp: number
    _lastMessageId: number
    _currentTime: number
    _bOff: () => void
    _message: Buffer
    _timer: NodeJS.Timeout
    _bOffTimer: NodeJS.Timeout
    constructor (sock: any, port: number, host?: string, maxRetransmit?: number) {
        super()

        this._sock = sock

        this._port = port ?? parameters.coapPort

        this._host = host

        this._maxRetransmit = maxRetransmit ?? parameters.maxRetransmit
        this._sendAttemp = 0
        this._lastMessageId = -1
        this._currentTime = parameters.ackTimeout * (1 + (parameters.ackRandomFactor - 1) * Math.random()) * 1000

        this._bOff = () => {
            this._currentTime = this._currentTime * 2
            this._send()
        }
    }

    _send (avoidBackoff?: boolean): void {
        this._sock.send(this._message, 0, this._message.length,
            this._port, this._host, (err: Error, bytes: number): void => {
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

    send (message: Buffer, avoidBackoff?: boolean): void {
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

    reset (): void {
        clearTimeout(this._timer)
        clearTimeout(this._bOffTimer)
    }
}
