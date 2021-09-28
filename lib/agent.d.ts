/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { EventEmitter } from 'events'
import { CoapRequestParams, AgentOptions } from '../index'
import OutgoingMessage from './outgoing_message'
import { Socket } from 'dgram'
import { AddressInfo } from 'net'
import { Packet } from 'coap-packet'

export default class Agent extends EventEmitter  {
    constructor(opts: AgentOptions)

    request(url: string | CoapRequestParams): OutgoingMessage

    abort(req: OutgoingMessage): void

    _opts: AgentOptions
    _init(socket: typeof Socket): void
    _closing: boolean
    _sock: Socket
    _msgIdToReq: {}
    _tkToReq: {}
    _tkToMulticastResAddr: {}
    _lastToken: number
    _lastMessageId: number
    _msgInFlight: number
    _requests: number
    _cleanUp(): void
    _doClose(): void
    _handle(msg: Packet, rsinfo: AddressInfo, outSocket: Socket): void | Error
    _nextToken(): Buffer
    _nextMessageId(): number
    urlPropertyToPacketOption(url: any, req: any, property: any, option: any, separator: any): void
    _convertMulticastToUnicastRequest(req: any, rsinfo: any): any
}
