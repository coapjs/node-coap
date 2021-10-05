/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { AddressInfo } from 'net'
import IncomingMessage from './incoming_message'
import { packetToMessage } from './helpers'
import { CoapPacket } from '../models/models'

export default class ObserveReadStream extends IncomingMessage {
    _lastId: number | undefined
    _lastTime: number
    _disableFiltering: boolean
    constructor (packet: CoapPacket, rsinfo: AddressInfo, outSocket: AddressInfo) {
        super(packet, rsinfo, outSocket, { objectMode: true })

        this._lastId = undefined
        this._lastTime = 0
        this._disableFiltering = false
        this.append(packet, true)
    }

    append (packet: CoapPacket, firstPacket: boolean): void {
        if (!this.readable) {
            return
        }

        if (!firstPacket) {
            packetToMessage(this, packet)
        }

        if (typeof this.headers.Observe !== 'number') {
            return
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

    close (eagerDeregister?: boolean): void {
        this.push(null)
        this.emit('close')
        if (eagerDeregister === true) {
            this.emit('deregister')
        }
    }

    // nothing to do, data will be pushed from the server
    _read (): void {}
}
