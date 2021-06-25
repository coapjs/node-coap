'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const Readable = require('readable-stream').Readable
const util = require('util')
const pktToMsg = require('./helpers').packetToMessage

function ObserveReadStream (packet, rsinfo, outSocket) {
    Readable.call(this, { objectMode: true })

    this.rsinfo = rsinfo
    this.outSocket = outSocket

    this._lastId = undefined
    this._lastTime = 0
    this._disableFiltering = false
    this.append(packet)
}

util.inherits(ObserveReadStream, Readable)

ObserveReadStream.prototype.append = function (packet) {
    if (!this.readable) { return }

    pktToMsg(this, packet)

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

ObserveReadStream.prototype.close = function (eagerDeregister) {
    this.push(null)
    this.emit('close')
    if (eagerDeregister) {
        this.emit('deregister')
    }
}

// nothing to do, data will be pushed from the server
ObserveReadStream.prototype._read = function () {}

module.exports = ObserveReadStream
