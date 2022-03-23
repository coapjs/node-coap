/// <reference types="node" />
import { OptionName, Packet } from 'coap-packet';
import { Writable } from 'stream';
import { CoapPacket, OptionValue } from '../models/models';
export default class ObserveWriteStream extends Writable {
    _packet: Packet;
    _request: Packet;
    _send: (message: ObserveWriteStream, packet: Packet) => void;
    code: string;
    statusCode: string;
    _counter: number;
    _cachekey: string;
    _addCacheEntry: Function;
    constructor(request: Packet, send: (message: ObserveWriteStream, packet: CoapPacket) => void);
    _write(data: Buffer, encoding: string, done: () => void): void;
    _doSend(data?: Buffer): void;
    reset(): void;
    setOption(name: OptionName, values: OptionValue): this;
    setHeader(name: OptionName, values: OptionValue): this;
}
