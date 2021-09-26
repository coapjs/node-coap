import { OptionName, ParsedPacket } from 'coap-packet'
import { Writable } from 'stream'
import { OptionValue, setOption } from '..'

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
