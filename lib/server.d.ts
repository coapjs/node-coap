/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { EventEmitter } from 'events'
import { CoapServerOptions, requestListener } from '../index'
import { AddressInfo } from 'net'
import { ParsedPacket } from 'coap-packet'
import { Socket } from 'dgram'

export default class Server extends EventEmitter {
    _sock: Socket
    constructor (options?: CoapServerOptions | typeof requestListener, listener?: typeof requestListener)
    _sendError (payload: Buffer, rsinfo: AddressInfo, packet: ParsedPacket): void
    _sendProxied (packet: ParsedPacket, proxyUri: string, callback?: (error: Error | null, bytes: number) => void): void
    _sendReverseProxied (packet: ParsedPacket, rsinfo: AddressInfo, callback?: (error: Error | null, bytes: number) => void): void
    listen (port?: number | EventEmitter | Function, address?: string | Function, done?: Function): this
    close (done: Function): this
}
