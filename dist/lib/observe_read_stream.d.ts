/// <reference types="node" />
import { AddressInfo } from 'net';
import IncomingMessage from './incoming_message';
import { CoapPacket } from '../models/models';
export default class ObserveReadStream extends IncomingMessage {
    _lastId: number | undefined;
    _lastTime: number;
    _disableFiltering: boolean;
    constructor(packet: CoapPacket, rsinfo: AddressInfo, outSocket: AddressInfo);
    append(packet: CoapPacket, firstPacket: boolean): void;
    close(eagerDeregister?: boolean): void;
    _read(): void;
}
