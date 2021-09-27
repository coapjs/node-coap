import { EventEmitter } from 'events'
import { CoapRequestParams, AgentOptions } from '../index'
import OutgoingMessage from './outgoing_message'

export default class Agent extends EventEmitter  {
    constructor(opts: AgentOptions)

    request(url: string | CoapRequestParams): OutgoingMessage

    abort(req: OutgoingMessage): void
}
