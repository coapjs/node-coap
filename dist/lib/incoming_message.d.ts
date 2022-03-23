/// <reference types="node" />
import { CoapMethod, OptionName } from 'coap-packet';
import { AddressInfo } from 'net';
import { Readable, ReadableOptions } from 'readable-stream';
import { CoapPacket, OptionValue } from '../models/models';
declare class IncomingMessage extends Readable {
    rsinfo: AddressInfo;
    outSocket?: AddressInfo;
    _packet: CoapPacket;
    _payloadIndex: number;
    url: string;
    payload: Buffer;
    headers: Partial<Record<OptionName, OptionValue>>;
    method: CoapMethod;
    code: string;
    constructor(packet: CoapPacket, rsinfo: AddressInfo, outSocket?: AddressInfo, options?: ReadableOptions);
    _read(size: number): void;
}
export default IncomingMessage;
