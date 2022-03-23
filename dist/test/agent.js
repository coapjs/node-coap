"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("./common");
const index_1 = require("../index");
const coap_packet_1 = require("coap-packet");
const chai_1 = require("chai");
const dgram_1 = require("dgram");
describe('Agent config', function () {
    it('should get agent instance through custom config', function (done) {
        const agent = new index_1.Agent({ type: 'udp4', port: 62754 });
        (0, chai_1.expect)(agent._sock.type).to.eql('udp4');
        (0, chai_1.expect)(agent._sock._bindState).to.eql(1);
        done();
    });
    it('should get agent instance through custom socket', function (done) {
        const socket = (0, dgram_1.createSocket)('udp6');
        const agent = new index_1.Agent({ socket, type: 'udp4', port: 62754 });
        (0, chai_1.expect)(agent._opts.type).to.eql('udp6');
        (0, chai_1.expect)(agent._sock.type).to.eql('udp6');
        (0, chai_1.expect)(agent._sock._bindState).to.eql(0);
        done();
    });
});
describe('Agent', function () {
    let server;
    let port;
    let agent;
    beforeEach(function (done) {
        port = (0, common_1.nextPort)();
        agent = new index_1.Agent();
        server = (0, dgram_1.createSocket)('udp4');
        server.bind(port, done);
    });
    afterEach(function () {
        server.close();
    });
    function doReq(confirmable, customPort) {
        let requestPort = port;
        if (customPort != null) {
            requestPort = customPort;
        }
        return (0, index_1.request)({
            port: requestPort,
            agent,
            confirmable
        }).end();
    }
    it('should exit with no requests in flight', function (done) {
        agent.on('close', () => {
            (0, chai_1.expect)(agent._requests).to.equal(0);
            (0, chai_1.expect)(agent._sock).to.equal(null);
            done();
        });
        agent.close();
    }).timeout(500);
    it('should allow to close the agent', function (done) {
        let closeEmitted = false;
        const port = (0, common_1.nextPort)();
        // Initiate a number of requests
        doReq(undefined, port);
        doReq(undefined, port);
        doReq(undefined, port);
        doReq(undefined, port);
        agent.on('close', () => {
            closeEmitted = true;
            (0, chai_1.expect)(agent._requests).to.equal(0);
            (0, chai_1.expect)(agent._sock).to.equal(null);
        });
        agent.close(() => {
            (0, chai_1.expect)(agent._requests).to.equal(0);
            (0, chai_1.expect)(agent._sock).to.equal(null);
            // Ensure that new requests can still be sent
            doReq();
            server.on('message', (msg, rsinfo) => {
                (0, chai_1.expect)(closeEmitted).to.equal(true);
                agent.close(done);
            });
        });
    });
    it('should reuse the same socket for multiple requests', function (done) {
        let firstRsinfo;
        doReq();
        doReq();
        server.on('message', (msg, rsinfo) => {
            if (firstRsinfo != null) {
                (0, chai_1.expect)(rsinfo.port).to.eql(firstRsinfo.port);
                done();
            }
            else {
                firstRsinfo = rsinfo;
            }
        });
    });
    it('should calculate the messageIds module 16 bytes', function (done) {
        let total = 2;
        doReq();
        agent._lastMessageId = Math.pow(2, 16) - 1;
        doReq();
        server.on('message', (msg, rsinfo) => {
            if (total === 2) {
                // nothing to do
            }
            else if (total === 1) {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).messageId).to.eql(0);
                done();
            }
            total--;
        });
    });
    it('should differentiate two requests with different tokens', function (done) {
        let firstToken;
        doReq();
        doReq();
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            if (firstToken != null) {
                (0, chai_1.expect)(packet.token).not.to.eql(firstToken);
                done();
            }
            else {
                firstToken = packet.token;
            }
        });
    });
    it('should differentiate two requests with different messageIds', function (done) {
        let firstMessageId;
        doReq();
        doReq();
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            if (firstMessageId != null) {
                (0, chai_1.expect)(packet.messageId).not.to.eql(firstMessageId);
                done();
            }
            else {
                firstMessageId = packet.messageId;
            }
        });
    });
    it('should forward the response to the correct request', function (done) {
        let responses = 0;
        const req1 = doReq();
        const req2 = doReq();
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                code: '2.00',
                ack: true,
                payload: Buffer.alloc(5)
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req1.once('response', (res) => {
            if (++responses === 2) {
                done();
            }
        });
        req2.once('response', (res) => {
            if (++responses === 2) {
                done();
            }
        });
    });
    it('should discard the request after receiving the payload for NON requests', function (done) {
        const req = doReq();
        // it is needed to keep the agent open
        doReq();
        server.once('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                code: '2.00',
                confirmable: false,
                payload: Buffer.alloc(5)
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            // duplicate, as there was some retransmission
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req.on('response', (res) => {
            // fails if it emits 'response' twice
            done();
        });
    });
    it('should be able to handle undefined Content-Formats', function (done) {
        const req = doReq();
        // it is needed to keep the agent open
        doReq();
        server.once('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                code: '2.00',
                confirmable: false,
                payload: Buffer.alloc(5),
                options: [{
                        name: 'Content-Format',
                        value: Buffer.of(0x06, 0x06)
                    }]
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req.on('response', (res) => {
            (0, chai_1.expect)(res.headers['Content-Format']).to.equal(1542);
            done();
        });
    });
    it('should be able to handle unallowed Content-Formats', function (done) {
        const req = doReq();
        // it is needed to keep the agent open
        doReq();
        server.once('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                code: '2.00',
                confirmable: false,
                payload: Buffer.alloc(5),
                options: [{
                        name: 'Content-Format',
                        value: Buffer.of(0xff, 0xff, 0x1)
                    }]
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req.on('response', (res) => {
            (0, chai_1.expect)(res.headers['Content-Format']).to.equal(undefined);
            done();
        });
    });
    it('should discard the request after receiving the payload for piggyback CON requests', function (done) {
        const req = doReq(true);
        // it is needed to keep the agent open
        doReq(true);
        server.once('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                code: '2.00',
                confirmable: false,
                ack: true,
                payload: Buffer.alloc(5)
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            // duplicate, as there was some retransmission
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
        });
        req.on('response', (res) => {
            // fails if it emits 'response' twice
            done();
        });
    });
    it('should close the socket if there are no pending requests', function (done) {
        let firstRsinfo;
        const req = doReq();
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            const toSend = (0, coap_packet_1.generate)({
                messageId: packet.messageId,
                token: packet.token,
                code: '2.00',
                confirmable: false,
                ack: true,
                payload: Buffer.alloc(5)
            });
            server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
            if (firstRsinfo != null) {
                (0, chai_1.expect)(rsinfo.port).not.to.eql(firstRsinfo.port);
                done();
            }
            else {
                firstRsinfo = rsinfo;
            }
        });
        req.on('response', (res) => {
            setImmediate(doReq);
        });
    });
    it('should send only RST for unrecognized CON', function (done) {
        // In order to have a running agent, it must wait for something
        doReq(true);
        let step = 0;
        server.on('message', (msg, rsinfo) => {
            const packet = (0, coap_packet_1.parse)(msg);
            switch (++step) {
                case 1: {
                    // Request message from the client
                    // Ensure the message sent by the server does not match any
                    // current request.
                    const invalidMid = packet.messageId + 1;
                    const invalidTkn = Buffer.from(packet.token);
                    ++invalidTkn[0];
                    const toSend = (0, coap_packet_1.generate)({
                        messageId: invalidMid,
                        token: invalidTkn,
                        code: '2.00',
                        confirmable: true,
                        ack: false,
                        payload: Buffer.alloc(5)
                    });
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                    break;
                }
                case 2:
                    (0, chai_1.expect)(packet.reset).to.be.eql(true);
                    done();
                    break;
                case 3:
                    done(Error('Got two answers'));
                    break;
            }
        });
    });
    describe('observe problems', function () {
        function sendObserve(opts) {
            const toSend = (0, coap_packet_1.generate)({
                messageId: opts.messageId,
                token: opts.token,
                code: '2.05',
                confirmable: opts.confirmable,
                ack: opts.ack,
                payload: Buffer.alloc(5),
                options: [{
                        name: 'Observe',
                        value: Buffer.of(opts.num)
                    }]
            });
            server.send(toSend, 0, toSend.length, opts.rsinfo.port, opts.rsinfo.address);
        }
        it('should discard the request after receiving the payload for piggyback CON requests with observe request', function (done) {
            const req = (0, index_1.request)({
                port: port,
                agent: agent,
                observe: true,
                confirmable: true
            }).end();
            server.once('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                sendObserve({
                    num: 1,
                    messageId: packet.messageId,
                    token: packet.token,
                    confirmable: false,
                    ack: true,
                    rsinfo: rsinfo
                });
                // duplicate, as there was some retransmission
                sendObserve({
                    num: 1,
                    messageId: packet.messageId,
                    token: packet.token,
                    confirmable: false,
                    ack: true,
                    rsinfo: rsinfo
                });
                // some more data
                sendObserve({
                    num: 2,
                    token: packet.token,
                    confirmable: true,
                    ack: false,
                    rsinfo: rsinfo
                });
            });
            req.on('response', (res) => {
                // fails if it emits 'response' twice
                done();
            });
        });
        it('should close the socket if there are no pending requests', function (done) {
            let firstRsinfo;
            const req = (0, index_1.request)({
                port: port,
                agent: agent,
                observe: true,
                confirmable: true
            }).end();
            server.once('message', (msg, rsinfo) => {
                const packet = (0, coap_packet_1.parse)(msg);
                sendObserve({
                    num: 1,
                    messageId: packet.messageId,
                    token: packet.token,
                    confirmable: false,
                    ack: true,
                    rsinfo: rsinfo
                });
            });
            server.on('message', (msg, rsinfo) => {
                if (firstRsinfo != null) {
                    (0, chai_1.expect)(rsinfo.port).not.to.eql(firstRsinfo.port);
                    done();
                }
                else {
                    firstRsinfo = rsinfo;
                }
            });
            req.on('response', (res) => {
                res.close();
                setImmediate(doReq);
            });
        });
    });
});
//# sourceMappingURL=agent.js.map