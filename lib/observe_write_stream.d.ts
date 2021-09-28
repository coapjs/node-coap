/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { Writable } from 'stream'
import { ParsedPacket } from 'coap-packet'
import { setOption } from './helpers'

// TODO: Inherit from OutgoingMessage
export default class ObserveWriteStream extends Writable {
    constructor(request: ParsedPacket, send: (req: ObserveWriteStream, packet: ParsedPacket) => void)
    _write(data: Buffer, encoding: BufferEncoding, done: (error?: Error | null) => void): void
    _doSend (data: Buffer): void
    reset (): void
    setOption: typeof setOption
    setHeader: typeof setOption
}
