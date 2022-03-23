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
const coap_packet_1 = require("coap-packet");
const common_1 = require("./common");
const chai_1 = require("chai");
const index_1 = require("../index");
const dgram_1 = require("dgram");
const BufferListStream = require("bl");
const timekeeper_1 = __importDefault(require("timekeeper"));
const sinon_1 = __importDefault(require("sinon"));
const events_1 = require("events");
const parameters_1 = require("../lib/parameters");
const originalSetImmediate = setImmediate;
describe('server', function () {
    let server, port, clientPort, client, clock;
    beforeEach(function (done) {
        port = (0, common_1.nextPort)();
        server = (0, index_1.createServer)();
        server.listen(port, done);
    });
    beforeEach(function (done) {
        clientPort = (0, common_1.nextPort)();
        client = (0, dgram_1.createSocket)('udp4');
        client.bind(clientPort, done);
    });
    afterEach(function () {
        if (clock != null) {
            clock.restore();
        }
        client.close();
        server.close();
        timekeeper_1.default.reset();
    });
    function send(message) {
        client.send(message, 0, message.length, port, '127.0.0.1');
    }
    function fastForward(increase, max) {
        clock.tick(increase);
        if (increase < max) {
            originalSetImmediate(fastForward.bind(null, increase, max - increase));
        }
    }
    it('should receive a CoAP message', function (done) {
        send((0, coap_packet_1.generate)({}));
        server.on('request', (req, res) => {
            done();
        });
    });
    it('should listen when listen() has no argument ', function (done) {
        port = 5683;
        server.close(); // refresh
        server = (0, index_1.createServer)();
        server.on('request', (req, res) => {
            done();
        });
        server.listen();
        send((0, coap_packet_1.generate)({}));
    });
    it('should use a custom socket passed to listen()', function (done) {
        port = 5683;
        server.close(); // refresh
        server = (0, index_1.createServer)();
        server.on('request', (req, res) => {
            done();
        });
        const sock = new events_1.EventEmitter();
        sock.send = () => { };
        server.listen(sock, () => {
            (0, chai_1.expect)(server._sock).to.eql(sock);
            sock.emit('message', (0, coap_packet_1.generate)({}), { address: '127.0.0.1', port: (0, common_1.nextPort)() });
        });
    });
    it('should use the listener passed as a parameter in the creation', function (done) {
        port = 5683;
        server.close(); // refresh
        server = (0, index_1.createServer)({}, (req, res) => {
            done();
        });
        server.listen();
        send((0, coap_packet_1.generate)({}));
    });
    it('should listen by default to 5683', function (done) {
        server.close(); // we need to change port
        server = (0, index_1.createServer)();
        port = 5683;
        server.listen(() => {
            send((0, coap_packet_1.generate)({}));
        });
        server.on('request', (req, res) => {
            done();
        });
    });
    it('should receive a request that can be piped', function (done) {
        const buf = Buffer.alloc(25);
        send((0, coap_packet_1.generate)({ payload: buf }));
        server.on('request', (req, res) => {
            req.pipe(new BufferListStream((err, data) => {
                if (err != null) {
                    done(err);
                }
                else {
                    (0, chai_1.expect)(data).to.eql(buf);
                    done();
                }
            }));
        });
    });
    it('should expose the payload', function (done) {
        const buf = Buffer.alloc(25);
        send((0, coap_packet_1.generate)({ payload: buf }));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req.payload).to.eql(buf);
            done();
        });
    });
    it('should include an URL in the request', function (done) {
        const buf = Buffer.alloc(25);
        send((0, coap_packet_1.generate)({ payload: buf }));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req).to.have.property('url', '/');
            done();
        });
    });
    it('should include the code', function (done) {
        const buf = Buffer.alloc(25);
        send((0, coap_packet_1.generate)({ payload: buf }));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req).to.have.property('code', '0.01');
            done();
        });
    });
    it('should include a rsinfo', function (done) {
        send((0, coap_packet_1.generate)({}));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req).to.have.property('rsinfo');
            (0, chai_1.expect)(req.rsinfo).to.have.property('address');
            (0, chai_1.expect)(req.rsinfo).to.have.property('port');
            res.end('hello');
            done();
        });
    });
    ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'iPATCH'].forEach(function (method) {
        it('should include the \'' + method + '\' method', function (done) {
            send((0, coap_packet_1.generate)({ code: method }));
            server.on('request', (req, res) => {
                (0, chai_1.expect)(req).to.have.property('method', method);
                done();
            });
        });
    });
    it('should include the FETCH method when a Content-Format is present', function (done) {
        send((0, coap_packet_1.generate)({ code: 'FETCH', options: [{ name: 'Content-Format', value: Buffer.of(0x06, 0x06) }] }));
        server.on('request', function (req, res) {
            (0, chai_1.expect)(req).to.have.property('method', 'FETCH');
            done();
        });
    });
    it('should respond with an error to a FETCH request when no Content-Format is present', function (done) {
        send((0, coap_packet_1.generate)({ code: 'FETCH' }));
        client.on('message', function (msg, rsinfo) {
            (0, chai_1.expect)((0, coap_packet_1.parse)(msg).code).to.eql('4.15');
            done();
        });
    });
    it('should include the path in the URL', function (done) {
        send((0, coap_packet_1.generate)({
            options: [{
                    name: 'Uri-Path',
                    value: Buffer.from('hello')
                }, {
                    name: 'Uri-Path',
                    value: Buffer.from('world')
                }]
        }));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req).to.have.property('url', '/hello/world');
            done();
        });
    });
    it('should include the query in the URL', function (done) {
        send((0, coap_packet_1.generate)({
            options: [{
                    name: 'Uri-Query',
                    value: Buffer.from('a=b')
                }, {
                    name: 'Uri-Query',
                    value: Buffer.from('b=c')
                }]
        }));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req).to.have.property('url', '/?a=b&b=c');
            done();
        });
    });
    it('should include the path and the query in the URL', function (done) {
        send((0, coap_packet_1.generate)({
            options: [{
                    name: 'Uri-Query',
                    value: Buffer.from('a=b')
                }, {
                    name: 'Uri-Query',
                    value: Buffer.from('b=c')
                }, {
                    name: 'Uri-Path',
                    value: Buffer.from('hello')
                }, {
                    name: 'Uri-Path',
                    value: Buffer.from('world')
                }]
        }));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req).to.have.property('url', '/hello/world?a=b&b=c');
            done();
        });
    });
    it('should expose the options', function (done) {
        const options = [{
                name: '555',
                value: Buffer.alloc(45)
            }];
        send((0, coap_packet_1.generate)({
            options: options
        }));
        server.on('request', (req, res) => {
            (0, chai_1.expect)(req.options).to.eql(options);
            done();
        });
    });
    it('should include a reset() function in the response', function (done) {
        const buf = Buffer.alloc(25);
        const tok = Buffer.alloc(4);
        send((0, coap_packet_1.generate)({ payload: buf, token: tok }));
        client.on('message', (msg, rinfo) => {
            const result = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(result.code).to.eql('0.00');
            (0, chai_1.expect)(result.reset).to.eql(true);
            (0, chai_1.expect)(result.ack).to.eql(false);
            (0, chai_1.expect)(result.token.length).to.eql(0);
            (0, chai_1.expect)(result.payload.length).to.eql(0);
            done();
        });
        server.on('request', (req, res) => {
            res.reset();
        });
    });
    it('should only close once', function (done) {
        server.close(() => {
            server.close(done);
        });
    });
    it('should not overwrite existing socket', function (done) {
        const initialSock = server._sock;
        server.listen((0, common_1.nextPort)(), function (err) {
            (0, chai_1.expect)(err.message).to.eql('Already listening');
            (0, chai_1.expect)(server._sock).to.eql(initialSock);
            done();
        });
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
    describe('with the \'Content-Format\' header in the request', function () {
        function buildTest(option, format, value) {
            it(`should parse '${option}: ${format}'`, function (done) {
                send((0, coap_packet_1.generate)({
                    options: [{
                            name: option,
                            value: value
                        }]
                }));
                server.on('request', (req) => {
                    (0, chai_1.expect)(req.options[0].value).to.eql(format);
                    done();
                });
            });
            it('should include \'' + option + ': ' + format + '\' in the headers', function (done) {
                send((0, coap_packet_1.generate)({
                    options: [{
                            name: option,
                            value: value
                        }]
                }));
                server.on('request', (req) => {
                    (0, chai_1.expect)(req.headers).to.have.property(option, format);
                    done();
                });
            });
        }
        for (const format in formatsString) {
            buildTest('Content-Format', format, formatsString[format]);
            buildTest('Accept', format, formatsString[format]);
        }
    });
    describe('with the \'Content-Format\' header and an unknown value in the request', function () {
        it('should use the numeric format if the option value is in range', function (done) {
            send((0, coap_packet_1.generate)({
                options: [{
                        name: 'Content-Format',
                        value: Buffer.of(0x06, 0x06)
                    }]
            }));
            client.on('message', (msg) => {
                const response = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(response.code).to.equal('2.05');
                done();
            });
            server.on('request', (req, res) => {
                (0, chai_1.expect)(req.headers['Content-Format']).to.equal(1542);
                res.end();
            });
        });
        it('should ignore the option if the  option value is not in range', function (done) {
            send((0, coap_packet_1.generate)({
                options: [{
                        name: 'Content-Format',
                        value: Buffer.of(0xff, 0xff, 0x01)
                    }]
            }));
            client.on('message', (msg) => {
                const response = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(response.code).to.equal('2.05');
                done();
            });
            server.on('request', (req, res) => {
                (0, chai_1.expect)(req.headers['Content-Format']).to.equal(undefined);
                res.end();
            });
        });
    });
    describe('with a non-confirmable message', function () {
        const packet = {
            confirmable: false,
            messageId: 4242,
            token: Buffer.alloc(5)
        };
        function sendAndRespond(status) {
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                if (status != null) {
                    res.statusCode = status;
                }
                res.end('42');
            });
        }
        it('should reply with a payload to a NON message', function (done) {
            sendAndRespond();
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).payload).to.eql(Buffer.from('42'));
                done();
            });
        });
        it('should include the original messageId', function (done) {
            sendAndRespond();
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).messageId).to.eql(4242);
                done();
            });
        });
        it('should include the token', function (done) {
            sendAndRespond();
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).token).to.eql(packet.token);
                done();
            });
        });
        it('should respond with a different code', function (done) {
            sendAndRespond('2.04');
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).code).to.eql('2.04');
                done();
            });
        });
        it('should respond with a numeric code', function (done) {
            sendAndRespond(204);
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).code).to.eql('2.04');
                done();
            });
        });
        it('should allow to add an option', function (done) {
            const buf = Buffer.alloc(3);
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.setOption('ETag', buf);
                res.end('42');
            });
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('ETag');
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf);
                done();
            });
        });
        it('should overwrite the option', function (done) {
            const buf = Buffer.alloc(3);
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.setOption('ETag', Buffer.alloc(3));
                res.setOption('ETag', buf);
                res.end('42');
            });
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf);
                done();
            });
        });
        it('should alias setOption to setHeader', function (done) {
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.setHeader('ETag', 'hello world');
                res.end('42');
            });
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('ETag');
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.from('hello world'));
                done();
            });
        });
        it('should set multiple options', function (done) {
            const buf1 = Buffer.alloc(3);
            const buf2 = Buffer.alloc(3);
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.setOption('433', [buf1, buf2]);
                res.end('42');
            });
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(buf1);
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[1].value).to.eql(buf2);
                done();
            });
        });
        it('should calculate the response only once', function (done) {
            send((0, coap_packet_1.generate)(packet));
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.end('42');
                // this will error if called twice
                done();
            });
        });
        it('should calculate the response twice after the interval', function (done) {
            clock = sinon_1.default.useFakeTimers();
            let first = true;
            const delay = (parameters_1.parameters.exchangeLifetime * 1000) + 1;
            server.on('request', (req, res) => {
                if (first) {
                    res.end('42');
                    first = false;
                    setTimeout(() => {
                        send((0, coap_packet_1.generate)(packet));
                    }, delay);
                    fastForward(100, delay);
                }
                else {
                    res.end('24');
                    done();
                }
            });
            send((0, coap_packet_1.generate)(packet));
        });
        it('should include \'ETag\' in the response options', function (done) {
            send((0, coap_packet_1.generate)({}));
            server.on('request', (req, res) => {
                res.setOption('ETag', 'abcdefgh');
                res.end('42');
            });
            client.on('message', (msg, rsinfo) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('ETag');
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.from('abcdefgh'));
                done();
            });
        });
        it('should include \'Content-Format\' in the response options', function (done) {
            send((0, coap_packet_1.generate)({}));
            server.on('request', (req, res) => {
                res.setOption('Content-Format', 'text/plain');
                res.end('42');
            });
            client.on('message', (msg, rsinfo) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('Content-Format');
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(0));
                done();
            });
        });
        it('should reply with a \'5.00\' if it cannot parse the packet', function (done) {
            send(Buffer.alloc(3));
            client.on('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).code).to.eql('5.00');
                done();
            });
        });
        it('should not retry sending the response', function (done) {
            clock = sinon_1.default.useFakeTimers();
            let messages = 0;
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.end('42');
            });
            client.on('message', (msg) => {
                messages++;
            });
            setTimeout(() => {
                (0, chai_1.expect)(messages).to.eql(1);
                done();
            }, 45 * 1000);
            fastForward(100, 45 * 1000);
        });
    });
    describe('with a confirmable message', function () {
        const packet = {
            confirmable: true,
            messageId: 4242,
            token: Buffer.alloc(5)
        };
        it('should reply in piggyback', function (done) {
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.end('42');
            });
            client.on('message', (msg) => {
                const response = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(response.ack).to.be.eql(true);
                (0, chai_1.expect)(response.messageId).to.eql(packet.messageId);
                (0, chai_1.expect)(response.payload).to.eql(Buffer.from('42'));
                done();
            });
        });
        it('should ack the message if it does not reply in 50ms', function (done) {
            send((0, coap_packet_1.generate)(packet));
            client.once('message', (msg) => {
                const response = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(response.ack).to.be.eql(true);
                (0, chai_1.expect)(response.code).to.eql('0.00');
                (0, chai_1.expect)(response.messageId).to.eql(packet.messageId);
                (0, chai_1.expect)(response.payload).to.eql(Buffer.alloc(0));
                done();
            });
            fastForward(10, 1000);
        });
        it('should reply with a confirmable after an ack', function (done) {
            clock = sinon_1.default.useFakeTimers();
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                setTimeout(() => {
                    res.end('42');
                }, 200);
            });
            client.once('message', (msg) => {
                const response = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(response.ack).to.be.eql(true);
                client.once('message', (msg) => {
                    const response = (0, coap_packet_1.parse)(msg);
                    (0, chai_1.expect)(response.confirmable).to.be.eql(true);
                    (0, chai_1.expect)(response.messageId).not.to.eql(packet.messageId);
                    done();
                });
            });
            fastForward(100, 1000);
        });
        it('should retry sending the response if it does not receive an ack four times before 45s', function (done) {
            clock = sinon_1.default.useFakeTimers();
            let messages = 0;
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                setTimeout(() => {
                    res.end('42');
                }, 200);
            });
            client.once('message', (msg) => {
                client.on('message', (msg) => {
                    messages++;
                });
            });
            setTimeout(() => {
                try {
                    // original one plus 4 retries
                    (0, chai_1.expect)(messages).to.eql(5);
                }
                catch (err) {
                    return done(err);
                }
                done();
            }, 45 * 1000);
            fastForward(100, 45 * 1000);
        });
        it('should stop resending after it receives an ack', function (done) {
            clock = sinon_1.default.useFakeTimers();
            let messages = 0;
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                setTimeout(() => {
                    res.end('42');
                }, 200);
            });
            client.once('message', (msg) => {
                client.on('message', (msg) => {
                    const res = (0, coap_packet_1.parse)(msg);
                    send((0, coap_packet_1.generate)({
                        code: '0.00',
                        messageId: res.messageId,
                        ack: true
                    }));
                    messages++;
                });
            });
            setTimeout(() => {
                (0, chai_1.expect)(messages).to.eql(1);
                done();
            }, 45 * 1000);
            fastForward(100, 45 * 1000);
        });
        it('should not resend with a piggyback response', function (done) {
            clock = sinon_1.default.useFakeTimers();
            let messages = 0;
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                res.end('42');
            });
            client.on('message', (msg) => {
                messages++;
            });
            setTimeout(() => {
                (0, chai_1.expect)(messages).to.eql(1);
                done();
            }, 45 * 1000);
            fastForward(100, 45 * 1000);
        });
        it('should error if it does not receive an ack four times before ~247s', function (done) {
            clock = sinon_1.default.useFakeTimers();
            send((0, coap_packet_1.generate)(packet));
            server.on('request', (req, res) => {
                // needed to avoid sending a piggyback response
                setTimeout(() => {
                    res.end('42');
                }, 200);
                res.on('error', (err) => {
                    (0, chai_1.expect)(err).to.have.property('retransmitTimeout', 247);
                    done();
                });
            });
            fastForward(100, 250 * 1000);
        });
    });
    describe('close', function () {
        it('should emit "close" event when closed', function () {
            const stub = sinon_1.default.stub();
            server.on('close', stub);
            server.close();
            (0, chai_1.expect)(stub.callCount).to.equal(1);
        });
        it('should only emit "close" if the server has not already been closed', function () {
            const stub = sinon_1.default.stub();
            server.on('close', stub);
            server.close();
            server.close();
            (0, chai_1.expect)(stub.callCount).to.equal(1);
        });
    });
    describe('observe', function () {
        const token = Buffer.alloc(3);
        function doObserve(method) {
            if (method == null) {
                method = 'GET';
            }
            send((0, coap_packet_1.generate)({
                code: method,
                confirmable: true,
                token: token,
                options: [{
                        name: 'Observe',
                        value: Buffer.alloc(0)
                    }]
            }));
        }
        ['PUT', 'POST', 'DELETE', 'PATCH', 'iPATCH'].forEach(function (method) {
            it('should return an error when try to observe in a ' + method, function (done) {
                doObserve(method);
                server.on('request', () => {
                    done(new Error('A request should not be emitted'));
                });
                client.on('message', (msg) => {
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).code).to.eql('5.00');
                    done();
                });
            });
        });
        it('should include a rsinfo', function (done) {
            doObserve();
            server.on('request', (req, res) => {
                (0, chai_1.expect)(req).to.have.property('rsinfo');
                (0, chai_1.expect)(req.rsinfo).to.have.property('address');
                (0, chai_1.expect)(req.rsinfo).to.have.property('port');
                res.end('hello');
                done();
            });
        });
        it('should emit a request with \'Observe\' in the headers', function (done) {
            doObserve();
            server.on('request', (req, res) => {
                (0, chai_1.expect)(req.headers).to.have.property('Observe');
                res.end('hello');
                done();
            });
        });
        it('should send multiple messages for multiple writes', function (done) {
            doObserve();
            server.on('request', (req, res) => {
                res.write('hello');
                originalSetImmediate(function () {
                    res.end('world');
                });
            });
            // the first one is an ack
            client.once('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).payload.toString()).to.eql('hello');
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('Observe');
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(1));
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).token).to.eql(token);
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).code).to.eql('2.05');
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).ack).to.be.eql(true);
                client.once('message', (msg) => {
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).payload.toString()).to.eql('world');
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].name).to.eql('Observe');
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(2));
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).token).to.eql(token);
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).code).to.eql('2.05');
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).ack).to.be.eql(false);
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).confirmable).to.be.eql(true);
                    done();
                });
            });
        });
        it('should emit a \'finish\' if the client do not ack for ~247s', function (done) {
            clock = sinon_1.default.useFakeTimers();
            doObserve();
            server.on('request', (req, res) => {
                // the first is the current status
                // it's in piggyback on the ack
                res.write('hello');
                // the second status is on the observe
                res.write('hello2');
                res.on('finish', () => {
                    done();
                });
            });
            fastForward(100, 248 * 1000);
        });
        it('should emit a \'finish\' if the client do a reset', function (done) {
            doObserve();
            server.on('request', (req, res) => {
                res.write('hello');
                res.write('world');
                res.on('finish', () => {
                    done();
                });
            });
            client.on('message', (msg) => {
                const packet = (0, coap_packet_1.parse)(msg);
                send((0, coap_packet_1.generate)({
                    reset: true,
                    messageId: packet.messageId,
                    code: '0.00'
                }));
            });
        });
        it('should send a \'RST\' to the client if the msg.reset() method is invoked', function (done) {
            doObserve();
            server.on('request', (req, res) => {
                res.reset();
            });
            client.on('message', (msg) => {
                const result = (0, coap_packet_1.parse)(msg);
                (0, chai_1.expect)(result.code).to.eql('0.00');
                (0, chai_1.expect)(result.reset).to.eql(true);
                (0, chai_1.expect)(result.ack).to.eql(false);
                (0, chai_1.expect)(result.payload.length).to.eql(0);
                done();
            });
        });
        it('should correctly generate two-byte long sequence numbers', function (done) {
            doObserve();
            server.on('request', (req, res) => {
                // hack to override the message counter
                res._counter = 4242;
                res.write('hello');
                originalSetImmediate(function () {
                    res.end('world');
                });
            });
            // the first one is an ack
            client.once('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(0x10, 0x93));
                client.once('message', (msg) => {
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(0x10, 0x94));
                    done();
                });
            });
        });
        it('should correctly generate three-byte long sequence numbers', function (done) {
            doObserve();
            server.on('request', (req, res) => {
                // hack to override the message counter
                res._counter = 65535;
                res.write('hello');
                originalSetImmediate(function () {
                    res.end('world');
                });
            });
            // the first one is an ack
            client.once('message', (msg) => {
                (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(1, 0, 0));
                client.once('message', (msg) => {
                    (0, chai_1.expect)((0, coap_packet_1.parse)(msg).options[0].value).to.eql(Buffer.of(1, 0, 1));
                    done();
                });
            });
        });
    });
    describe('multicast', function () {
        const port = (0, common_1.nextPort)();
        it('receive CoAP message', function (done) {
            const server = (0, index_1.createServer)({
                multicastAddress: '224.0.1.2'
            });
            server.listen(port);
            server.once('request', (req, res) => {
                done();
            });
            (0, index_1.request)({
                host: '224.0.1.2',
                port: port,
                multicast: true
            }).end();
        });
    });
});
describe('validate custom server options', function () {
    let server;
    let port;
    let client;
    let clientPort;
    beforeEach(function (done) {
        port = (0, common_1.nextPort)();
        clientPort = (0, common_1.nextPort)();
        client = (0, dgram_1.createSocket)('udp4');
        client.bind(clientPort, done);
    });
    afterEach(function () {
        client.close();
        server.close();
    });
    function send(message) {
        client.send(message, 0, message.length, port, '127.0.0.1');
    }
    it('use custom piggyBackTimeout time', function (done) {
        const piggyBackTimeout = 10;
        let messages = 0;
        server = (0, index_1.createServer)({ piggybackReplyMs: piggyBackTimeout });
        server.listen(port);
        server.on('request', (req, res) => {
            res.end('42');
        });
        client.on('message', (msg) => {
            messages++;
        });
        send(Buffer.alloc(3));
        setTimeout(() => {
            (0, chai_1.expect)(messages).to.eql(1);
            (0, chai_1.expect)(server._options.piggybackReplyMs).to.eql(piggyBackTimeout);
            done();
        }, piggyBackTimeout + 10);
    });
    it('use default piggyBackTimeout time (50ms)', function (done) {
        server = (0, index_1.createServer)();
        (0, chai_1.expect)(server._options.piggybackReplyMs).to.eql(50);
        done();
    });
    it('ignore invalid piggyBackTimeout time and use default (50ms)', function (done) {
        const input = 'foo';
        server = (0, index_1.createServer)({ piggybackReplyMs: input });
        (0, chai_1.expect)(server._options.piggybackReplyMs).to.eql(50);
        done();
    });
    it('use default sendAcksForNonConfirmablePackets', function (done) {
        server = (0, index_1.createServer)();
        (0, chai_1.expect)(server._options.sendAcksForNonConfirmablePackets).to.eql(true);
        done();
    });
    it('define sendAcksForNonConfirmablePackets: true', function (done) {
        server = (0, index_1.createServer)({ sendAcksForNonConfirmablePackets: true });
        (0, chai_1.expect)(server._options.sendAcksForNonConfirmablePackets).to.eql(true);
        done();
    });
    it('define sendAcksForNonConfirmablePackets: false', function (done) {
        server = (0, index_1.createServer)({ sendAcksForNonConfirmablePackets: false });
        (0, chai_1.expect)(server._options.sendAcksForNonConfirmablePackets).to.eql(false);
        done();
    });
    it('define invalid sendAcksForNonConfirmablePackets setting', function (done) {
        const input = 'moo';
        server = (0, index_1.createServer)({ sendAcksForNonConfirmablePackets: input });
        (0, chai_1.expect)(server._options.sendAcksForNonConfirmablePackets).to.eql(true);
        done();
    });
    function sendNonConfirmableMessage() {
        const packet = {
            confirmable: false,
            messageId: 4242,
            token: Buffer.alloc(5)
        };
        send((0, coap_packet_1.generate)(packet));
    }
    function sendConfirmableMessage() {
        const packet = {
            confirmable: true,
            messageId: 4242,
            token: Buffer.alloc(5)
        };
        send((0, coap_packet_1.generate)(packet));
    }
    it('should send ACK for non-confirmable message, sendAcksForNonConfirmablePackets=true', function (done) {
        server = (0, index_1.createServer)({ sendAcksForNonConfirmablePackets: true });
        server.listen(port);
        server.on('request', (req, res) => {
            res.end('42');
        });
        client.on('message', (msg) => {
            done();
        });
        sendNonConfirmableMessage();
    });
    it('should not send ACK for non-confirmable message, sendAcksForNonConfirmablePackets=false', function (done) {
        let messages = 0;
        server = (0, index_1.createServer)({ sendAcksForNonConfirmablePackets: false });
        server.listen(port);
        server.on('request', (req, res) => {
            res.end('42');
        });
        client.on('message', (msg) => {
            messages++;
        });
        sendNonConfirmableMessage();
        setTimeout(() => {
            (0, chai_1.expect)(messages).to.eql(0);
            done();
        }, 30);
    });
    it('should send ACK for confirmable message, sendAcksForNonConfirmablePackets=true', function (done) {
        server = (0, index_1.createServer)({ sendAcksForNonConfirmablePackets: true });
        server.listen(port);
        server.on('request', (req, res) => {
            res.end('42');
        });
        client.on('message', (msg) => {
            done();
        });
        sendConfirmableMessage();
    });
});
describe('server LRU', function () {
    let server, port, clientPort, client, clock;
    const packet = {
        confirmable: true,
        messageId: 4242,
        token: Buffer.alloc(5)
    };
    beforeEach(function (done) {
        clock = sinon_1.default.useFakeTimers();
        port = (0, common_1.nextPort)();
        server = (0, index_1.createServer)();
        server.listen(port, done);
    });
    beforeEach(function (done) {
        clientPort = (0, common_1.nextPort)();
        client = (0, dgram_1.createSocket)('udp4');
        client.bind(clientPort, done);
    });
    afterEach(function () {
        clock.restore();
        client.close();
        server.close();
        timekeeper_1.default.reset();
    });
    function send(message) {
        client.send(message, 0, message.length, port, '127.0.0.1');
    }
    it('should remove old packets after < exchangeLifetime x 1.5', function (done) {
        send((0, coap_packet_1.generate)(packet));
        server.on('request', (req, res) => {
            res.end();
            (0, chai_1.expect)(server._lru.itemCount).to.be.equal(1);
            clock.tick(parameters_1.parameters.exchangeLifetime * 500);
            (0, chai_1.expect)(server._lru.itemCount).to.be.equal(1);
            clock.tick(parameters_1.parameters.exchangeLifetime * 1000);
            (0, chai_1.expect)(server._lru.itemCount).to.be.equal(0);
            done();
        });
    });
});
describe('server block cache', function () {
    let server, port, clientPort, client, clock;
    const packet = {
        confirmable: true,
        messageId: 4242,
        token: Buffer.alloc(5)
    };
    beforeEach(function (done) {
        clock = sinon_1.default.useFakeTimers();
        port = (0, common_1.nextPort)();
        server = (0, index_1.createServer)();
        server.listen(port, done);
    });
    beforeEach(function (done) {
        clientPort = (0, common_1.nextPort)();
        client = (0, dgram_1.createSocket)('udp4');
        client.bind(clientPort, done);
    });
    afterEach(function () {
        clock.restore();
        client.close();
        server.close();
        timekeeper_1.default.reset();
    });
    function send(message) {
        client.send(message, 0, message.length, port, '127.0.0.1');
    }
    it('should have block1Cache return {}', function (done) {
        send((0, coap_packet_1.generate)(packet));
        server.on('request', (req, res) => {
            res.end();
            (0, chai_1.expect)(server._block1Cache._factory()).to.eql({});
            done();
        });
    });
    it('should have block2Cache return null', function (done) {
        send((0, coap_packet_1.generate)(packet));
        server.on('request', (req, res) => {
            res.end();
            (0, chai_1.expect)(server._block2Cache._factory()).to.eql(null);
            done();
        });
    });
});
describe('Client Identifier', function () {
    let server, port, clientPort, client, clock;
    const packet = function (key) {
        return {
            confirmable: true,
            messageId: 4242,
            token: Buffer.alloc(5),
            options: [
                { name: 2109, value: Buffer.from(key) }
            ]
        };
    };
    beforeEach(function (done) {
        clock = sinon_1.default.useFakeTimers();
        port = (0, common_1.nextPort)();
        server = (0, index_1.createServer)({
            clientIdentifier: (request) => {
                let authenticationHeader;
                if (request._packet.options != null) {
                    authenticationHeader = request._packet.options.find(o => o.name === 2109);
                }
                if (typeof authenticationHeader !== 'undefined') {
                    return `auth:${authenticationHeader.value.toString()}`;
                }
                return `unauth:${request.rsinfo.address}:${request.rsinfo.port}`;
            }
        });
        server.listen(port, done);
    });
    beforeEach(function (done) {
        clientPort = (0, common_1.nextPort)();
        client = (0, dgram_1.createSocket)('udp4');
        client.bind(clientPort, done);
    });
    afterEach(function () {
        clock.restore();
        client.close();
        server.close();
        timekeeper_1.default.reset();
    });
    function send(message) {
        client.send(message, 0, message.length, port, '127.0.0.1');
    }
    it('should share the cache between two requests of the same client', function (done) {
        let messagesSent = 0;
        let messagesReceived = 0;
        server.on('request', (req, res) => {
            res.end(`${messagesSent}`);
            messagesSent += 1;
        });
        client.on('message', (msg) => {
            const result = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(result.payload.toString(), '0');
            messagesReceived += 1;
            if (messagesReceived === 2) {
                done();
            }
        });
        send((0, coap_packet_1.generate)(packet('key1')));
        send((0, coap_packet_1.generate)(packet('key1')));
    });
    it('should not share the cache between requests of different clients', function (done) {
        let messagesSent = 0;
        let messagesReceived = 0;
        server.on('request', (req, res) => {
            res.end(`${messagesSent}`);
            messagesSent += 1;
        });
        client.on('message', (msg) => {
            const result = (0, coap_packet_1.parse)(msg);
            (0, chai_1.expect)(result.payload.toString(), `${messagesReceived}`);
            messagesReceived += 1;
            if (messagesReceived === 2) {
                done();
            }
        });
        send((0, coap_packet_1.generate)(packet('key1')));
        send((0, coap_packet_1.generate)(packet('key2')));
    });
});
//# sourceMappingURL=server.js.map