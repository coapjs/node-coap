/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { OptionName, ParsedPacket } from 'coap-packet'
import { Writable } from 'stream'
import { OptionValue } from '../index'
import { setOption } from './helpers'

export default class OutgoingMessage extends Writable {
    _packet: ParsedPacket
    _request?: ParsedPacket
    constructor(request: ParsedPacket, send: (req: OutgoingMessage, packet: ParsedPacket) => void)
    code: string
    statusCode: string
    reset (): OutgoingMessage
    setOption: typeof setOption
    setHeader: typeof setOption
    _send(req: OutgoingMessage, packet: ParsedPacket): void

    writeHead (code: string | number, headers: Partial<Record<OptionName, OptionValue>>): void
}
