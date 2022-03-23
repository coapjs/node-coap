/// <reference types="node" />
import { EventEmitter } from 'events';
import { AddressInfo } from 'net';
import { CoapServerOptions, requestListener, CoapPacket, MiddlewareParameters } from '../models/models';
import BlockCache from './cache';
import { Socket } from 'dgram';
import LRUCache from 'lru-cache';
import IncomingMessage from './incoming_message';
import { ParsedPacket } from 'coap-packet';
declare class CoapLRUCache<K, V> extends LRUCache<K, V> {
    pruneTimer: NodeJS.Timer;
}
declare class CoAPServer extends EventEmitter {
    _options: CoapServerOptions;
    _proxiedRequests: Map<string, MiddlewareParameters>;
    _middlewares: Function[];
    _multicastAddress: string | null;
    _multicastInterface: string | null;
    _lru: CoapLRUCache<string, any>;
    _series: any;
    _block1Cache: BlockCache<Buffer | {}>;
    _block2Cache: BlockCache<Buffer | null>;
    _sock: Socket | EventEmitter | null;
    _internal_socket: boolean;
    _clientIdentifier: (request: IncomingMessage) => string;
    constructor(serverOptions?: CoapServerOptions | typeof requestListener, listener?: typeof requestListener);
    handleRequest(): (msg: Buffer, rsinfo: AddressInfo) => void;
    _sendError(payload: Buffer, rsinfo: AddressInfo, packet?: CoapPacket, code?: string): void;
    _sendProxied(packet: CoapPacket, proxyUri: string, callback: (error: Error | null, bytes: number) => void): void;
    _sendReverseProxied(packet: ParsedPacket, rsinfo: AddressInfo, callback?: (error: Error | null, bytes: number) => void): void;
    private generateSocket;
    listen(portOrCallback?: number | EventEmitter | ((err?: Error) => void), addressOrCallback?: string | ((err?: Error) => void), done?: (err?: Error) => void): this;
    close(done?: (err?: Error) => void): this;
    /**
     * Entry point for a new datagram from the client.
     * @param packet The packet that was sent from the client.
     * @param rsinfo Connection info
     */
    _handle(packet: CoapPacket, rsinfo: AddressInfo): void;
    /**
     *
     * @param request
     * @param packet
     * @returns
     */
    _toCacheKey(request: IncomingMessage, packet: CoapPacket): string | null;
    /**
     *
     * @param request
     * @param packet
     * @param appendToken
     * @returns
     */
    _toKey(request: IncomingMessage, packet: CoapPacket, appendToken: boolean): string;
}
export default CoAPServer;
