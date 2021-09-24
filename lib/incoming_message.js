'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const Readable = require('readable-stream').Readable
const pktToMsg = require('./helpers').packetToMessage

class IncomingMessage extends Readable {
    constructor (packet, rsinfo, outSocket) {
        super()

        pktToMsg(this, packet)

        this.rsinfo = rsinfo
        this.outSocket = outSocket

        this._packet = packet
        this._payloadIndex = 0
    }

    _read (size) {
        const end = this._payloadIndex + size
        const start = this._payloadIndex
        const payload = this._packet.payload
        let buf = null

        if (start < payload.length) {
            buf = payload.slice(start, end)
        }

        this._payloadIndex = end
        this.push(buf)
    }
}

module.exports = IncomingMessage
