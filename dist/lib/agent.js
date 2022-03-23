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
const crypto = require("crypto");
const dgram_1 = require("dgram");
const events_1 = require("events");
const coap_packet_1 = require("coap-packet");
const incoming_message_1 = __importDefault(require("./incoming_message"));
const outgoing_message_1 = __importDefault(require("./outgoing_message"));
const observe_read_stream_1 = __importDefault(require("./observe_read_stream"));
const retry_send_1 = __importDefault(require("./retry_send"));
const helpers_1 = require("./helpers");
const segmentation_1 = require("./segmentation");
const block_1 = require("./block");
const parameters_1 = require("./parameters");
const maxToken = Math.pow(2, 32);
const maxMessageId = Math.pow(2, 16);
class Agent extends events_1.EventEmitter {
    constructor(opts) {
        super();
        if (opts == null) {
            opts = {};
        }
        if (opts.type == null) {
            opts.type = 'udp4';
        }
        if (opts.socket != null) {
            const sock = opts.socket;
            opts.type = sock.type;
            delete opts.port;
        }
        this._opts = opts;
        this._init(opts.socket);
    }
    _init(socket) {
        var _a;
        this._closing = false;
        if (this._sock != null) {
            return;
        }
        this._sock = socket !== null && socket !== void 0 ? socket : (0, dgram_1.createSocket)({ type: (_a = this._opts.type) !== null && _a !== void 0 ? _a : 'udp4' });
        this._sock.on('message', (msg, rsinfo) => {
            let packet;
            try {
                packet = (0, coap_packet_1.parse)(msg);
            }
            catch (err) {
                return;
            }
            if (packet.code[0] === '0' && packet.code !== '0.00') {
                // ignore this packet since it's not a response.
                return;
            }
            if (this._sock != null) {
                const outSocket = this._sock.address();
                this._handle(packet, rsinfo, outSocket);
            }
        });
        if (this._opts.port != null) {
            this._sock.bind(this._opts.port);
        }
        this._sock.on('error', (err) => {
            this.emit('error', err);
        });
        this._msgIdToReq = new Map();
        this._tkToReq = new Map();
        this._tkToMulticastResAddr = new Map();
        this._lastToken = Math.floor(Math.random() * (maxToken - 1));
        this._lastMessageId = Math.floor(Math.random() * (maxMessageId - 1));
        this._msgInFlight = 0;
        this._requests = 0;
    }
    close(done) {
        if (this._msgIdToReq.size === 0 && this._msgInFlight === 0) {
            // No requests in flight, close immediately
            this._doClose(done);
            return this;
        }
        done = done !== null && done !== void 0 ? done : (() => { });
        this.once('close', done);
        for (const req of this._msgIdToReq.values()) {
            this.abort(req);
        }
        return this;
    }
    _cleanUp() {
        if (--this._requests !== 0) {
            return;
        }
        if (this._opts.socket == null) {
            this._closing = true;
        }
        if (this._msgInFlight > 0) {
            return;
        }
        this._doClose();
    }
    _doClose(done) {
        for (const req of this._msgIdToReq.values()) {
            req.sender.reset();
        }
        if (this._opts.socket != null) {
            return;
        }
        if (this._sock == null) {
            this.emit('close');
            return;
        }
        this._sock.close(() => {
            this._sock = null;
            if (done != null) {
                done();
            }
            this.emit('close');
        });
    }
    _handle(packet, rsinfo, outSocket) {
        let buf;
        let response;
        let req = this._msgIdToReq.get(packet.messageId);
        const ackSent = (err) => {
            if (err != null && req != null) {
                req.emit('error', err);
            }
            this._msgInFlight--;
            if (this._closing && this._msgInFlight === 0) {
                this._doClose();
            }
        };
        if (req == null) {
            if (packet.token.length > 0) {
                req = this._tkToReq.get(packet.token.toString('hex'));
            }
            if ((packet.ack || packet.reset) && req == null) {
                // Nothing to do on unknown or duplicate ACK/RST packet
                return;
            }
            if (req == null) {
                buf = (0, coap_packet_1.generate)({
                    code: '0.00',
                    reset: true,
                    messageId: packet.messageId
                });
                if (this._sock != null) {
                    this._msgInFlight++;
                    this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent);
                }
                return;
            }
        }
        if (packet.confirmable) {
            buf = (0, coap_packet_1.generate)({
                code: '0.00',
                ack: true,
                messageId: packet.messageId
            });
            if (this._sock != null) {
                this._msgInFlight++;
                this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent);
            }
        }
        if (packet.code !== '0.00' && (req._packet.token == null || req._packet.token.length !== packet.token.length || Buffer.compare(req._packet.token, packet.token) !== 0)) {
            // The tokens don't match, ignore the message since it is a malformed response
            return;
        }
        const block1Buff = (0, helpers_1.getOption)(packet.options, 'Block1');
        let block1 = null;
        if (block1Buff instanceof Buffer) {
            block1 = (0, block_1.parseBlockOption)(block1Buff);
            // check for error
            if (block1 == null) {
                req.sender.reset();
                req.emit('error', new Error('Failed to parse block1'));
                return;
            }
        }
        req.sender.reset();
        if (block1 != null && packet.ack) {
            // If the client takes too long to respond then the retry sender will send
            // another packet with the previous messageId, which we've already removed.
            const segmentedSender = req.segmentedSender;
            if (segmentedSender != null) {
                // If there's more to send/receive, then carry on!
                if (segmentedSender.remaining() > 0) {
                    if (segmentedSender.isCorrectACK(block1)) {
                        if (req._packet.messageId != null) {
                            this._msgIdToReq.delete(req._packet.messageId);
                        }
                        req._packet.messageId = this._nextMessageId();
                        this._msgIdToReq.set(req._packet.messageId, req);
                        segmentedSender.receiveACK(block1);
                    }
                    else {
                        segmentedSender.resendPreviousPacket();
                    }
                    return;
                }
                else {
                    // console.log("Packet received done");
                    if (req._packet.options != null) {
                        (0, helpers_1.removeOption)(req._packet.options, 'Block1');
                    }
                    delete req.segmentedSender;
                }
            }
        }
        if (!packet.confirmable && !req.multicast) {
            this._msgIdToReq.delete(packet.messageId);
        }
        // Drop empty messages (ACKs), but process RST
        if (packet.code === '0.00' && !packet.reset) {
            return;
        }
        const block2Buff = (0, helpers_1.getOption)(packet.options, 'Block2');
        let block2 = null;
        // if we got blockwise (2) response
        if (block2Buff instanceof Buffer) {
            block2 = (0, helpers_1.parseBlock2)(block2Buff);
            // check for error
            if (block2 == null) {
                req.sender.reset();
                req.emit('error', new Error('failed to parse block2'));
                return;
            }
        }
        if (block2 != null) {
            if (req.multicast) {
                req = this._convertMulticastToUnicastRequest(req, rsinfo);
                if (req == null) {
                    return;
                }
            }
            // accumulate payload
            req._totalPayload = Buffer.concat([req._totalPayload, packet.payload]);
            if (block2.more === 1) {
                // increase message id for next request
                if (req._packet.messageId != null) {
                    this._msgIdToReq.delete(req._packet.messageId);
                }
                req._packet.messageId = this._nextMessageId();
                this._msgIdToReq.set(req._packet.messageId, req);
                // next block2 request
                const block2Val = (0, helpers_1.createBlock2)({
                    more: 0,
                    num: block2.num + 1,
                    size: block2.size
                });
                if (block2Val == null) {
                    req.sender.reset();
                    req.emit('error', new Error('failed to create block2'));
                    return;
                }
                req.setOption('Block2', block2Val);
                req._packet.payload = undefined;
                req.sender.send((0, coap_packet_1.generate)(req._packet));
                return;
            }
            else {
                // get full payload
                packet.payload = req._totalPayload;
                // clear the payload incase of block2
                req._totalPayload = Buffer.alloc(0);
            }
        }
        if (req.response != null) {
            const response = req.response;
            if (response.append != null) {
                // it is an observe request
                // and we are already streaming
                return response.append(packet);
            }
            else {
                // TODO There is a previous response but is not an ObserveStream !
                return;
            }
        }
        else if (block2 != null && packet.token != null) {
            this._tkToReq.delete(packet.token.toString('hex'));
        }
        else if (req.url.observe !== true && !req.multicast) {
            // it is not, so delete the token
            this._tkToReq.delete(packet.token.toString('hex'));
        }
        if (req.url.observe === true && packet.code !== '4.04') {
            response = new observe_read_stream_1.default(packet, rsinfo, outSocket);
            response.on('close', () => {
                this._tkToReq.delete(packet.token.toString('hex'));
                this._cleanUp();
            });
            response.on('deregister', () => {
                const deregisterUrl = Object.assign({}, req === null || req === void 0 ? void 0 : req.url);
                deregisterUrl.observe = 1;
                deregisterUrl.token = req === null || req === void 0 ? void 0 : req._packet.token;
                const deregisterReq = this.request(deregisterUrl);
                // If the request fails, we'll deal with it with a RST message anyway.
                deregisterReq.on('error', () => { });
                deregisterReq.end();
            });
        }
        else {
            response = new incoming_message_1.default(packet, rsinfo, outSocket);
        }
        if (!req.multicast) {
            req.response = response;
        }
        req.emit('response', response);
    }
    _nextToken() {
        const buf = Buffer.alloc(8);
        if (++this._lastToken === maxToken) {
            this._lastToken = 0;
        }
        buf.writeUInt32BE(this._lastToken, 0);
        crypto.randomBytes(4).copy(buf, 4);
        return buf;
    }
    _nextMessageId() {
        if (++this._lastMessageId === maxMessageId) {
            this._lastMessageId = 0;
        }
        return this._lastMessageId;
    }
    /**
     * Entry point for a new client-side request.
     * @param url The parameters for the request
     */
    request(url) {
        var _a, _b, _c, _d;
        this._init();
        const options = (_a = url.options) !== null && _a !== void 0 ? _a : url.headers;
        const multicastTimeout = url.multicastTimeout != null ? url.multicastTimeout : 20000;
        const host = (_b = url.hostname) !== null && _b !== void 0 ? _b : url.host;
        const port = (_c = url.port) !== null && _c !== void 0 ? _c : parameters_1.parameters.coapPort;
        const req = new outgoing_message_1.default({}, (req, packet) => {
            var _a, _b;
            let buf;
            if (url.confirmable !== false) {
                packet.confirmable = true;
            }
            // multicast message should be forced non-confirmable
            if (url.multicast === true) {
                req.multicast = true;
                packet.confirmable = false;
            }
            if (!((_b = (_a = packet.ack) !== null && _a !== void 0 ? _a : packet.reset) !== null && _b !== void 0 ? _b : false)) {
                packet.messageId = this._nextMessageId();
                if ((url.token instanceof Buffer) && (url.token.length > 0)) {
                    if (url.token.length > 8) {
                        return req.emit('error', new Error('Token may be no longer than 8 bytes.'));
                    }
                    packet.token = url.token;
                }
                else {
                    packet.token = this._nextToken();
                }
                const token = packet.token.toString('hex');
                if (req.multicast) {
                    this._tkToMulticastResAddr.set(token, []);
                }
                if (token != null) {
                    this._tkToReq.set(token, req);
                }
            }
            if (packet.messageId != null) {
                this._msgIdToReq.set(packet.messageId, req);
            }
            const block1Buff = (0, helpers_1.getOption)(packet.options, 'Block1');
            if (block1Buff != null) {
                // Setup for a segmented transmission
                req.segmentedSender = new segmentation_1.SegmentedTransmission(block1Buff[0], req, packet);
                req.segmentedSender.sendNext();
            }
            else {
                try {
                    buf = (0, coap_packet_1.generate)(packet);
                }
                catch (err) {
                    req.sender.reset();
                    return req.emit('error', err);
                }
                req.sender.send(buf, packet.confirmable === false);
            }
        });
        req.sender = new retry_send_1.default(this._sock, port, host, url.retrySend);
        req.url = url;
        req.statusCode = (_d = url.method) !== null && _d !== void 0 ? _d : 'GET';
        this.urlPropertyToPacketOption(url, req, 'pathname', 'Uri-Path', '/');
        this.urlPropertyToPacketOption(url, req, 'query', 'Uri-Query', '&');
        if (options != null) {
            for (const optionName of Object.keys(options)) {
                if (optionName in options) {
                    req.setOption(optionName, options[optionName]);
                }
            }
        }
        if (url.proxyUri != null) {
            req.setOption('Proxy-Uri', url.proxyUri);
        }
        req.sender.on('error', req.emit.bind(req, 'error'));
        req.sender.on('sending', () => {
            this._msgInFlight++;
        });
        req.sender.on('timeout', (err) => {
            req.emit('timeout', err);
            this.abort(req);
        });
        req.sender.on('sent', () => {
            if (req.multicast) {
                return;
            }
            this._msgInFlight--;
            if (this._closing && this._msgInFlight === 0) {
                this._doClose();
            }
        });
        // Start multicast monitoring timer in case of multicast request
        if (url.multicast === true) {
            req.multicastTimer = setTimeout(() => {
                if (req._packet.token != null) {
                    const token = req._packet.token.toString('hex');
                    this._tkToReq.delete(token);
                    this._tkToMulticastResAddr.delete(token);
                }
                if (req._packet.messageId != null) {
                    this._msgIdToReq.delete(req._packet.messageId);
                }
                this._msgInFlight--;
                if (this._msgInFlight === 0 && this._closing) {
                    this._doClose();
                }
            }, multicastTimeout);
        }
        if (typeof (url.observe) === 'number') {
            req.setOption('Observe', url.observe);
        }
        else if (url.observe == null) {
            req.on('response', this._cleanUp.bind(this));
        }
        else if (url.observe) {
            req.setOption('Observe', 0);
        }
        this._requests++;
        req._totalPayload = Buffer.alloc(0);
        return req;
    }
    abort(req) {
        req.sender.removeAllListeners();
        req.sender.reset();
        this._msgInFlight--;
        this._cleanUp();
        if (req._packet.messageId != null) {
            this._msgIdToReq.delete(req._packet.messageId);
        }
        if (req._packet.token != null) {
            this._tkToReq.delete(req._packet.token.toString('hex'));
        }
    }
    urlPropertyToPacketOption(url, req, property, option, separator) {
        if (url[property] != null) {
            req.setOption(option, url[property].normalize('NFC').split(separator)
                .filter((part) => { return part !== ''; })
                .map((part) => {
                const buf = Buffer.alloc(Buffer.byteLength(part));
                buf.write(part);
                return buf;
            }));
        }
    }
    _convertMulticastToUnicastRequest(req, rsinfo) {
        var _a;
        const unicastReq = this.request(req.url);
        const unicastAddress = rsinfo.address.split('%')[0];
        const token = req._packet.token.toString('hex');
        const addressArray = (_a = this._tkToMulticastResAddr.get(token)) !== null && _a !== void 0 ? _a : [];
        if (addressArray.includes(unicastAddress)) {
            return undefined;
        }
        unicastReq.url.host = unicastAddress;
        unicastReq.sender._host = unicastAddress;
        clearTimeout(unicastReq.multicastTimer);
        unicastReq.url.multicast = false;
        req.eventNames().forEach(eventName => {
            req.listeners(eventName).forEach(listener => {
                unicastReq.on(eventName, listener);
            });
        });
        addressArray.push(unicastAddress);
        unicastReq._packet.token = this._nextToken();
        this._requests++;
        return unicastReq;
    }
}
exports.default = Agent;
//# sourceMappingURL=agent.js.map