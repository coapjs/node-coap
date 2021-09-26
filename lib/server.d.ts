import { EventEmitter } from 'events'
import { CoapServerOptions } from '..'
import { AddressInfo } from 'net'
import { ParsedPacket } from 'coap-packet'
import { Socket } from 'dgram'

export default class Server extends EventEmitter {
    _sock: Socket
    constructor (options: CoapServerOptions, listener: Function)
    _sendError (payload: Buffer, rsinfo: AddressInfo, packet: ParsedPacket): void
    _sendProxied (packet: ParsedPacket, proxyUri: string, callback?: (error: Error | null, bytes: number) => void): void
    _sendReverseProxied (packet: ParsedPacket, rsinfo: AddressInfo, callback?: (error: Error | null, bytes: number) => void): void
    listen (port?: number | EventEmitter | Function, address?: string | Function, done?: Function): this
    close (done: Function): this
}
