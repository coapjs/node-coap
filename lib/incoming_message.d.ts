/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { Readable } from 'stream'
import { ParsedPacket, OptionName } from 'coap-packet'
import { AddressInfo } from 'net'
import { Socket } from 'dgram'
import { Option } from '../index'

export default class IncomingMessage extends Readable {
    _packet: ParsedPacket
    _payloadIndex: number
    url: string
    payload: Buffer
    options: Array<Option>
    headers: Partial<Record<OptionName, string | number>>
    code: string
    statusCode: string
    rsinfo: AddressInfo
    outsocket: Socket
    method: string

    constructor (packet: ParsedPacket, rsinfo: AddressInfo, outSocket: Socket)
    _read(size: number): void
}
