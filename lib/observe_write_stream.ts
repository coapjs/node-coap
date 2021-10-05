/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { OptionName, Packet } from 'coap-packet'
import { Writable } from 'stream'
import { CoapPacket, OptionValue } from '../models/models'
import { setOption } from './helpers'

export default class ObserveWriteStream extends Writable {
    _packet: Packet
    _request: Packet
    _send: (message: ObserveWriteStream, packet: Packet) => void
    code: string
    statusCode: string
    _counter: number
    _cachekey: string
    _addCacheEntry: Function
    constructor (request: Packet, send: (message: ObserveWriteStream, packet: CoapPacket) => void) {
        super()

        this._packet = {
            token: request.token,
            messageId: request.messageId,
            options: [],
            confirmable: false,
            ack: request.confirmable,
            reset: false
        }

        this._request = request
        this._send = send

        this._counter = 0

        this.on('finish', () => {
            if (this._counter === 0) { // we have sent no messages
                this._doSend()
            }
        })
    }

    _write (data: Buffer, encoding: string, done: () => void): void {
        this.setOption('Observe', ++this._counter)

        if (this._counter === 16777215) {
            this._counter = 1
        }

        this._doSend(data)

        done()
    }

    _doSend (data?: Buffer): void {
        const packet = this._packet
        packet.code = this.statusCode
        packet.payload = data
        this._send(this, packet)

        this._packet.confirmable = this._request.confirmable
        this._packet.ack = this._request.confirmable === false
        delete this._packet.messageId
        delete this._packet.payload
    }

    reset (): void {
        const packet = this._packet
        packet.code = '0.00'
        packet.payload = Buffer.alloc(0)
        packet.reset = true
        packet.ack = false
        packet.token = Buffer.alloc(0)

        this._send(this, packet)

        this._packet.confirmable = this._request.confirmable
        delete this._packet.messageId
        delete this._packet.payload
    }

    setOption (name: OptionName, values: OptionValue): this {
        setOption(this._packet, name, values)
        return this
    }

    setHeader (name: OptionName, values: OptionValue): this {
        return this.setOption(name, values)
    }
}
