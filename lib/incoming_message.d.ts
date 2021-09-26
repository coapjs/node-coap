import { Readable } from 'stream'
import { ParsedPacket, CoapMethod, OptionName } from 'coap-packet'
import { AddressInfo } from 'net'
import { Socket } from 'dgram'
import { Option, OptionValue } from '..'



export default class IncomingMessage extends Readable {
    _packet: ParsedPacket
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
