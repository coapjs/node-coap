'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const BufferList = require('bl')
const helpers = require('./helpers')
const toCode = helpers.toCode

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

        if (request.confirmable) {
        // replying in piggyback
            this._packet.ack = true

            this._ackTimer = setTimeout(() => {
                send(this, helpers.genAck(request))

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

        packet.code = toCode(this.code || this.statusCode)
        packet.payload = this

        if (this._ackTimer) {
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
        packet.payload = ''
        packet.reset = true
        packet.ack = false
        packet.token = ''

        if (this._ackTimer) {
            clearTimeout(this._ackTimer)
        }

        this._send(this, packet)

        // easy clean up after generating the packet
        delete this._packet.payload

        return this
    }

    writeHead (code, headers) {
        const packet = this._packet
        let header
        packet.code = String(code).replace(/(^\d[^.])/, '$1.')
        for (header in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, header)) {
                this.setOption(header, headers[header])
            }
        }
    }
}

helpers.addSetOption(OutgoingMessage)

module.exports = OutgoingMessage
