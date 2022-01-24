/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import BufferList from 'bl'
import { CoapPacket, CoapRequestParams, OptionValue } from '../models/models'
import { genAck, toCode, setOption } from './helpers'
import RetrySend from './retry_send'
import { SegmentedTransmission } from './segmentation'
import IncomingMessage from './incoming_message'
import { OptionName, Packet } from 'coap-packet'

export default class OutgoingMessage extends BufferList implements BufferList {
    _packet: Packet
    _ackTimer: NodeJS.Timeout | null
    _send: (req: OutgoingMessage, packet: Packet) => void
    statusCode: string
    code: string
    multicast: boolean
    _request: CoapPacket
    url: CoapRequestParams
    sender: RetrySend
    _totalPayload: Buffer
    multicastTimer: NodeJS.Timeout
    segmentedSender?: SegmentedTransmission
    response: IncomingMessage
    constructor (request: CoapPacket, send: (req: OutgoingMessage, packet: CoapPacket) => void) {
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

    end (a?: any, b?: any): this {
        super.end(a, b)

        const packet = this._packet

        const code = this.code !== '' ? this.code : this.statusCode
        packet.code = toCode(code)
        packet.payload = this as unknown as Buffer

        if (this._ackTimer != null) {
            clearTimeout(this._ackTimer)
        }

        this._send(this, packet)

        // easy clean up after generating the packet
        delete this._packet.payload

        return this
    }

    reset (): this {
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

    /**
     * @param {OptionName | number} code
     * @param {Partial<Record<OptionName, OptionValue>>} headers
     */
    writeHead (code: OptionName | number, headers: Partial<Record<OptionName, OptionValue>>): void {
        const packet = this._packet
        packet.code = String(code).replace(/(^\d[^.])/, '$1.')
        for (const [header, value] of Object.entries(headers)) {
            this.setOption(header as OptionName, value)
        }
    }

    setOption (name: OptionName | string, values: OptionValue): this {
        setOption(this._packet, name, values)
        return this
    }

    setHeader (name: OptionName, values: OptionValue): this {
        return this.setOption(name, values)
    }
}
