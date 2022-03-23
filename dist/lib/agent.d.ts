/// <reference types="node" />
import { Socket } from 'dgram';
import { AgentOptions, CoapRequestParams } from '../models/models';
import { EventEmitter } from 'events';
import { ParsedPacket } from 'coap-packet';
import OutgoingMessage from './outgoing_message';
import { AddressInfo } from 'net';
declare class Agent extends EventEmitter {
    _opts: AgentOptions;
    _closing: boolean;
    _sock: Socket | null;
    _msgIdToReq: Map<number, OutgoingMessage>;
    _tkToReq: Map<string, OutgoingMessage>;
    _tkToMulticastResAddr: Map<string, string[]>;
    private _lastToken;
    _lastMessageId: number;
    private _msgInFlight;
    _requests: number;
    constructor(opts?: AgentOptions);
    _init(socket?: Socket): void;
    close(done?: (err?: Error) => void): this;
    _cleanUp(): void;
    _doClose(done?: (err?: Error) => void): void;
    _handle(packet: ParsedPacket, rsinfo: AddressInfo, outSocket: AddressInfo): void;
    _nextToken(): Buffer;
    _nextMessageId(): number;
    /**
     * Entry point for a new client-side request.
     * @param url The parameters for the request
     */
    request(url: CoapRequestParams): OutgoingMessage;
    abort(req: OutgoingMessage): void;
    urlPropertyToPacketOption(url: CoapRequestParams, req: OutgoingMessage, property: string, option: string, separator: string): void;
    _convertMulticastToUnicastRequest(req: any, rsinfo: AddressInfo): OutgoingMessage | undefined;
}
export default Agent;
