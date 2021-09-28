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

export default class Agent extends EventEmitter  {
    constructor(opts: AgentOptions)

    request(url: string | CoapRequestParams): OutgoingMessage

    abort(req: OutgoingMessage): void
}
