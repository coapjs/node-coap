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

/**
 * @typedef { import('coap-packet').ParsedPacket } ParsedPacket
 * @typedef { import('coap-packet').Packet } Packet
 * @typedef { import('coap-packet').OptionName } OptionName
 * @typedef { import('net').AddressInfo } AddressInfo
 * @typedef { import('readable-stream').ReadableOptions } ReadableOptions
 * @typedef { import('dgram').Socket } Socket
 * @typedef { import('coap-packet').CoapMethod } CoapMethod
 * @typedef { import('../index').OptionValue } OptionValue
 */

class IncomingMessage extends Readable {
    /**
     *
     * @param {Packet} packet
     * @param {AddressInfo} rsinfo
     * @param {AddressInfo} [outSocket]
     * @param {ReadableOptions} [options]
     */
    constructor (packet, rsinfo, outSocket, options) {
        super(options)

        /** @type {string} */
        this.code = undefined
        /** @type {CoapMethod} */
        this.method = undefined
        /** @type {Partial<Record<OptionName, OptionValue>>} */
        this.headers = {}
        /** @type {Buffer} */
        this.payload = undefined
        /** @type {string} */
        this.url = undefined

        pktToMsg(this, packet)

        /** @type {AddressInfo} */
        this.rsinfo = rsinfo
        /** @type {AddressInfo} */
        this.outSocket = outSocket

        /** @type {Packet} */
        this._packet = packet
        /** @type {number} */
        this._payloadIndex = 0
    }

    /**
     *
     * @param {number} size
     */
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
