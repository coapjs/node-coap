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
