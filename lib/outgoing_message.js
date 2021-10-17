'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const BufferList = require('bl')
const { setOption, toCode, genAck } = require('./helpers')

class OutgoingMessage extends BufferList {
    constructor (request, send) {
        super()

        this._packet = {
            messageId: request.messageId,
            token: request.token,
            options: [],
            confirmable: false,
            ack: false,
            reset: false
        }

        if (request.confirmable === true) {
        // replying in piggyback
            this._packet.ack = true

            this._ackTimer = setTimeout(() => {
                send(this, genAck(request))

                // we are no more in piggyback
                this._packet.confirmable = true
                this._packet.ack = false

                // we need a new messageId for the CON
                // reply
                delete this._packet.messageId

                this._ackTimer = null
            }, request.piggybackReplyMs)
        }

        this._send = send

        this.statusCode = ''
        this.code = ''
    }

    end (a, b) {
        super.end(a, b)

        const packet = this._packet

        const code = this.code !== '' ? this.code : this.statusCode
        packet.code = toCode(code)
        packet.payload = this

        if (this._ackTimer != null) {
            clearTimeout(this._ackTimer)
        }

        this._send(this, packet)

        // easy clean up after generating the packet
        delete this._packet.payload

        return this
    }

    reset () {
        super.end()

        const packet = this._packet

        packet.code = '0.00'
        packet.payload = Buffer.alloc(0)
        packet.reset = true
        packet.ack = false
        packet.token = Buffer.alloc(0)

        if (this._ackTimer != null) {
            clearTimeout(this._ackTimer)
        }

        this._send(this, packet)

        // easy clean up after generating the packet
        delete this._packet.payload

        return this
    }

    writeHead (code, headers) {
        const packet = this._packet
        packet.code = String(code).replace(/(^\d[^.])/, '$1.')
        for (const [header, value] of Object.entries(headers)) {
            this.setOption(header, value)
        }
    }

    setOption (name, values) {
        setOption(this._packet, name, values)
        return this
    }

    setHeader (name, values) {
        return this.setOption(name, values)
    }
}

module.exports = OutgoingMessage
