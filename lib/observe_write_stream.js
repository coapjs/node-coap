'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const Writable = require('readable-stream').Writable
const helpers = require('./helpers')

class ObserveWriteStream extends Writable {
    constructor (request, send) {
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
        this.statusCode = ''

        this._counter = 0

        const that = this
        this.on('finish', function () {
            if (that._counter === 0) { // we have sent no messages
                that._doSend(null)
            }
        })
    }

    _write (data, encoding, done) {
        this.setOption('Observe', ++this._counter)

        if (this._counter === 16777215) {
            this._counter = 1
        }

        this._doSend(data)

        done()
    }

    _doSend (data) {
        const packet = this._packet
        packet.code = this.statusCode
        packet.payload = data
        this._send(this, packet)

        this._packet.confirmable = this._request.confirmable
        this._packet.ack = !this._request.confirmable
        delete this._packet.messageId
        delete this._packet.payload
    }

    reset () {
        const packet = this._packet
        packet.code = '0.00'
        packet.payload = ''
        packet.reset = true
        packet.ack = false
        packet.token = Buffer.alloc(0)

        this._send(this, packet)

        this._packet.confirmable = this._request.confirmable
        delete this._packet.messageId
        delete this._packet.payload
    }
}

helpers.addSetOption(ObserveWriteStream)

module.exports = ObserveWriteStream
