'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const IncomingMessage = require('./incoming_message')
const pktToMsg = require('./helpers').packetToMessage

class ObserveReadStream extends IncomingMessage {
    constructor (packet, rsinfo, outSocket) {
        super(packet, rsinfo, outSocket, { objectMode: true })

        this._lastId = undefined
        this._lastTime = 0
        this._disableFiltering = false
        this.append(packet, true)
    }

    append (packet, firstPacket) {
        if (!this.readable) {
            return
        }

        if (!firstPacket) {
            pktToMsg(this, packet)
        }

        // First notification
        if (this._lastId === undefined) {
            this._lastId = this.headers.Observe - 1
        }

        const dseq = (this.headers.Observe - this._lastId) & 0xffffff
        const dtime = Date.now() - this._lastTime

        if (this._disableFiltering || (dseq > 0 && dseq < (1 << 23)) || dtime > 128 * 1000) {
            this._lastId = this.headers.Observe
            this._lastTime = Date.now()
            this.push(packet.payload)
        }
    }

    close (eagerDeregister) {
        this.push(null)
        this.emit('close')
        if (eagerDeregister) {
            this.emit('deregister')
        }
    }

    // nothing to do, data will be pushed from the server
    _read () {}
}

module.exports = ObserveReadStream
