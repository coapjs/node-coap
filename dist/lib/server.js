"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const net_1 = require("net");
const cache_1 = __importDefault(require("./cache"));
const outgoing_message_1 = __importDefault(require("./outgoing_message"));
const dgram_1 = require("dgram");
const lru_cache_1 = __importDefault(require("lru-cache"));
const os_1 = __importDefault(require("os"));
const incoming_message_1 = __importDefault(require("./incoming_message"));
const observe_write_stream_1 = __importDefault(require("./observe_write_stream"));
const retry_send_1 = __importDefault(require("./retry_send"));
const middlewares_1 = require("./middlewares");
const block_1 = require("./block");
const coap_packet_1 = require("coap-packet");
const helpers_1 = require("./helpers");
const parameters_1 = require("./parameters");
const fastseries_1 = __importDefault(require("fastseries"));
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('CoAP Server');
function handleEnding(err) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const request = this;
    if (err != null) {
        request.server._sendError(Buffer.from(err.message), request.rsinfo, request.packet);
    }
}
function removeProxyOptions(packet) {
    const cleanOptions = [];
    if (packet.options == null) {
        packet.options = [];
    }
    for (let i = 0; i < packet.options.length; i++) {
        const optionName = packet.options[i].name;
        if (typeof optionName === 'string' &&
            optionName.toLowerCase() !== 'proxy-uri' &&
            optionName.toLowerCase() !== 'proxy-scheme') {
            cleanOptions.push(packet.options[i]);
        }
    }
    packet.options = cleanOptions;
    return packet;
}
function allAddresses(type) {
    var _a;
    let family = 'IPv4';
    if (type === 'udp6') {
        family = 'IPv6';
    }
    const addresses = [];
    const interfaces = os_1.default.networkInterfaces();
    for (const ifname in interfaces) {
        if (ifname in interfaces) {
            (_a = interfaces[ifname]) === null || _a === void 0 ? void 0 : _a.forEach((a) => {
                if (a.family === family) {
                    addresses.push(a.address);
                }
            });
        }
    }
    return addresses;
}
class CoapLRUCache extends lru_cache_1.default {
}
class CoAPServer extends events_1.EventEmitter {
    constructor(serverOptions, listener) {
        super();
        this._options = {};
        this._proxiedRequests = new Map();
        this._options = {};
        if (typeof serverOptions === 'function') {
            listener = serverOptions;
        }
        else if (serverOptions != null) {
            this._options = serverOptions;
        }
        this._middlewares = [middlewares_1.parseRequest];
        if (this._options.proxy === true) {
            this._middlewares.push(middlewares_1.proxyRequest);
            this._middlewares.push(middlewares_1.handleProxyResponse);
        }
        if (typeof this._options.clientIdentifier !== 'function') {
            this._options.clientIdentifier = (request) => {
                return `${request.rsinfo.address}:${request.rsinfo.port}`;
            };
        }
        this._clientIdentifier = this._options.clientIdentifier;
        if ((this._options.piggybackReplyMs == null) ||
            !(0, helpers_1.isNumeric)(this._options.piggybackReplyMs)) {
            this._options.piggybackReplyMs = parameters_1.parameters.piggybackReplyMs;
        }
        if (!(0, helpers_1.isBoolean)(this._options.sendAcksForNonConfirmablePackets)) {
            this._options.sendAcksForNonConfirmablePackets =
                parameters_1.parameters.sendAcksForNonConfirmablePackets;
        }
        this._middlewares.push(middlewares_1.handleServerRequest);
        // Multicast settings
        this._multicastAddress = (this._options.multicastAddress != null)
            ? this._options.multicastAddress
            : null;
        this._multicastInterface = (this._options.multicastInterface != null)
            ? this._options.multicastInterface
            : null;
        // We use an LRU cache for the responses to avoid
        // DDOS problems.
        // max packet size is 1280
        // 32 MB / 1280 = 26214
        // The max lifetime is roughly 200s per packet.
        // Which gave us 131 packets/second guarantee
        let max = 32768 * 1024;
        if (typeof this._options.cacheSize === 'number' && this._options.cacheSize >= 0) {
            max = this._options.cacheSize;
        }
        this._lru = new CoapLRUCache({
            max,
            length: (n, key) => {
                return n.buffer.byteLength;
            },
            maxAge: parameters_1.parameters.exchangeLifetime * 1000,
            dispose: (key, value) => {
                if (value.sender != null) {
                    value.sender.reset();
                }
            }
        });
        this._series = (0, fastseries_1.default)();
        this._block1Cache = new cache_1.default(parameters_1.parameters.exchangeLifetime * 1000, () => {
            return {};
        });
        this._block2Cache = new cache_1.default(parameters_1.parameters.exchangeLifetime * 1000, () => {
            return null;
        });
        if (listener != null) {
            this.on('request', listener);
        }
        debug('initialized');
    }
    handleRequest() {
        return (msg, rsinfo) => {
            const request = {
                raw: msg,
                rsinfo: rsinfo,
                server: this
            };
            const activeMiddlewares = [];
            for (let i = 0; i < this._middlewares.length; i++) {
                activeMiddlewares.push(this._middlewares[i]);
            }
            this._series(request, activeMiddlewares, request, handleEnding);
        };
    }
    _sendError(payload, rsinfo, packet, code = '5.00') {
        const message = (0, coap_packet_1.generate)({
            code,
            payload: payload,
            messageId: packet != null ? packet.messageId : undefined,
            token: packet != null ? packet.token : undefined
        });
        if (this._sock instanceof dgram_1.Socket) {
            this._sock.send(message, 0, message.length, rsinfo.port);
        }
    }
    _sendProxied(packet, proxyUri, callback) {
        const url = new URL(proxyUri);
        const host = url.hostname;
        const port = parseInt(url.port);
        const message = (0, coap_packet_1.generate)(removeProxyOptions(packet));
        if (this._sock instanceof dgram_1.Socket) {
            this._sock.send(message, port, host, callback);
        }
    }
    _sendReverseProxied(packet, rsinfo, callback) {
        const host = rsinfo.address;
        const port = rsinfo.port;
        const message = (0, coap_packet_1.generate)(packet);
        if (this._sock instanceof dgram_1.Socket) {
            this._sock.send(message, port, host, callback);
        }
    }
    generateSocket(address, port, done) {
        var _a;
        const socketOptions = {
            type: (_a = this._options.type) !== null && _a !== void 0 ? _a : 'udp4',
            reuseAddr: this._options.reuseAddr
        };
        const sock = (0, dgram_1.createSocket)(socketOptions);
        sock.bind(port, address, () => {
            try {
                if (this._multicastAddress != null) {
                    const multicastAddress = this._multicastAddress;
                    sock.setMulticastLoopback(true);
                    if (this._multicastInterface != null) {
                        sock.addMembership(multicastAddress, this._multicastInterface);
                    }
                    else {
                        allAddresses(this._options.type).forEach((_interface) => {
                            sock.addMembership(multicastAddress, _interface);
                        });
                    }
                }
            }
            catch (err) {
                if (done != null) {
                    return done(err);
                }
                else {
                    throw err;
                }
            }
            if (done != null) {
                return done();
            }
        });
        return sock;
    }
    listen(portOrCallback, addressOrCallback, done) {
        let port = parameters_1.parameters.coapPort;
        if (typeof portOrCallback === 'function') {
            done = portOrCallback;
            port = parameters_1.parameters.coapPort;
        }
        else if (typeof portOrCallback === 'number') {
            port = portOrCallback;
        }
        let address;
        if (typeof addressOrCallback === 'function') {
            done = addressOrCallback;
        }
        else if (typeof addressOrCallback === 'string') {
            address = addressOrCallback;
        }
        if (this._sock != null) {
            if (done != null) {
                done(new Error('Already listening'));
            }
            else {
                throw new Error('Already listening');
            }
            return this;
        }
        if (address != null && (0, net_1.isIPv6)(address)) {
            this._options.type = 'udp6';
        }
        if (this._options.type == null) {
            this._options.type = 'udp4';
        }
        if (this._options.reuseAddr !== false) {
            this._options.reuseAddr = true;
        }
        if (portOrCallback instanceof events_1.EventEmitter) {
            this._sock = portOrCallback;
            if (done != null) {
                setImmediate(done);
            }
        }
        else {
            this._internal_socket = true;
            this._sock = this.generateSocket(address, port, done);
        }
        this._sock.on('message', this.handleRequest());
        this._sock.on('error', (error) => {
            this.emit('error', error);
        });
        if (parameters_1.parameters.pruneTimerPeriod != null) {
            // Start LRU pruning timer
            this._lru.pruneTimer = setInterval(() => {
                this._lru.prune();
            }, parameters_1.parameters.pruneTimerPeriod * 1000);
            if (this._lru.pruneTimer.unref != null) {
                this._lru.pruneTimer.unref();
            }
        }
        return this;
    }
    close(done) {
        if (done != null) {
            setImmediate(done);
        }
        if (this._lru.pruneTimer != null) {
            clearInterval(this._lru.pruneTimer);
        }
        if (this._sock != null) {
            if (this._internal_socket && this._sock instanceof dgram_1.Socket) {
                this._sock.close();
            }
            this._lru.reset();
            this._sock = null;
            this.emit('close');
        }
        else {
            this._lru.reset();
        }
        this._block2Cache.reset();
        this._block1Cache.reset();
        return this;
    }
    /**
     * Entry point for a new datagram from the client.
     * @param packet The packet that was sent from the client.
     * @param rsinfo Connection info
     */
    _handle(packet, rsinfo) {
        var _a, _b, _c, _d, _e, _f, _g;
        if (packet.code == null || packet.code[0] !== '0') {
            // According to RFC7252 Section 4.2 receiving a confirmable messages
            // that can't be processed, should be rejected by ignoring it AND
            // sending a reset. In this case confirmable response message would
            // be silently ignored, which is not exactly as stated in the standard.
            // However, sending a reset would interfere with a coap client which is
            // re-using a socket (see pull-request #131).
            return;
        }
        const sock = this._sock;
        const lru = this._lru;
        let Message = OutMessage;
        const request = new incoming_message_1.default(packet, rsinfo);
        const cached = lru.peek(this._toKey(request, packet, true));
        if (cached != null && !((_a = packet.ack) !== null && _a !== void 0 ? _a : false) && !((_b = packet.reset) !== null && _b !== void 0 ? _b : false) && sock instanceof dgram_1.Socket) {
            return sock.send(cached, 0, cached.length, rsinfo.port, rsinfo.address);
        }
        else if (cached != null && (((_c = packet.ack) !== null && _c !== void 0 ? _c : false) || ((_d = packet.reset) !== null && _d !== void 0 ? _d : false))) {
            if (cached.response != null && ((_e = packet.reset) !== null && _e !== void 0 ? _e : false)) {
                cached.response.end();
            }
            return lru.del(this._toKey(request, packet, false));
        }
        else if ((_g = (_f = packet.ack) !== null && _f !== void 0 ? _f : packet.reset) !== null && _g !== void 0 ? _g : false) {
            return; // nothing to do, ignoring silently
        }
        if (request.headers.Observe === 0) {
            Message = observe_write_stream_1.default;
            if (packet.code !== '0.01' && packet.code !== '0.05') {
                // it is neither a GET nor a FETCH
                this._sendError(Buffer.from('Observe can only be present with a GET or a FETCH'), rsinfo);
                return;
            }
        }
        if (packet.code === '0.05' && request.headers['Content-Format'] == null) {
            return this._sendError(Buffer.from('FETCH requests must contain a Content-Format option'), rsinfo, undefined, '4.15' /* TODO: Check if this is the correct error code */);
        }
        const cacheKey = this._toCacheKey(request, packet);
        packet.piggybackReplyMs = this._options.piggybackReplyMs;
        const generateResponse = () => {
            const response = new Message(packet, (response, packet) => {
                /**
                 * Extended `Buffer` with additional fields for caching.
                 *
                 * TODO: Find a more elegant solution for this type.
                 */
                let buf;
                const sender = new retry_send_1.default(sock, rsinfo.port, rsinfo.address);
                try {
                    buf = (0, coap_packet_1.generate)(packet);
                }
                catch (err) {
                    response.emit('error', err);
                    return;
                }
                if (Message === OutMessage) {
                    sender.on('error', response.emit.bind(response, 'error'));
                }
                else {
                    buf.response = response;
                    sender.on('error', () => {
                        response.end();
                    });
                }
                const key = this._toKey(request, packet, packet.ack || !packet.confirmable);
                lru.set(key, buf);
                buf.sender = sender;
                if (this._options.sendAcksForNonConfirmablePackets === true ||
                    packet.confirmable) {
                    sender.send(buf, packet.ack || packet.reset || !packet.confirmable);
                }
                else {
                    debug('OMIT ACK PACKAGE');
                }
            });
            response.statusCode = '2.05';
            response._request = request._packet;
            if (cacheKey != null) {
                response._cachekey = cacheKey;
            }
            // inject this function so the response can add an entry to the cache
            response._addCacheEntry = this._block2Cache.add.bind(this._block2Cache);
            return response;
        };
        const response = generateResponse();
        request.rsinfo = rsinfo;
        if (packet.token != null && packet.token.length > 0) {
            // return cached value only if this request is not the first block request
            const block2Buff = (0, helpers_1.getOption)(packet.options, 'Block2');
            let requestedBlockOption;
            if (block2Buff instanceof Buffer) {
                requestedBlockOption = (0, helpers_1.parseBlock2)(block2Buff);
            }
            if (requestedBlockOption == null) {
                requestedBlockOption = { num: 0 };
            }
            if (cacheKey == null) {
                return;
            }
            else if (requestedBlockOption.num < 1) {
                if (this._block2Cache.remove(cacheKey)) {
                    debug('first block2 request, removed old entry from cache');
                }
            }
            else {
                debug('check if packet token is in cache, key:', cacheKey);
                if (this._block2Cache.contains(cacheKey)) {
                    debug('found cached payload, key:', cacheKey);
                    if (response != null) {
                        response.end(this._block2Cache.get(cacheKey));
                    }
                    return;
                }
            }
        }
        const block1Buff = (0, helpers_1.getOption)(packet.options, 'Block1');
        if (block1Buff instanceof Buffer) {
            const blockState = (0, block_1.parseBlockOption)(block1Buff);
            if (blockState != null) {
                const cachedData = this._block1Cache.getWithDefaultInsert(cacheKey);
                const blockByteSize = Math.pow(2, 4 + blockState.size);
                const incomingByteIndex = blockState.num * blockByteSize;
                // Store in the cache object, use the byte index as the key
                cachedData[incomingByteIndex] = request.payload;
                if (blockState.more === 0) {
                    // Last block
                    const byteOffsets = Object.keys(cachedData)
                        .map((str) => {
                        return parseInt(str);
                    })
                        .sort((a, b) => {
                        return a - b;
                    });
                    const byteTotalSum = incomingByteIndex + request.payload.length;
                    let next = 0;
                    const concat = Buffer.alloc(byteTotalSum);
                    for (let i = 0; i < byteOffsets.length; i++) {
                        if (byteOffsets[i] === next) {
                            const buff = cachedData[byteOffsets[i]];
                            if (!(buff instanceof Buffer)) {
                                continue;
                            }
                            buff.copy(concat, next, 0, buff.length);
                            next += buff.length;
                        }
                        else {
                            throw new Error('Byte offset not the next in line...');
                        }
                    }
                    if (cacheKey != null) {
                        this._block1Cache.remove(cacheKey);
                    }
                    if (next === concat.length) {
                        request.payload = concat;
                    }
                    else {
                        throw new Error('Last byte index is not equal to the concat buffer length!');
                    }
                }
                else {
                    // More blocks to come. ACK this block
                    if (response != null) {
                        response.code = '2.31';
                        response.setOption('Block1', block1Buff);
                        response.end();
                    }
                    return;
                }
            }
            else {
                throw new Error('Invalid block state');
            }
        }
        this.emit('request', request, response);
    }
    /**
     *
     * @param request
     * @param packet
     * @returns
     */
    _toCacheKey(request, packet) {
        if (packet.token != null && packet.token.length > 0) {
            return `${packet.token.toString('hex')}/${this._clientIdentifier(request)}`;
        }
        return null;
    }
    /**
     *
     * @param request
     * @param packet
     * @param appendToken
     * @returns
     */
    _toKey(request, packet, appendToken) {
        let result = this._clientIdentifier(request);
        if (packet.messageId != null) {
            result += `/${packet.messageId}`;
        }
        if (appendToken && packet.token != null) {
            result += packet.token.toString('hex');
        }
        return result;
    }
}
// maxBlock2 is in formular 2**(i+4), and must <= 2**(6+4)
let maxBlock2 = Math.pow(2, Math.floor(Math.log(parameters_1.parameters.maxPacketSize) / Math.log(2)));
if (maxBlock2 > Math.pow(2, 6 + 4)) {
    maxBlock2 = Math.pow(2, 6 + 4);
}
/*
new out message
inherit from OutgoingMessage
to handle cached answer and blockwise (2)
*/
class OutMessage extends outgoing_message_1.default {
    /**
     * Entry point for a response from the server
     *
     * @param payload A buffer-like object containing data to send back to the client.
     * @returns
     */
    end(payload) {
        // removeOption(this._request.options, 'Block1');
        // add logic for Block1 sending
        const block2Buff = (0, helpers_1.getOption)(this._request.options, 'Block2');
        let requestedBlockOption = null;
        // if we got blockwise (2) request
        if (block2Buff != null) {
            if (block2Buff instanceof Buffer) {
                requestedBlockOption = (0, helpers_1.parseBlock2)(block2Buff);
            }
            // bad option
            if (requestedBlockOption == null) {
                this.statusCode = '4.02';
                return super.end();
            }
        }
        // if payload is suitable for ONE message, shoot it out
        if (payload == null ||
            (requestedBlockOption == null && payload.length < parameters_1.parameters.maxPacketSize)) {
            return super.end(payload);
        }
        // for the first request, block2 option may be missed
        if (requestedBlockOption == null) {
            requestedBlockOption = {
                size: maxBlock2,
                more: 1,
                num: 0
            };
        }
        // block2 size should not bigger than maxBlock2
        if (requestedBlockOption.size > maxBlock2) {
            requestedBlockOption.size = maxBlock2;
        }
        // block number should have limit
        const lastBlockNum = Math.ceil(payload.length / requestedBlockOption.size) - 1;
        if (requestedBlockOption.num > lastBlockNum) {
            // precondition fail, may request for out of range block
            this.statusCode = '4.02';
            return super.end();
        }
        // check if requested block is the last
        const more = requestedBlockOption.num < lastBlockNum ? 1 : 0;
        const block2 = (0, helpers_1.createBlock2)({
            more,
            num: requestedBlockOption.num,
            size: requestedBlockOption.size
        });
        if (block2 == null) {
            // this catch never be match,
            // since we're gentleman, just handle it
            this.statusCode = '4.02';
            return super.end();
        }
        this.setOption('Block2', block2);
        this.setOption('ETag', _toETag(payload));
        // cache it
        if (this._request.token != null && this._request.token.length > 0) {
            this._addCacheEntry(this._cachekey, payload);
        }
        super.end(payload.slice(requestedBlockOption.num * requestedBlockOption.size, (requestedBlockOption.num + 1) * requestedBlockOption.size));
        return this;
    }
}
/*
calculate id of a payload by xor each 2-byte-block from it
use to generate etag
  payload         an input buffer, represent payload need to generate id (hash)
  id              return var, is a buffer(2)
*/
function _toETag(payload) {
    const id = Buffer.of(0, 0);
    let i = 0;
    do {
        id[0] ^= payload[i];
        id[1] ^= payload[i + 1];
        i += 2;
    } while (i < payload.length);
    return id;
}
exports.default = CoAPServer;
//# sourceMappingURL=server.js.map