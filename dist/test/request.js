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
const common_1 = require("./common");
const chai_1 = require("chai");
const index_1 = require("../index");
const option_converter_1 = require("../lib/option_converter");
const coap_packet_1 = require("coap-packet");
const dgram_1 = require("dgram");
const sinon_1 = require("sinon");
const bl_1 = __importDefault(require("bl"));
const originalSetImmediate = setImmediate;
describe('request', function () {
    let server;
    let server2;
    let clock;
    let port;
    beforeEach(function (done) {
        port = (0, common_1.nextPort)();
        server = (0, dgram_1.createSocket)('udp4');
        server.bind(port, done);
        clock = (0, sinon_1.useFakeTimers)();
    });
    afterEach(function () {
        if (server != null) {
            server.close();
        }
        if (server2 != null) {
            server2.close();
        }
        server = server2 = null;
        clock.restore();
    });
    function fastForward(increase, max) {
        clock.tick(increase);
        if (increase < max) {
            originalSetImmediate(fastForward.bind(null, increase, max - increase));
        }
    }
    function ackBack(msg, rsinfo) {
        const packet = (0, coap_packet_1.parse)(msg);
        const toSend = (0, coap_packet_1.generate)({
            messageId: packet.messageId,
            ack: true,
            code: '0.00'
        });
        if (server instanceof dgram_1.Socket) {
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        }
    }
    it('should return a pipeable stream', function (done) {
        const req = (0, index_1.request)(`coap://localhost:${port}`);
        const stream = new bl_1.default();
        stream.append('hello world');
        req.on('finish', done);
        stream.pipe(req);
    });
    it('should send the data to the server', function (done) {
        const req = (0, index_1.request)(`coap://localhost:${port}`);
        req.end(Buffer.from('hello world'));
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).payload.toString()).to.eql('hello world');
            done();
        });
    });
    it('should send a confirmable message by default', function (done) {
        const req = (0, index_1.request)(`coap://localhost:${port}`);
        req.end(Buffer.from('hello world'));
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).confirmable).to.be.eql(true);
            done();
        });
    });
    it('should emit the errors in the req', function (done) {
        this.timeout(20000);
        const req = (0, index_1.request)(`coap://aaa.eee:${1234}`);
        if (server == null) {
            return;
        }
        req.once('error', () => {
            index_1.globalAgent.abort(req);
            done();
        });
        req.end(Buffer.from('hello world'));
    });
    it('should error if the message is too big', function (done) {
        const req = (0, index_1.request)(`coap://localhost:${port}`);
        req.on('error', () => {
            done();
        });
        req.end(Buffer.alloc(1280));
    });
    it('should imply a default port', function (done) {
        server2 = (0, dgram_1.createSocket)('udp4');
        server2.bind(5683, () => {
            (0, index_1.request)('coap://localhost').end();
        });
        server2.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            done();
        });
        server2.on('error', done);
    });
    it('should send the path to the server', function (done) {
        const req = (0, index_1.request)(`coap://localhost:${port}/hello`);
        req.end(Buffer.from('hello world'));
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            const packet = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(packet.options[0].name).to.eql('Uri-Path');
            (0, chai_1.expect)(packet.options[0].value).to.eql(Buffer.from('hello'));
            done();
        });
    });
    it('should send a longer path to the server', function (done) {
        const req = (0, index_1.request)(`coap://localhost:${port}/hello/world`);
        req.end(Buffer.from('hello world'));
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            const packet = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(packet.options[0].name).to.eql('Uri-Path');
            (0, chai_1.expect)(packet.options[0].value).to.eql(Buffer.from('hello'));
            (0, chai_1.expect)(packet.options[1].name).to.eql('Uri-Path');
            (0, chai_1.expect)(packet.options[1].value).to.eql(Buffer.from('world'));
            done();
        });
    });
    it('should accept an object instead of a string', function (done) {
        const req = (0, index_1.request)({
            hostname: 'localhost',
            port: port,
            pathname: '/hello/world'
        });
        req.end(Buffer.from('hello world'));
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            const packet = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(packet.options[0].name).to.eql('Uri-Path');
            (0, chai_1.expect)(packet.options[0].value).to.eql(Buffer.from('hello'));
            (0, chai_1.expect)(packet.options[1].name).to.eql('Uri-Path');
            (0, chai_1.expect)(packet.options[1].value).to.eql(Buffer.from('world'));
            done();
        });
    });
    it('should send a query string to the server', function (done) {
        const req = (0, index_1.request)(`coap://localhost:${port}?a=b&c=d`);
        req.end(Buffer.from('hello world'));
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            const packet = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(packet.options[0].name).to.eql('Uri-Query');
            (0, chai_1.expect)(packet.options[0].value).to.eql(Buffer.from('a=b'));
            (0, chai_1.expect)(packet.options[1].name).to.eql('Uri-Query');
            (0, chai_1.expect)(packet.options[1].value).to.eql(Buffer.from('c=d'));
            done();
        });
    });
    it('should accept a method parameter', function (done) {
        (0, index_1.request)({
            port: port,
            method: 'POST'
        }).end();
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            const packet = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(packet.code).to.eql('0.02');
            done();
        });
    });
    it('should accept a token parameter', function (done) {
        (0, index_1.request)({
            port: port,
            token: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
        }).end();
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            try {
                ackBack(msg, rsinfo);
                const packet = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(packet.token).to.eql(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
                done();
            }
            catch (err) {
                done(err);
            }
        });
    });
    it('should ignore empty token parameter', function (done) {
        (0, index_1.request)({
            port: port,
            token: Buffer.from([])
        }).end();
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            try {
                ackBack(msg, rsinfo);
                const packet = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(packet.token.length).to.be.above(0);
                done();
            }
            catch (err) {
                done(err);
            }
        });
    });
    it('should reject too long token', function (done) {
        const req = (0, index_1.request)({
            port: port,
            token: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        });
        req.on('error', (err) => {
            if (err.message === 'Token may be no longer than 8 bytes.') {
                // Success, this is what we were expecting
                done();
            }
            else {
                // Not our error
                done(err);
            }
        });
        req.end();
        if (server == null) {
            return;
        }
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            // We should not see this!
            ackBack(msg, rsinfo);
            done(new Error('Message should not have been sent!'));
        });
    });
    it('should emit a response with a piggyback CON message', function (done) {
        const req = (0, index_1.request)({
            port: port,
            confirmable: true
        });
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                payload: Buffer.from('42'),
                ack: true,
                code: '2.00'
            });
            if (server instanceof dgram_1.Socket) {
                server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            }
        });
        req.on('response', (res) => {
            res.pipe(new bl_1.default((err, data) => {
                if (err != null) {
                    done(err);
                }
                else {
                    (0, chai_1.expect)(data).to.eql(Buffer.from('42'));
                    done();
                }
            }));
        });
        req.end();
    });
    it('should emit a response with a delayed CON message', function (done) {
        const req = (0, index_1.request)({
            port: port,
            confirmable: true
        });
        if (server == null) {
            return;
        }
        server.once('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            let toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                payload: Buffer.alloc(0),
                ack: true,
                code: '0.00'
            });
            if (!(server instanceof dgram_1.Socket)) {
                return;
            }
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            toSend = (0, coap_packet_1.generate)({
                token: packet.token,
                payload: Buffer.from('42'),
                confirmable: true,
                code: '2.00'
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req.on('response', (res) => {
            res.pipe(new bl_1.default((err, data) => {
                if (err != null) {
                    done(err);
                }
                else {
                    (0, chai_1.expect)(data).to.eql(Buffer.from('42'));
                    done();
                }
            }));
        });
        req.end();
    });
    it('should send an ACK back after receiving a CON response', function (done) {
        const req = (0, index_1.request)({
            port: port,
            confirmable: true
        });
        if (server == null) {
            return;
        }
        server.once('message', (msg, rsinfo) => {
            let packet = (0, coap_packet_1.parse)(msg);
            let toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                ack: true,
                code: '0.00'
            });
            if (!(server instanceof dgram_1.Socket)) {
                return;
            }
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            toSend = (0, coap_packet_1.generate)({
                token: packet.token,
                payload: Buffer.from('42'),
                confirmable: true,
                code: '2.00'
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            server.once('message', (msg, rsinfo) => {
                packet = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(packet.code).to.eql('0.00');
                (0, chai_1.expect)(packet.ack).to.be.eql(true);
                (0, chai_1.expect)(packet.messageId).to.eql((0, coap_packet_1.parse)(toSend).messageId);
                done();
            });
        });
        req.end();
    });
    it('should not emit a response with an ack', function (done) {
        const req = (0, index_1.request)({
            port: port,
            confirmable: true
        });
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            ackBack(msg, rsinfo);
            setTimeout(() => {
                done();
            }, 20);
            fastForward(5, 25);
        });
        req.on('response', (res) => {
            done(new Error('Unexpected response'));
        });
        req.end();
    });
    it('should emit a response with a NON message', function (done) {
        const req = (0, index_1.request)({
            port: port,
            confirmable: false
        });
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                payload: Buffer.from('42'),
                code: '2.00'
            });
            if (server instanceof dgram_1.Socket) {
                server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            }
        });
        req.on('response', (res) => {
            res.pipe(new bl_1.default((err, data) => {
                if (err != null) {
                    done(err);
                }
                (0, chai_1.expect)(data).to.eql(Buffer.from('42'));
                done();
            }));
        });
        req.end();
    });
    it('should emit a response on reset', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                code: '0.00',
                ack: false,
                reset: true
            });
            if (server instanceof dgram_1.Socket) {
                server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            }
        });
        req.on('response', (res) => {
            if (res.code === '0.00') {
                done();
            }
            else {
                done(new Error('Unexpected response'));
            }
        });
        req.end();
    });
    it('should stop retrying on reset', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        let messages = 0;
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                code: '0.00',
                ack: false,
                reset: true
            });
            if (!(server instanceof dgram_1.Socket)) {
                return;
            }
            messages++;
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req.on('response', (res) => {
            if (res.code !== '0.00') {
                done(new Error('Unexpected response'));
            }
        });
        req.end();
        setTimeout(() => {
            (0, chai_1.expect)(messages).to.eql(1);
            done();
        }, 45 * 1000);
        fastForward(100, 45 * 1000);
    });
    it('should not send response to invalid packets', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        let messages = 0;
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                code: '0.00',
                ack: true,
                payload: Buffer.from('this payload invalidates empty message')
            });
            (0, chai_1.expect)(packet.code).to.be.eq('0.01');
            messages++;
            if (server instanceof dgram_1.Socket) {
                server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            }
        });
        req.on('response', (res) => {
            done(new Error('Unexpected response'));
        });
        req.end();
        setTimeout(() => {
            (0, chai_1.expect)(messages).to.eql(5);
            done();
        }, 50 * 1000);
        fastForward(100, 50 * 1000);
    });
    it('should allow to add an option', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        const buf = Buffer.alloc(3);
        req.setOption('ETag', buf);
        req.end();
        if (server == null) {
            return;
        }
        server.on('message', (msg) => {
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('ETag');
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf);
            done();
        });
    });
    it('should attempt to normalize option case', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        const buf = Buffer.alloc(3);
        req.setOption('content-type', buf);
        req.end();
        if (server == null) {
            return;
        }
        server.on('message', (msg) => {
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('Content-Format');
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf);
            done();
        });
    });
    it('should overwrite the option', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        const buf = Buffer.alloc(3);
        req.setOption('ETag', Buffer.alloc(3));
        req.setOption('ETag', buf);
        req.end();
        if (server == null) {
            return;
        }
        server.on('message', (msg) => {
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf);
            done();
        });
    });
    it('should alias setOption to setHeader', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        const buf = Buffer.alloc(3);
        req.setHeader('ETag', buf);
        req.end();
        if (server == null) {
            return;
        }
        server.on('message', (msg) => {
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf);
            done();
        });
    });
    it('should set multiple options', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        const buf1 = Buffer.alloc(3);
        const buf2 = Buffer.alloc(3);
        req.setOption('433', [buf1, buf2]);
        req.end();
        if (server == null) {
            return;
        }
        server.on('message', (msg) => {
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf1);
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[1].value).to.eql(buf2);
            done();
        });
    });
    it('should alias the \'Content-Format\' option to \'Content-Type\'', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        req.setOption('Content-Type', Buffer.of(0));
        req.end();
        if (server == null) {
            return;
        }
        server.on('message', (msg) => {
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('Content-Format');
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(0));
            done();
        });
    });
    it('should not crash with two CON responses with the same messageId & token', function (done) {
        const req = (0, index_1.request)({
            port: port,
            confirmable: true
        });
        if (server == null) {
            return;
        }
        server.once('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            let toSend = (0, coap_packet_1.generate)({
                token: packet.token,
                messageId: packet.messageId,
                payload: Buffer.from('42'),
                confirmable: true,
                code: '2.00'
            });
            if (!(server instanceof dgram_1.Socket)) {
                return;
            }
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            toSend = (0, coap_packet_1.generate)({
                token: packet.token,
                messageId: packet.messageId,
                payload: Buffer.from('42'),
                confirmable: true,
                code: '2.00'
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req.on('response', (res) => {
            res.pipe(new bl_1.default((err, data) => {
                if (err != null) {
                    done(err);
                }
                else {
                    (0, chai_1.expect)(data).to.eql(Buffer.from('42'));
                    done();
                }
            }));
        });
        req.end();
    });
    const formatsString = {
        'text/plain': Buffer.of(0),
        'application/link-format': Buffer.of(40),
        'application/xml': Buffer.of(41),
        'application/octet-stream': Buffer.of(42),
        'application/exi': Buffer.of(47),
        'application/json': Buffer.of(50),
        'application/cbor': Buffer.of(60)
    };
    describe('with the \'Content-Format\' header in the outgoing message', function () {
        function buildTest(format, value) {
            it('should parse ' + format, function (done) {
                const req = (0, index_1.request)({
                    port: port
                });
                req.setOption('Content-Format', format);
                req.end();
                if (server == null) {
                    return;
                }
                server.on('message', (msg) => {
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(value);
                    done();
                });
            });
        }
        for (const format in formatsString) {
            buildTest(format, formatsString[format]);
        }
    });
    describe('with the \'Accept\' header in the outgoing message', function () {
        function buildTest(format, value) {
            it('should parse ' + format, function (done) {
                const req = (0, index_1.request)({
                    port: port
                });
                req.setHeader('Accept', format);
                req.end();
                if (server == null) {
                    return;
                }
                server.on('message', (msg) => {
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(value);
                    done();
                });
            });
        }
        for (const format in formatsString) {
            buildTest(format, formatsString[format]);
        }
    });
    describe('with the \'Content-Format\' in the response', function () {
        function buildResponse(value) {
            return (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                const toSend = (0, coap_packet_1.generate)({
                    messageId: packet.messageId,
                    code: '2.05',
                    token: packet.token,
                    options: [{
                            name: 'Content-Format',
                            value: value
                        }]
                });
                if (server instanceof dgram_1.Socket) {
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                }
            };
        }
        function buildTest(format, value) {
            it('should parse ' + format, function (done) {
                const req = (0, index_1.request)({
                    port: port
                });
                if (server != null) {
                    server.on('message', buildResponse(value));
                }
                req.on('response', (res) => {
                    (0, chai_1.expect)(res.options[0].value).to.eql(format);
                    done();
                });
                req.end();
            });
            it('should include ' + format + ' in the headers', function (done) {
                const req = (0, index_1.request)({
                    port: port
                });
                if (server != null) {
                    server.on('message', buildResponse(value));
                }
                req.on('response', (res) => {
                    (0, chai_1.expect)(res.headers['Content-Format']).to.eql(format);
                    (0, chai_1.expect)(res.headers['Content-Type']).to.eql(format);
                    done();
                });
                req.end();
            });
        }
        for (const format in formatsString) {
            buildTest(format, formatsString[format]);
        }
    });
    it('should include \'ETag\' in the response headers', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                code: '2.05',
                token: packet.token,
                options: [{
                        name: 'ETag',
                        value: Buffer.from('abcdefgh')
                    }]
            });
            if (server instanceof dgram_1.Socket) {
                server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            }
        });
        req.on('response', (res) => {
            (0, chai_1.expect)(res.headers).to.have.property('ETag', 'abcdefgh');
            done();
        });
        req.end();
    });
    it('should include original and destination socket information in the response', function (done) {
        const req = (0, index_1.request)({
            port: port
        });
        if (server == null) {
            return;
        }
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                code: '2.05',
                token: packet.token,
                options: []
            });
            if (server instanceof dgram_1.Socket) {
                server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            }
        });
        req.on('response', (res) => {
            (0, chai_1.expect)(res).to.have.property('rsinfo');
            (0, chai_1.expect)(res).to.have.property('outSocket');
            (0, chai_1.expect)(res.outSocket).to.have.property('address');
            (0, chai_1.expect)(res.outSocket).to.have.property('port');
            done();
        });
        req.end();
    });
    describe('non-confirmable retries', function () {
        let clock;
        beforeEach(function () {
            clock = (0, sinon_1.useFakeTimers)();
        });
        afterEach(function () {
            clock.restore();
        });
        function doReq() {
            return (0, index_1.request)({
                port: port,
                confirmable: false
            }).end();
        }
        function fastForward(increase, max) {
            clock.tick(increase);
            if (increase < max) {
                originalSetImmediate(fastForward.bind(null, increase, max - increase));
            }
        }
        it('should timeout after ~202 seconds', function (done) {
            const req = doReq();
            req.on('error', () => {
            });
            req.on('timeout', (err) => {
                (0, chai_1.expect)(err).to.have.property('message', 'No reply in 202 seconds.');
                (0, chai_1.expect)(err).to.have.property('retransmitTimeout', 202);
                done();
            });
            fastForward(1000, 202 * 1000);
        });
        it('should not retry before timeout', function (done) {
            const req = doReq();
            let messages = 0;
            if (server == null) {
                return;
            }
            server.on('message', (msg) => {
                messages++;
            });
            req.on('timeout', () => {
                (0, chai_1.expect)(messages).to.eql(1);
                done();
            });
            fastForward(100, 247 * 1000);
        });
        it('should not retry before 45s', function (done) {
            doReq();
            let messages = 0;
            if (server == null) {
                return;
            }
            server.on('message', (msg) => {
                messages++;
            });
            setTimeout(() => {
                (0, chai_1.expect)(messages).to.eql(1);
                done();
            }, 45 * 1000);
            fastForward(20, 45 * 1000);
        });
        it('should stop retrying if it receives a message', function (done) {
            doReq();
            let messages = 0;
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                messages++;
                const packet = (0, coap_packet_1.parse)(msg);
                const toSend = (0, coap_packet_1.generate)({
                    messageId: packet.messageId,
                    token: packet.token,
                    code: '2.00',
                    ack: true,
                    payload: Buffer.alloc(5)
                });
                if (server instanceof dgram_1.Socket) {
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                }
            });
            setTimeout(() => {
                (0, chai_1.expect)(messages).to.eql(1);
                done();
            }, 45 * 1000);
            fastForward(100, 45 * 1000);
        });
    });
    describe('confirmable retries', function () {
        let clock;
        beforeEach(function () {
            clock = (0, sinon_1.useFakeTimers)();
        });
        afterEach(function () {
            clock.restore();
        });
        function doReq() {
            return (0, index_1.request)({
                port: port,
                confirmable: true
            }).end();
        }
        function fastForward(increase, max) {
            clock.tick(increase);
            if (increase < max) {
                originalSetImmediate(fastForward.bind(null, increase, max - increase));
            }
        }
        it('should error after ~247 seconds', function (done) {
            const req = doReq();
            req.on('error', (err) => {
                (0, chai_1.expect)(err).to.have.property('message', 'No reply in 247 seconds.');
                done();
            });
            fastForward(1000, 247 * 1000);
        });
        it('should retry four times before erroring', function (done) {
            const req = doReq();
            let messages = 0;
            if (server == null) {
                return;
            }
            server.on('message', (msg) => {
                messages++;
            });
            req.on('error', () => {
                // original one plus 4 retries
                (0, chai_1.expect)(messages).to.eql(5);
                done();
            });
            fastForward(100, 247 * 1000);
        });
        it('should retry with the same message id', function (done) {
            const req = doReq();
            let messageId;
            if (server == null) {
                return;
            }
            if (server == null) {
                return;
            }
            server.on('message', (msg) => {
                const packet = (0, coap_packet_1.parse)(msg);
                if (messageId == null) {
                    messageId = packet.messageId;
                }
                (0, chai_1.expect)(packet.messageId).to.eql(packet.messageId);
            });
            req.on('error', () => {
                done();
            });
            fastForward(100, 247 * 1000);
        });
        it('should retry four times before 45s', function (done) {
            doReq();
            let messages = 0;
            if (server == null) {
                return;
            }
            server.on('message', (msg) => {
                messages++;
            });
            setTimeout(() => {
                // original one plus 4 retries
                (0, chai_1.expect)(messages).to.eql(5);
                done();
            }, 45 * 1000);
            fastForward(20, 45 * 1000);
        });
        it('should stop retrying if it receives an ack', function (done) {
            doReq();
            let messages = 0;
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                messages++;
                const packet = (0, coap_packet_1.parse)(msg);
                const toSend = (0, coap_packet_1.generate)({
                    messageId: packet.messageId,
                    code: '0.00',
                    ack: true
                });
                if (server instanceof dgram_1.Socket) {
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                }
            });
            setTimeout(() => {
                (0, chai_1.expect)(messages).to.eql(1);
                done();
            }, 45 * 1000);
            fastForward(100, 45 * 1000);
        });
    });
    describe('observe', function () {
        function doObserve() {
            if (server instanceof dgram_1.Socket) {
                server.on('message', (msg, rsinfo) => {
                    const packet = (0, coap_packet_1.parse)(msg);
                    if (packet.ack) {
                        return;
                    }
                    ssend(rsinfo, {
                        messageId: packet.messageId,
                        token: packet.token,
                        payload: Buffer.from('42'),
                        ack: true,
                        options: [{
                                name: 'Observe',
                                value: Buffer.of(1)
                            }],
                        code: '2.05'
                    });
                    ssend(rsinfo, {
                        token: packet.token,
                        payload: Buffer.from('24'),
                        confirmable: true,
                        options: [{
                                name: 'Observe',
                                value: Buffer.of(2)
                            }],
                        code: '2.05'
                    });
                });
            }
            return (0, index_1.request)({
                port: port,
                observe: true
            }).end();
        }
        function ssend(rsinfo, packet) {
            const toSend = (0, coap_packet_1.generate)(packet);
            if (server instanceof dgram_1.Socket) {
                server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            }
        }
        function sendNotification(rsinfo, req, opts) {
            ssend(rsinfo, {
                messageId: req.messageId,
                token: req.token,
                payload: Buffer.from(opts.payload),
                ack: false,
                options: [{
                        name: 'Observe',
                        value: (0, option_converter_1.toBinary)('Observe', opts.num)
                    }],
                code: '2.05'
            });
        }
        it('should ack the update', function (done) {
            doObserve();
            if (server == null) {
                return;
            }
            server.on('message', (msg) => {
                if ((0, coap_packet_1.parse)(msg).ack) {
                    done();
                }
            });
        });
        it('should emit any more data after close', function (done) {
            const req = doObserve();
            req.on('response', (res) => {
                res.once('data', (data) => {
                    (0, chai_1.expect)(data.toString()).to.eql('42');
                    res.close();
                    done();
                    res.on('data', (data) => {
                        done(new Error('this should never happen'));
                    });
                });
            });
        });
        it('should send origin and destination socket data along with the response', function (done) {
            const req = doObserve();
            req.on('response', (res) => {
                res.once('data', (data) => {
                    (0, chai_1.expect)(res).to.have.property('rsinfo');
                    (0, chai_1.expect)(res).to.have.property('outSocket');
                    (0, chai_1.expect)(res.outSocket).to.have.property('address');
                    (0, chai_1.expect)(res.outSocket).to.have.property('port');
                    res.close();
                    done();
                });
            });
        });
        it('should emit any more data after close', function (done) {
            const req = doObserve();
            req.on('response', (res) => {
                res.once('data', (data) => {
                    (0, chai_1.expect)(data.toString()).to.eql('42');
                    res.close();
                    done();
                    res.on('data', (data) => {
                        done(new Error('this should never happen'));
                    });
                });
            });
        });
        it('should send deregister request if close(eager=true)', function (done) {
            const req = doObserve();
            req.on('response', (res) => {
                res.once('data', (data) => {
                    (0, chai_1.expect)(data.toString()).to.eql('42');
                    res.close(true);
                    if (server == null) {
                        return;
                    }
                    server.on('message', (msg, rsinfo) => {
                        const packet = (0, coap_packet_1.parse)(msg);
                        if (packet.ack && (packet.code === '0.00')) {
                            return;
                        }
                        try {
                            (0, chai_1.expect)(packet.options.length).to.be.least(1);
                            (0, chai_1.expect)(packet.options[0].name).to.eql('Observe');
                            (0, chai_1.expect)(packet.options[0].value).to.eql(Buffer.from([1]));
                        }
                        catch (err) {
                            return done(err);
                        }
                        done();
                    });
                });
            });
        });
        it('should send an empty Observe option', function (done) {
            (0, index_1.request)({
                port: port,
                observe: true
            }).end();
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(packet.options[0].name).to.eql('Observe');
                (0, chai_1.expect)(packet.options[0].value).to.eql(Buffer.of(0));
                done();
            });
        });
        it('should allow user to send Observe=1', function (done) {
            (0, index_1.request)({
                port: port,
                observe: 1
            }).end();
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                try {
                    (0, chai_1.expect)(packet.options[0].name).to.eql('Observe');
                    (0, chai_1.expect)(packet.options[0].value).to.eql(Buffer.from([1]));
                }
                catch (err) {
                    return done(err);
                }
                done();
            });
        });
        it('should allow multiple notifications', function (done) {
            if (server == null) {
                return;
            }
            server.once('message', (msg, rsinfo) => {
                const req = (0, coap_packet_1.parse)(msg);
                sendNotification(rsinfo, req, { num: 0, payload: 'zero' });
                sendNotification(rsinfo, req, { num: 1, payload: 'one' });
            });
            const req = (0, index_1.request)({
                port: port,
                observe: true,
                confirmable: false
            }).end();
            req.on('response', (res) => {
                let ndata = 0;
                res.on('data', function (data) {
                    ndata++;
                    if (ndata === 1) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(0);
                        (0, chai_1.expect)(data.toString()).to.equal('zero');
                    }
                    else if (ndata === 2) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(1);
                        (0, chai_1.expect)(data.toString()).to.equal('one');
                        done();
                    }
                    else {
                        done(new Error('Unexpected data'));
                    }
                });
            });
        });
        it('should drop out of order notifications', function (done) {
            if (server == null) {
                return;
            }
            server.once('message', (msg, rsinfo) => {
                const req = (0, coap_packet_1.parse)(msg);
                sendNotification(rsinfo, req, { num: 1, payload: 'one' });
                sendNotification(rsinfo, req, { num: 0, payload: 'zero' });
                sendNotification(rsinfo, req, { num: 2, payload: 'two' });
            });
            const req = (0, index_1.request)({
                port: port,
                observe: true,
                confirmable: false
            }).end();
            req.on('response', (res) => {
                let ndata = 0;
                res.on('data', (data) => {
                    ndata++;
                    if (ndata === 1) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(1);
                        (0, chai_1.expect)(data.toString()).to.equal('one');
                    }
                    else if (ndata === 2) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(2);
                        (0, chai_1.expect)(data.toString()).to.equal('two');
                        done();
                    }
                    else {
                        done(new Error('Unexpected data'));
                    }
                });
            });
        });
        it('should allow repeating order after 128 seconds', function (done) {
            if (server == null) {
                return;
            }
            server.once('message', (msg, rsinfo) => {
                const req = (0, coap_packet_1.parse)(msg);
                sendNotification(rsinfo, req, { num: 1, payload: 'one' });
                setTimeout(() => {
                    sendNotification(rsinfo, req, { num: 1, payload: 'two' });
                }, 128 * 1000 + 200);
            });
            const req = (0, index_1.request)({
                port: port,
                observe: true,
                confirmable: false
            }).end();
            req.on('response', (res) => {
                let ndata = 0;
                res.on('data', (data) => {
                    ndata++;
                    if (ndata === 1) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(1);
                        (0, chai_1.expect)(data.toString()).to.equal('one');
                    }
                    else if (ndata === 2) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(1);
                        (0, chai_1.expect)(data.toString()).to.equal('two');
                        done();
                    }
                    else {
                        done(new Error('Unexpected data'));
                    }
                });
            });
            fastForward(100, 129 * 1000);
        });
        it('should allow Observe option 24bit overflow', function (done) {
            if (server == null) {
                return;
            }
            server.once('message', (msg, rsinfo) => {
                const req = (0, coap_packet_1.parse)(msg);
                sendNotification(rsinfo, req, { num: 0xffffff, payload: 'max' });
                sendNotification(rsinfo, req, { num: 0, payload: 'zero' });
            });
            const req = (0, index_1.request)({
                port: port,
                observe: true,
                confirmable: false
            }).end();
            req.on('response', (res) => {
                let ndata = 0;
                res.on('data', (data) => {
                    ndata++;
                    if (ndata === 1) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(0xffffff);
                        (0, chai_1.expect)(data.toString()).to.equal('max');
                    }
                    else if (ndata === 2) {
                        (0, chai_1.expect)(res.headers.Observe).to.equal(0);
                        (0, chai_1.expect)(data.toString()).to.equal('zero');
                        done();
                    }
                    else {
                        done(new Error('Unexpected data'));
                    }
                });
            });
        });
    });
    describe('token', function () {
        let clock;
        beforeEach(function () {
            clock = (0, sinon_1.useFakeTimers)();
        });
        afterEach(function () {
            clock.restore();
        });
        function fastForward(increase, max) {
            clock.tick(increase);
            if (increase < max) {
                originalSetImmediate(fastForward.bind(null, increase, max - increase));
            }
        }
        it('should timeout if the response token size doesn\'t match the request\'s', function (done) {
            const req = (0, index_1.request)({
                port: port
            });
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                const toSend = (0, coap_packet_1.generate)({
                    messageId: packet.messageId,
                    token: Buffer.alloc(2),
                    options: []
                });
                if (server instanceof dgram_1.Socket) {
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                }
            });
            req.on('error', () => { });
            req.on('timeout', () => {
                done();
            });
            req.end();
            fastForward(1000, 247 * 1000);
        });
        it('should timeout if the response token content doesn\'t match the request\'s', function (done) {
            const req = (0, index_1.request)({
                port: port
            });
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                const toSend = (0, coap_packet_1.generate)({
                    messageId: packet.messageId,
                    token: Buffer.alloc(4),
                    options: []
                });
                if (server instanceof dgram_1.Socket) {
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                }
            });
            req.on('error', () => { });
            req.on('timeout', () => {
                done();
            });
            req.end();
            fastForward(1000, 247 * 1000);
        });
    });
    describe('multicast', function () {
        const MULTICAST_ADDR = '224.0.0.1';
        const port2 = (0, common_1.nextPort)();
        let sock = (0, dgram_1.createSocket)('udp4');
        function doReq() {
            return (0, index_1.request)({
                host: MULTICAST_ADDR,
                port: port,
                multicast: true
            }).end();
        }
        beforeEach(function (done) {
            sock = (0, dgram_1.createSocket)('udp4');
            sock.bind(port2, () => {
                if (server instanceof dgram_1.Socket) {
                    server.addMembership(MULTICAST_ADDR);
                }
                sock.addMembership(MULTICAST_ADDR);
                done();
            });
        });
        afterEach(function () {
            sock.close();
        });
        it('should be non-confirmable', function (done) {
            doReq();
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(packet).to.have.property('confirmable', false);
                done();
            });
        });
        it('should be responsed with the same token', function (done) {
            const req = doReq();
            let token;
            if (server == null) {
                return;
            }
            if (server == null) {
                return;
            }
            server.on('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                token = packet.token;
                const toSend = (0, coap_packet_1.generate)({
                    messageId: packet.messageId,
                    token: packet.token,
                    payload: Buffer.from('42'),
                    ack: true,
                    code: '2.00'
                });
                if (server instanceof dgram_1.Socket) {
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                }
            });
            req.on('response', (res) => {
                const packet = res._packet;
                (0, chai_1.expect)(packet).to.have.property('confirmable', false);
                (0, chai_1.expect)(packet).to.have.property('reset', false);
                (0, chai_1.expect)(packet.token).to.eql(token);
                done();
            });
        });
        it('should allow for differing MIDs for non-confirmable requests', function (done) {
            let _req = null;
            let counter = 0;
            const servers = [undefined, undefined];
            const mids = [0, 0];
            servers.forEach((_, i) => {
                servers[i] = (0, index_1.createServer)((req, res) => {
                    if ((_req === null || _req === void 0 ? void 0 : _req._packet.messageId) == null) {
                        return;
                    }
                    const mid = (_req === null || _req === void 0 ? void 0 : _req._packet.messageId) + i + 1;
                    res._packet.messageId = mid;
                    mids[i] = mid;
                    res.end();
                });
                const server = servers[i];
                if (server != null) {
                    server.listen(sock);
                }
            });
            _req = (0, index_1.request)({
                host: MULTICAST_ADDR,
                port: port2,
                confirmable: false,
                multicast: true
            }).on('response', (res) => {
                if (++counter === servers.length) {
                    mids.forEach((mid, i) => {
                        (0, chai_1.assert)((_req === null || _req === void 0 ? void 0 : _req._packet.messageId) != null);
                        if ((_req === null || _req === void 0 ? void 0 : _req._packet.messageId) != null) {
                            const expectedMid = _req._packet.messageId + i + 1;
                            (0, chai_1.expect)(mid).to.eql(expectedMid);
                        }
                    });
                    done();
                }
            }).end();
        });
        it('should allow for block-wise transfer when using multicast', function (done) {
            const payload = Buffer.alloc(1536);
            server = (0, index_1.createServer)((req, res) => {
                (0, chai_1.expect)(req.url).to.eql('/hello');
                res.end(payload);
            });
            server.listen(sock);
            (0, index_1.request)({
                host: MULTICAST_ADDR,
                port: port2,
                pathname: '/hello',
                confirmable: false,
                multicast: true
            }).on('response', (res) => {
                (0, chai_1.expect)(res.payload.toString()).to.eql(payload.toString());
                done();
            }).end();
        });
        it('should preserve all listeners when using block-wise transfer and multicast', function (done) {
            const payload = Buffer.alloc(1536);
            server = (0, index_1.createServer)((req, res) => {
                res.end(payload);
            });
            server.listen(sock);
            const _req = (0, index_1.request)({
                host: MULTICAST_ADDR,
                port: port2,
                confirmable: false,
                multicast: true
            });
            _req.on('bestEventEver', () => {
                done();
            });
            _req.on('response', (res) => {
                (0, chai_1.expect)(res.payload.toString()).to.eql(payload.toString());
                _req.emit('bestEventEver');
            }).end();
        });
        it('should ignore multiple responses from the same hostname when using block2 multicast', function (done) {
            const payload = Buffer.alloc(1536);
            let counter = 0;
            server = (0, index_1.createServer)((req, res) => {
                res.end(payload);
            });
            server.listen(sock);
            const server2 = (0, index_1.createServer)((req, res) => {
                res.end(payload);
            });
            server2.listen(sock);
            (0, index_1.request)({
                host: MULTICAST_ADDR,
                port: port2,
                confirmable: false,
                multicast: true
            }).on('response', (res) => {
                counter++;
            }).end();
            setTimeout(() => {
                (0, chai_1.expect)(counter).to.eql(1);
                done();
            }, 45 * 1000);
            fastForward(100, 45 * 1000);
        });
    });
});
//# sourceMappingURL=request.js.map