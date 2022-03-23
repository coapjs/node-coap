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
const coap_packet_1 = require("coap-packet");
const index_1 = require("../index");
const dgram_1 = __importDefault(require("dgram"));
const timekeeper_1 = __importDefault(require("timekeeper"));
const sinon_1 = __importDefault(require("sinon"));
describe('proxy', function () {
    let server, client, target, clock;
    let port;
    let clientPort;
    let targetPort;
    beforeEach(function (done) {
        clock = sinon_1.default.useFakeTimers();
        port = (0, common_1.nextPort)();
        server = (0, index_1.createServer)({
            proxy: true
        });
        server.listen(port, () => {
            clientPort = (0, common_1.nextPort)();
            client = dgram_1.default.createSocket('udp4');
            targetPort = (0, common_1.nextPort)();
            target = (0, index_1.createServer)();
            client.bind(clientPort, () => {
                target.listen(targetPort, done);
            });
        });
    });
    afterEach(function (done) {
        function closeSocket(socketToClose, callback) {
            try {
                socketToClose.on('close', callback);
                socketToClose.close();
            }
            catch (ignored) {
                callback();
            }
        }
        clock.restore();
        closeSocket(client, () => {
            closeSocket(server, () => {
                closeSocket(target, () => {
                    timekeeper_1.default.reset();
                    done();
                });
            });
        });
    });
    function send(message) {
        client.send(message, 0, message.length, port, '127.0.0.1');
    }
    it('should resend the message to its destination specified in the Proxy-Uri option', function (done) {
        send((0, coap_packet_1.generate)({
            options: [{
                    name: 'Proxy-Uri',
                    value: Buffer.from(`coap://localhost:${targetPort}/the/path`)
                }]
        }));
        target.on('request', (req, res) => {
            done();
        });
    });
    it('should resend notifications in an observe connection', function (done) {
        let counter = 0;
        clock.restore();
        function sendObservation() {
            target.on('request', (req, res) => {
                res.setOption('Observe', 1);
                res.write('Pruebas');
                setTimeout(() => {
                    res.write('Pruebas2');
                    res.end('Last msg');
                }, 500);
            });
            return (0, index_1.request)({
                port: port,
                observe: true,
                proxyUri: `coap://localhost:${targetPort}/the/path`
            }).end();
        }
        const req = sendObservation();
        req.on('response', (res) => {
            res.on('data', (msg) => {
                if (counter === 2) {
                    done();
                }
                else {
                    counter++;
                }
                clock.tick(600);
            });
        });
    });
    it('should not process the request as a standard server request', function (done) {
        target.on('request', (req, res) => {
            done();
        });
        server.on('request', (req, res) => {
        });
        send((0, coap_packet_1.generate)({
            options: [{
                    name: 'Proxy-Uri',
                    value: Buffer.from(`coap://localhost:${targetPort}/the/path`)
                }]
        }));
    });
    it('should return the target response to the original requestor', function (done) {
        send((0, coap_packet_1.generate)({
            options: [{
                    name: 'Proxy-Uri',
                    value: Buffer.from(`coap://localhost:${targetPort}/the/path`)
                }]
        }));
        target.on('request', (req, res) => {
            res.end('The response');
        });
        client.on('message', (msg) => {
            const packet = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(packet.payload.toString()).to.eql('The response');
            done();
        });
    });
    describe('with a proxied request initiated by an agent', function () {
        it('should forward the request to the URI specified in proxyUri ', function (done) {
            const req = (0, index_1.request)({
                host: 'localhost',
                port: port,
                proxyUri: `coap://localhost:${targetPort}`,
                query: 'a=b'
            });
            target.on('request', (req, res) => {
                done();
            });
            req.end();
        });
        it('should forward the response to the request back to the agent', function (done) {
            const req = (0, index_1.request)({
                host: 'localhost',
                port: port,
                proxyUri: `coap://localhost:${targetPort}`,
                query: 'a=b'
            });
            target.on('request', (req, res) => {
                res.end('This is the response');
            });
            req.on('response', (res) => {
                (0, chai_1.expect)(res.payload.toString()).to.eql('This is the response');
                done();
            });
            req.end();
        });
    });
    describe('with a proxied request with a wrong destination', function () {
        it('should return an error to the caller', function (done) {
            this.timeout(20000);
            const req = (0, index_1.request)({
                host: 'localhost',
                port: port,
                proxyUri: 'coap://unexistentCOAPUri:7968',
                query: 'a=b'
            });
            target.on('request', (req, res) => {
                console.log('should not get here');
            });
            server.on('error', (req, res) => { });
            req
                .on('response', (res) => {
                try {
                    (0, chai_1.expect)(res.code).to.eql('5.00');
                    (0, chai_1.expect)(res.payload.toString()).to.match(/ENOTFOUND|EAI_AGAIN/);
                }
                catch (err) {
                    return done(err);
                }
                done();
            })
                .end();
        });
    });
    describe('with a non-proxied request', function () {
        it('should call the handler as usual', function (done) {
            const req = (0, index_1.request)({
                host: 'localhost',
                port: port,
                query: 'a=b'
            });
            target.on('request', (req, res) => {
                console.log('should not get here');
            });
            server.on('request', (req, res) => {
                res.end('Standard response');
            });
            req
                .on('response', (res) => {
                (0, chai_1.expect)(res.payload.toString()).to.contain('Standard response');
                done();
            })
                .end();
        });
    });
    describe('with an observe request to a proxied server', function () {
        it('should call the handler as usual', function (done) {
            const req = (0, index_1.request)({
                host: 'localhost',
                port: port,
                observe: true,
                query: 'a=b'
            });
            target.on('request', (req, res) => {
                console.log('should not get here');
            });
            server.on('request', (req, res) => {
                res.end('Standard response');
            });
            req
                .on('response', (res) => {
                (0, chai_1.expect)(res.payload.toString()).to.contain('Standard response');
                done();
            })
                .end();
        });
        it('should allow all the responses', function (done) {
            const req = (0, index_1.request)({
                host: 'localhost',
                port: port,
                observe: true,
                query: 'a=b'
            });
            let count = 0;
            target.on('request', (req, res) => {
                console.log('should not get here');
            });
            server.on('request', (req, res) => {
                res.setOption('Observe', 1);
                res.write('This is the first response');
                setTimeout(() => {
                    res.setOption('Observe', 1);
                    res.write('And this is the second');
                }, 200);
            });
            req
                .on('response', (res) => {
                res.on('data', (chunk) => {
                    count++;
                    if (count === 1) {
                        (0, chai_1.expect)(chunk.toString('utf8')).to.contain('This is the first response');
                        clock.tick(300);
                    }
                    else if (count === 2) {
                        (0, chai_1.expect)(chunk.toString('utf8')).to.contain('And this is the second');
                        done();
                    }
                });
            })
                .end();
        });
    });
});
//# sourceMappingURL=proxy.js.map