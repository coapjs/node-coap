/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { ParsedPacket } from 'coap-packet'
import IncomingMessage from './incoming_message'

export default class ObserveReadStream extends IncomingMessage {
    _lastId?: number
    _lastTime: Date
    _disableFiltering: boolean
    close (eagerDeregister?: boolean): void
    append(packet: ParsedPacket, firstPacket: boolean): void
    _read (): void
}
