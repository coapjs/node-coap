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
const chai_1 = require("chai");
const coap_packet_1 = require("coap-packet");
const dgram_1 = require("dgram");
const index_1 = require("../index");
describe('IPv6', function () {
    describe('server', function () {
        let server;
        let port;
        let clientPort;
        let client;
        beforeEach(function (done) {
            port = (0, common_1.nextPort)();
            clientPort = (0, common_1.nextPort)();
            client = (0, dgram_1.createSocket)('udp6');
            client.bind(clientPort, done);
        });
        afterEach(function () {
            client.close();
            server.close();
        });
        function send(message) {
            client.send(message, 0, message.length, port, '::1');
        }
        it('should receive a CoAP message specifying the type', function (done) {
            server = (0, index_1.createServer)({ type: 'udp6' });
            server.listen(port, () => {
                send((0, coap_packet_1.generate)({}));
                server.on('request', (req, res) => {
                    done();
                });
            });
        });
        it('should automatically discover the type based on the host', function (done) {
            server = (0, index_1.createServer)();
            server.listen(port, '::1', () => {
                send((0, coap_packet_1.generate)({}));
                server.on('request', (req, res) => {
                    done();
                });
            });
        });
    });
    describe('request', function () {
        let server;
        let port;
        beforeEach(function (done) {
            port = (0, common_1.nextPort)();
            server = (0, dgram_1.createSocket)('udp6');
            server.bind(port, done);
        });
        afterEach(function () {
            server.close();
        });
        function createTest(createUrl) {
            return function (done) {
                const req = (0, index_1.request)(createUrl());
                req.end(Buffer.from('hello world'));
                server.on('message', (msg, rsinfo) => {
                    const packet = (0, coap_packet_1.parse)(msg);
                    const toSend = (0, coap_packet_1.generate)({
                        messageId: packet.messageId,
                        token: packet.token,
                        payload: Buffer.from('42'),
                        ack: true,
                        code: '2.00'
                    });
                    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address);
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).payload.toString()).to.eql('hello world');
                    done();
                });
            };
        }
        it('should send the data to the server (URL param)', createTest(function () {
            return `coap://[::1]:${port}`;
        }));
        it('should send the data to the server (hostname + port in object)', createTest(function () {
            return { hostname: '::1', port: port };
        }));
        it('should send the data to the server (host + port in object)', createTest(function () {
            return { host: '::1', port: port };
        }));
    });
    describe('end-to-end', function () {
        let server;
        let port;
        beforeEach(function (done) {
            port = (0, common_1.nextPort)();
            server = (0, index_1.createServer)({ type: 'udp6' });
            server.listen(port, done);
        });
        it('should receive a request at a path with some query', function (done) {
            (0, index_1.request)(`coap://[::1]:${port}/abcd/ef/gh/?foo=bar&beep=bop`).end();
            server.on('request', (req) => {
                (0, chai_1.expect)(req.url).to.eql('/abcd/ef/gh?foo=bar&beep=bop');
                done();
            });
        });
    });
});
//# sourceMappingURL=ipv6.js.map