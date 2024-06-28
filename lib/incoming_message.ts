/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import type { CoapMethod, OptionName } from 'coap-packet'
import type { AddressInfo } from 'net'
import { Readable } from 'readable-stream'
import type { ReadableOptions } from 'readable-stream'
import type { CoapPacket, OptionValue } from '../models/models'
import { packetToMessage } from './helpers'

class IncomingMessage extends Readable {
    rsinfo: AddressInfo
    outSocket?: AddressInfo
    _packet: CoapPacket
    _payloadIndex: number
    url: string
    payload: Buffer
    headers: Partial<Record<OptionName, OptionValue>>
    method: CoapMethod
    code: string

    constructor (packet: CoapPacket, rsinfo: AddressInfo, outSocket?: AddressInfo, options?: ReadableOptions) {
        super(options)

        packetToMessage(this, packet)

        this.rsinfo = rsinfo
        this.outSocket = outSocket

        this._packet = packet
        this._payloadIndex = 0
    }

    _read (size: number): void {
        const end = this._payloadIndex + size
        const start = this._payloadIndex
        const payload = this._packet.payload
        let buf: any = null

        if (payload != null && start < payload.length) {
            buf = payload.slice(start, end)
        }

        this._payloadIndex = end
        this.push(buf)
    }
}

export default IncomingMessage
