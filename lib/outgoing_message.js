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

/**
 * @typedef { import('./incoming_message') } IncomingMessage
 * @typedef { import('./segmentation').SegmentedTransmission } SegmentedTransmission
 * @typedef { import('coap-packet').OptionName } OptionName
 * @typedef { import('coap-packet').Packet } Packet
 * @typedef { import('../index').OptionValue } OptionValue
 * @typedef { import('../index').CoapPacket } CoapPacket
 * @typedef { import('../index').CoapRequestParams } CoapRequestParams
 * @typedef { import('./retry_send') } RetrySend
 */

class OutgoingMessage extends BufferList {
    /**
     *
     * @param {CoapPacket}  request
     * @param {(req: OutgoingMessage, packet: CoapPacket) => void} send
     */
    constructor (request, send) {
        super()

        /** @type {Packet} */
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

        /** @type {string} */
        this.statusCode = ''
        /** @type {string} */
        this.code = ''
        /** @type {boolean} */
        this.multicast = false
        /** @type {CoapPacket} */
        this._request = undefined
        /** @type {CoapRequestParams} */
        this.url = undefined
        /** @type {RetrySend} */
        this.sender = undefined
        /** @type {Buffer} */
        this._totalPayload = undefined
        /** @type {NodeJS.Timeout} */
        this.multicastTimer = undefined
        /** @type {SegmentedTransmission} */
        this.segmentedSender = undefined
        /** @type {IncomingMessage} */
        this.response = undefined
    }

    end (a, b) {
        super.end(a, b)

        const packet = this._packet

        packet.code = toCode(this.code || this.statusCode)
        /** @type {any} */
        const payload = this
        packet.payload = payload

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
        packet.payload = Buffer.alloc(0)
        packet.reset = true
        packet.ack = false
        packet.token = Buffer.alloc(0)

        if (this._ackTimer) {
            clearTimeout(this._ackTimer)
        }

        this._send(this, packet)

        // easy clean up after generating the packet
        delete this._packet.payload

        return this
    }

    /**
     * @param {OptionName | number} code
     * @param {Partial<Record<OptionName, OptionValue>>} headers
     */
    writeHead (code, headers) {
        const packet = this._packet
        packet.code = String(code).replace(/(^\d[^.])/, '$1.')
        for (const [header, value] of Object.entries(headers)) {
            /** @type {any} */
            const optionHeader = header
            this.setOption(optionHeader, value)
        }
    }

    /**
     * @param {OptionName} name
     * @param {OptionValue} values
     * @returns {this}
     */
    setOption (name, values) {
        helpers.setOption(this._packet, name, values)
        return this
    }

    /**
     *
     * @param {OptionName} name
     * @param {OptionValue} values
     * @returns {this}
     */
    setHeader (name, values) {
        return this.setOption(name, values)
    }
}

module.exports = OutgoingMessage
