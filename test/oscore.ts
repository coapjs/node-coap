/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { nextPort } from './common'
import { expect } from 'chai'
import { request, createServer, Agent, SecurityContextManager } from '../index'
import { OSCORE, OscoreContextStatus } from 'coap-oscore'
import { generate, parse } from 'coap-packet'
import dgram from 'dgram'
import type IncomingMessage from '../lib/incoming_message'
import type OutgoingMessage from '../lib/outgoing_message'
import type Server from '../lib/server'

function createOscorePair (opts?: { idContext?: Buffer, clientId?: Buffer, serverId?: Buffer, masterSecret?: Buffer, masterSalt?: Buffer }): { client: OSCORE, server: OSCORE } {
    const masterSecret = opts?.masterSecret ?? Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex')
    const masterSalt = opts?.masterSalt ?? Buffer.from('9e7ca92223786340', 'hex')
    const idContext = opts?.idContext ?? Buffer.alloc(0)
    const clientId = opts?.clientId ?? Buffer.from('01', 'hex')
    const serverId = opts?.serverId ?? Buffer.from('02', 'hex')

    const client = new OSCORE({
        masterSecret,
        masterSalt,
        senderId: clientId,
        recipientId: serverId,
        idContext,
        status: OscoreContextStatus.Fresh
    })

    const server = new OSCORE({
        masterSecret,
        masterSalt,
        senderId: serverId,
        recipientId: clientId,
        idContext,
        status: OscoreContextStatus.Fresh
    })

    return { client, server }
}

describe('OSCORE', function () {
    const servers: Server[] = []
    const agents: InstanceType<typeof Agent>[] = []

    function trackServer (s: Server): Server {
        servers.push(s)
        return s
    }

    function trackAgent (a: InstanceType<typeof Agent>): InstanceType<typeof Agent> {
        agents.push(a)
        return a
    }

    afterEach(function (done) {
        for (const s of servers) {
            try { s.close() } catch {}
        }
        servers.length = 0
        for (const a of agents) {
            try { a.close() } catch {}
        }
        agents.length = 0
        setImmediate(done)
    })

    describe('client-server round-trip', function () {
        it('should complete a GET request with OSCORE encryption', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))
            server.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                expect(req.isOscore).to.equal(true)
                expect(req.oscoreContext).to.not.be.undefined
                expect(req.oscoreContext!.senderId.toString('hex')).to.equal('01')
                res.end(Buffer.from('Hello OSCORE'))
            })
            server.listen(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('response', (res) => {
                    expect(res.payload.toString()).to.equal('Hello OSCORE')
                    done()
                })
                req.end()
            })
        })

        it('should complete a POST request with OSCORE encryption', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))
            server.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                expect(req.isOscore).to.equal(true)
                expect(req.payload.toString()).to.equal('request data')
                res.end(Buffer.from('response data'))
            })
            server.listen(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    method: 'POST',
                    agent
                })
                req.on('response', (res) => {
                    expect(res.payload.toString()).to.equal('response data')
                    done()
                })
                req.end(Buffer.from('request data'))
            })
        })
    })

    describe('mixed secure/insecure server', function () {
        it('should handle both OSCORE and plaintext requests', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))
            let requestCount = 0

            server.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                requestCount++
                if (requestCount === 1) {
                    expect(req.isOscore).to.equal(true)
                    res.end(Buffer.from('secure'))
                } else {
                    expect(req.isOscore).to.equal(false)
                    res.end(Buffer.from('plain'))
                }
            })

            server.listen(port, () => {
                const oscoreAgent = trackAgent(new Agent({ type: 'udp4' }))
                oscoreAgent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req1 = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent: oscoreAgent
                })
                req1.on('response', (res1) => {
                    expect(res1.payload.toString()).to.equal('secure')

                    const plainAgent = trackAgent(new Agent({ type: 'udp4' }))
                    const req2 = request({
                        hostname: '127.0.0.1',
                        port,
                        pathname: '/test',
                        agent: plainAgent
                    })
                    req2.on('response', (res2) => {
                        expect(res2.payload.toString()).to.equal('plain')
                        done()
                    })
                    req2.end()
                })
                req1.end()
            })
        })
    })

    describe('oscoreOnly server', function () {
        it('should reject unprotected requests with 4.01', function (done) {
            const port = nextPort()
            const { server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts, oscoreOnly: true }))
            server.on('request', () => {
                done(new Error('Should not receive request'))
            })

            server.listen(port, () => {
                const plainAgent = trackAgent(new Agent({ type: 'udp4' }))
                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent: plainAgent
                })
                req.on('response', (res) => {
                    expect(res.code).to.equal('4.01')
                    done()
                })
                req.end()
            })
        })
    })

    describe('oscoreOnly agent', function () {
        it('should throw on requests to peers without context', function () {
            const agent = trackAgent(new Agent({ type: 'udp4', oscoreOnly: true }))
            expect(() => {
                request({
                    hostname: '127.0.0.1',
                    port: 5683,
                    pathname: '/test',
                    agent
                }).end()
            }).to.throw('No OSCORE context for')
        })
    })

    describe('multiple client contexts on agent', function () {
        it('should route OSCORE correctly to different peers', function (done) {
            const port1 = nextPort()
            const port2 = nextPort()

            // Two completely separate key pairs
            const pair1 = createOscorePair({
                clientId: Buffer.from('01', 'hex'),
                serverId: Buffer.from('02', 'hex')
            })
            const pair2 = createOscorePair({
                masterSecret: Buffer.from('aabbccddeeff00112233445566778899', 'hex'),
                masterSalt: Buffer.from('1122334455667788', 'hex'),
                clientId: Buffer.from('03', 'hex'),
                serverId: Buffer.from('04', 'hex')
            })

            const contexts1 = new SecurityContextManager()
            contexts1.addContext(pair1.server, Buffer.from('01', 'hex'))

            const contexts2 = new SecurityContextManager()
            contexts2.addContext(pair2.server, Buffer.from('03', 'hex'))

            const server1 = trackServer(createServer({ oscoreContexts: contexts1 }))
            const server2 = trackServer(createServer({ oscoreContexts: contexts2 }))

            server1.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                res.end(Buffer.from('server1'))
            })
            server2.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                res.end(Buffer.from('server2'))
            })

            server1.listen(port1, () => {
                server2.listen(port2, () => {
                    // Use separate agents per peer — agent closes socket after
                    // its request completes, so sequential requests from response
                    // handlers need separate agents
                    const agent1 = trackAgent(new Agent({ type: 'udp4' }))
                    agent1.addOscoreContext('127.0.0.1', port1, pair1.client)

                    const agent2 = trackAgent(new Agent({ type: 'udp4' }))
                    agent2.addOscoreContext('127.0.0.1', port2, pair2.client)

                    const req1 = request({
                        hostname: '127.0.0.1',
                        port: port1,
                        pathname: '/test',
                        agent: agent1
                    })
                    req1.on('response', (res1) => {
                        expect(res1.payload.toString()).to.equal('server1')

                        const req2 = request({
                            hostname: '127.0.0.1',
                            port: port2,
                            pathname: '/test',
                            agent: agent2
                        })
                        req2.on('response', (res2) => {
                            expect(res2.payload.toString()).to.equal('server2')
                            done()
                        })
                        req2.end()
                    })
                    req1.end()
                })
            })
        })
    })

    describe('multiple client contexts on server', function () {
        it('should handle requests from different OSCORE clients', function (done) {
            const port = nextPort()

            const pair1 = createOscorePair({
                clientId: Buffer.from('01', 'hex'),
                serverId: Buffer.from('03', 'hex')
            })
            const pair2 = createOscorePair({
                masterSecret: Buffer.from('aabbccddeeff00112233445566778899', 'hex'),
                masterSalt: Buffer.from('1122334455667788', 'hex'),
                clientId: Buffer.from('02', 'hex'),
                serverId: Buffer.from('03', 'hex')
            })

            const contexts = new SecurityContextManager()
            contexts.addContext(pair1.server, Buffer.from('01', 'hex'))
            contexts.addContext(pair2.server, Buffer.from('02', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))
            const senderIds: string[] = []

            server.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                senderIds.push(req.oscoreContext!.senderId.toString('hex'))
                res.end(Buffer.from(`hello ${req.oscoreContext!.senderId.toString('hex')}`))
            })

            server.listen(port, () => {
                const agentA = trackAgent(new Agent({ type: 'udp4' }))
                agentA.addOscoreContext('127.0.0.1', port, pair1.client)

                const reqA = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent: agentA
                })
                reqA.on('response', (resA) => {
                    expect(resA.payload.toString()).to.equal('hello 01')

                    const agentB = trackAgent(new Agent({ type: 'udp4' }))
                    agentB.addOscoreContext('127.0.0.1', port, pair2.client)

                    const reqB = request({
                        hostname: '127.0.0.1',
                        port,
                        pathname: '/test',
                        agent: agentB
                    })
                    reqB.on('response', (resB) => {
                        expect(resB.payload.toString()).to.equal('hello 02')
                        expect(senderIds).to.deep.equal(['01', '02'])
                        done()
                    })
                    reqB.end()
                })
                reqA.end()
            })
        })
    })

    describe('unknown client on server', function () {
        it('should not emit request for unknown KID', function (done) {
            const port = nextPort()

            // Client with sender ID 0x05 (not registered on server)
            const unknownClient = new OSCORE({
                masterSecret: Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex'),
                masterSalt: Buffer.from('9e7ca92223786340', 'hex'),
                senderId: Buffer.from('05', 'hex'),
                recipientId: Buffer.from('02', 'hex'),
                idContext: Buffer.alloc(0),
                status: OscoreContextStatus.Fresh
            })

            // Server only has context for sender ID 0x01
            const serverOscore = new OSCORE({
                masterSecret: Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex'),
                masterSalt: Buffer.from('9e7ca92223786340', 'hex'),
                senderId: Buffer.from('02', 'hex'),
                recipientId: Buffer.from('01', 'hex'),
                idContext: Buffer.alloc(0),
                status: OscoreContextStatus.Fresh
            })

            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))
            server.on('request', () => {
                done(new Error('Should not receive request from unknown client'))
            })

            server.listen(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, unknownClient)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent,
                    retrySend: 0
                })
                // Server rejects unknown KID with plaintext 4.01. The client
                // surfaces this as an error on the request — swallow it; the
                // assertion we care about is that the server's 'request' event
                // never fires for an unknown KID.
                req.on('error', () => {})
                req.end()

                setTimeout(() => {
                    done()
                }, 500)
            })
        })
    })

    describe('SSN persistence', function () {
        it('should emit ssn events via SecurityContextManager', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            let ssnFired = false
            contexts.on('ssn', (recipientId, idContext, ssn) => {
                ssnFired = true
                expect(recipientId.toString('hex')).to.equal('01')
                expect(typeof ssn).to.equal('bigint')
            })

            // Use observe so the server sends notifications — notifications
            // increment SSN and emit the 'ssn' event (normal responses reuse
            // the request nonce and don't increment SSN per RFC 8613).
            const server = trackServer(createServer({ oscoreContexts: contexts }))
            server.on('request', (req: IncomingMessage, res: any) => {
                res.write(Buffer.from('first'))
                setTimeout(() => res.write(Buffer.from('second')), 20)
            })
            server.listen(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    observe: true,
                    agent
                })
                req.on('response', (res) => {
                    // After receiving first notification, give SSN event time to propagate
                    res.once('data', () => {
                        setTimeout(() => {
                            expect(ssnFired).to.equal(true)
                            done()
                        }, 50)
                    })
                })
                req.end()
            })
        })
    })

    describe('dynamic context management', function () {
        it('should add/remove contexts at runtime on agent', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))
            server.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                res.end(Buffer.from('OK'))
            })

            server.listen(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('response', (res) => {
                    expect(res.payload.toString()).to.equal('OK')
                    agent.removeOscoreContext('127.0.0.1', port)
                    done()
                })
                req.end()
            })
        })

        it('should add contexts at runtime on server', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const server = trackServer(createServer())
            server.on('request', (req: IncomingMessage, res: OutgoingMessage) => {
                expect(req.isOscore).to.equal(true)
                res.end(Buffer.from('dynamic'))
            })

            server.listen(port, () => {
                server.addOscoreContext(serverOscore, Buffer.from('01', 'hex'))

                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('response', (res) => {
                    expect(res.payload.toString()).to.equal('dynamic')
                    done()
                })
                req.end()
            })
        })
    })

    describe('observe with OSCORE', function () {
        it('should receive observe notifications with OSCORE', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))

            let observeStream: any
            server.on('request', (req: IncomingMessage, res: any) => {
                expect(req.isOscore).to.equal(true)
                observeStream = res
                res.statusCode = '2.05'
                res.write(Buffer.from('first'))
            })

            server.listen(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    observe: true,
                    agent
                })

                const payloads: string[] = []
                req.on('response', (res) => {
                    res.on('data', (data: Buffer) => {
                        payloads.push(data.toString())
                        if (payloads.length === 1) {
                            expect(payloads[0]).to.equal('first')
                            setTimeout(() => {
                                observeStream.write(Buffer.from('second'))
                            }, 50)
                        } else if (payloads.length === 2) {
                            expect(payloads[1]).to.equal('second')
                            res.close()
                            done()
                        }
                    })
                })
                req.end()
            })
        })
    })

    describe('non-OSCORE messages from OSCORE peer', function () {
        it('should not error the request when receiving a plain empty ACK followed by a separate OSCORE response', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                serverOscore.decode(msg).then(async (decoded) => {
                    const innerReq = parse(decoded)
                    const outerReq = parse(msg)
                    const messageId = outerReq.messageId
                    const token = innerReq.token

                    // Step 1: plain empty ACK (RFC 8613 §4.2 — never OSCORE-protected).
                    // This is the trigger for the regression introduced in ef74dce.
                    const emptyAck = generate({
                        code: '0.00',
                        ack: true,
                        messageId,
                        token: Buffer.alloc(0)
                    })
                    fakeServer.send(emptyAck, 0, emptyAck.length, rinfo.port, rinfo.address)

                    // Step 2: separate OSCORE-protected CON response with the actual payload.
                    const responseInner = generate({
                        code: '2.05',
                        confirmable: true,
                        messageId: (messageId + 1) & 0xffff,
                        token,
                        payload: Buffer.from('hello-after-empty-ack')
                    })
                    const responseEncoded = await serverOscore.encode(responseInner)
                    setTimeout(() => {
                        if (finished) return
                        fakeServer.send(responseEncoded, 0, responseEncoded.length, rinfo.port, rinfo.address)
                    }, 30)
                }).catch((err) => {
                    finish(err as Error)
                })
            })

            fakeServer.bind(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('error', (err) => {
                    finish(new Error(`request errored unexpectedly: ${err.message}`))
                })
                req.on('response', (res) => {
                    try {
                        expect(res.payload.toString()).to.equal('hello-after-empty-ack')
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.end()
            })
        }).timeout(2000)

        it('should not error the request with an OSCORE-decode error when receiving a plain RST', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                serverOscore.decode(msg).then((decoded) => {
                    const outerReq = parse(msg)
                    const messageId = outerReq.messageId

                    // Plain RST (Code 0.00, reset=true). Per RFC 8613 §4.2 this is
                    // never OSCORE-protected.
                    const rst = generate({
                        code: '0.00',
                        reset: true,
                        messageId,
                        token: Buffer.alloc(0)
                    })
                    fakeServer.send(rst, 0, rst.length, rinfo.port, rinfo.address)
                }).catch((err) => {
                    finish(err as Error)
                })
            })

            fakeServer.bind(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('error', (err) => {
                    if (/OSCORE decode failed/.test(err.message)) {
                        finish(new Error(`RST was misreported as OSCORE decode failure: ${err.message}`))
                        return
                    }
                    // Any other error (e.g. a future explicit "request reset") is acceptable
                    // for this test — we only care that we are NOT emitting an OSCORE error.
                    finish()
                })
                req.on('response', (res) => {
                    // Equally acceptable: RST surfaced as a response with the reset flag set.
                    try {
                        const pkt: any = (res as any)._packet
                        expect(pkt?.reset === true || pkt?.code === '0.00').to.equal(true)
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.end()
            })
        }).timeout(2000)

        it('should complete a NON request with a NON OSCORE response (no ACK exchange)', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                serverOscore.decode(msg).then(async (decoded) => {
                    const innerReq = parse(decoded)
                    const outerReq = parse(msg)
                    expect(outerReq.confirmable).to.equal(false)

                    const responseInner = generate({
                        code: '2.05',
                        confirmable: false,
                        messageId: ((outerReq.messageId ?? 0) + 1) & 0xffff,
                        token: innerReq.token,
                        payload: Buffer.from('non-response')
                    })
                    const responseEncoded = await serverOscore.encode(responseInner)
                    fakeServer.send(responseEncoded, 0, responseEncoded.length, rinfo.port, rinfo.address)
                }).catch((err) => {
                    finish(err as Error)
                })
            })

            fakeServer.bind(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    confirmable: false,
                    agent
                })
                req.on('error', (err) => {
                    finish(new Error(`request errored unexpectedly: ${err.message}`))
                })
                req.on('response', (res) => {
                    try {
                        expect(res.payload.toString()).to.equal('non-response')
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.end()
            })
        }).timeout(2000)

        it('should emit error on the matching request when peer replies with plaintext (lost OSCORE context)', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                serverOscore.decode(msg).then((decoded) => {
                    const innerReq = parse(decoded)
                    const outerReq = parse(msg)

                    // Simulate "server lost its OSCORE context after reboot": reply
                    // with a plain CoAP 4.01, *not* OSCORE-protected. ef74dce was
                    // explicitly added to surface this case to the request.
                    const plainErr = generate({
                        code: '4.01',
                        ack: true,
                        messageId: outerReq.messageId,
                        token: innerReq.token,
                        payload: Buffer.from('Unauthorized')
                    })
                    fakeServer.send(plainErr, 0, plainErr.length, rinfo.port, rinfo.address)
                }).catch((err) => {
                    finish(err as Error)
                })
            })

            fakeServer.bind(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('error', (err) => {
                    try {
                        expect(err.message).to.match(/OSCORE|plaintext/i)
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.on('response', () => {
                    finish(new Error('plaintext 4.01 should not have been delivered as a response'))
                })
                req.end()
            })
        }).timeout(2000)

        it('should emit error on the matching request when an OSCORE-protected response has a corrupted MAC', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                serverOscore.decode(msg).then(async (decoded) => {
                    const innerReq = parse(decoded)
                    const outerReq = parse(msg)

                    // Build a real OSCORE response, then flip a byte in its
                    // ciphertext to break the MAC. Outer packet still carries
                    // the OSCORE option.
                    const responseInner = generate({
                        code: '2.05',
                        ack: true,
                        messageId: outerReq.messageId,
                        token: innerReq.token,
                        payload: Buffer.from('would-have-been-content')
                    })
                    const encrypted = await serverOscore.encode(responseInner)
                    const corrupted = Buffer.from(encrypted)
                    corrupted[corrupted.length - 1] ^= 0xff

                    fakeServer.send(corrupted, 0, corrupted.length, rinfo.port, rinfo.address)
                }).catch((err) => {
                    finish(err as Error)
                })
            })

            fakeServer.bind(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('error', (err) => {
                    try {
                        expect(err.message).to.match(/OSCORE/i)
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.on('response', () => {
                    finish(new Error('corrupted OSCORE response should not have been delivered'))
                })
                req.end()
            })
        }).timeout(2000)

        it('should silently drop unparseable garbage datagrams from an OSCORE peer', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            let errored = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                serverOscore.decode(msg).then(async (decoded) => {
                    const innerReq = parse(decoded)
                    const outerReq = parse(msg)

                    // 1. Send pure garbage — too short to be a valid CoAP header.
                    const garbage = Buffer.from([0xff, 0xff])
                    fakeServer.send(garbage, 0, garbage.length, rinfo.port, rinfo.address)

                    // 2. Then send a real OSCORE-protected response so the test
                    // can complete deterministically.
                    setTimeout(async () => {
                        if (finished) return
                        const responseInner = generate({
                            code: '2.05',
                            ack: true,
                            messageId: outerReq.messageId,
                            token: innerReq.token,
                            payload: Buffer.from('after-garbage')
                        })
                        const encoded = await serverOscore.encode(responseInner)
                        if (finished) return
                        fakeServer.send(encoded, 0, encoded.length, rinfo.port, rinfo.address)
                    }, 30)
                }).catch((err) => {
                    finish(err as Error)
                })
            })

            fakeServer.bind(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('error', (err) => {
                    errored = true
                    finish(new Error(`request errored unexpectedly: ${err.message}`))
                })
                req.on('response', (res) => {
                    if (errored) return
                    try {
                        expect(res.payload.toString()).to.equal('after-garbage')
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.end()
            })
        }).timeout(2000)

        it('should resolve a piggybacked OSCORE response (ACK with payload)', function (done) {
            const port = nextPort()
            const { client: clientOscore, server: serverOscore } = createOscorePair()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                serverOscore.decode(msg).then(async (decoded) => {
                    const innerReq = parse(decoded)
                    const outerReq = parse(msg)

                    // Piggyback: ACK *is* the response (same messageId, with payload).
                    const responseInner = generate({
                        code: '2.05',
                        ack: true,
                        messageId: outerReq.messageId,
                        token: innerReq.token,
                        payload: Buffer.from('piggybacked')
                    })
                    const encoded = await serverOscore.encode(responseInner)
                    fakeServer.send(encoded, 0, encoded.length, rinfo.port, rinfo.address)
                }).catch((err) => {
                    finish(err as Error)
                })
            })

            fakeServer.bind(port, () => {
                const agent = trackAgent(new Agent({ type: 'udp4' }))
                agent.addOscoreContext('127.0.0.1', port, clientOscore)

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('error', (err) => {
                    finish(new Error(`request errored unexpectedly: ${err.message}`))
                })
                req.on('response', (res) => {
                    try {
                        expect(res.payload.toString()).to.equal('piggybacked')
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.end()
            })
        }).timeout(2000)

        it('should still complete a plain CoAP request when the agent has no OSCORE context for the peer', function (done) {
            const port = nextPort()

            const fakeServer = dgram.createSocket('udp4')
            let finished = false
            const finish = (err?: Error): void => {
                if (finished) return
                finished = true
                try { fakeServer.close() } catch {}
                done(err)
            }

            fakeServer.on('message', (msg, rinfo) => {
                try {
                    const incoming = parse(msg)
                    const response = generate({
                        code: '2.05',
                        ack: true,
                        messageId: incoming.messageId,
                        token: incoming.token,
                        payload: Buffer.from('plain-ok')
                    })
                    fakeServer.send(response, 0, response.length, rinfo.port, rinfo.address)
                } catch (e) {
                    finish(e as Error)
                }
            })

            fakeServer.bind(port, () => {
                // Note: no addOscoreContext for this peer.
                const agent = trackAgent(new Agent({ type: 'udp4' }))

                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent
                })
                req.on('error', (err) => {
                    finish(new Error(`plain request errored unexpectedly: ${err.message}`))
                })
                req.on('response', (res) => {
                    try {
                        expect(res.payload.toString()).to.equal('plain-ok')
                        finish()
                    } catch (e) {
                        finish(e as Error)
                    }
                })
                req.end()
            })
        }).timeout(2000)
    })

    describe('oscoreOnly applied via addOscoreContext', function () {
        it('should reject plaintext after a context is added at runtime', function (done) {
            const port = nextPort()
            const { server: serverOscore } = createOscorePair()

            // Server is created with oscoreOnly:true but no contexts yet
            const server = trackServer(createServer({ oscoreOnly: true }))
            server.on('request', () => {
                done(new Error('Should not receive request — oscoreOnly should reject plaintext'))
            })

            server.listen(port, () => {
                server.addOscoreContext(serverOscore, Buffer.from('01', 'hex'))

                const plainAgent = trackAgent(new Agent({ type: 'udp4' }))
                const req = request({
                    hostname: '127.0.0.1',
                    port,
                    pathname: '/test',
                    agent: plainAgent
                })
                req.on('response', (res) => {
                    expect(res.code).to.equal('4.01')
                    done()
                })
                req.end()
            })
        })
    })

    describe('oscoreOnly agent drops inbound plaintext', function () {
        it('should silently drop unsolicited plaintext from peers with no context', function (done) {
            const agent = trackAgent(new Agent({ type: 'udp4', oscoreOnly: true }))
            const agentSock: any = (agent as any)._sock
            let errored = false
            agent.on('error', () => { errored = true })

            agentSock.bind(0, '127.0.0.1', () => {
                const agentPort = agentSock.address().port
                const sender = dgram.createSocket('udp4')
                const datagram = generate({
                    code: '2.05',
                    payload: Buffer.from('plain'),
                    messageId: 1,
                    token: Buffer.alloc(0)
                })
                sender.send(datagram, agentPort, '127.0.0.1', () => {
                    sender.close()
                    // Give the agent a tick to (not) emit anything
                    setTimeout(() => {
                        try {
                            expect(errored).to.equal(false)
                            done()
                        } catch (e) {
                            done(e as Error)
                        }
                    }, 100)
                })
            })
        }).timeout(2000)
    })

    describe('PIV validation', function () {
        it('should reject OSCORE options with reserved PIV length', function (done) {
            const port = nextPort()
            const { server: serverOscore } = createOscorePair()
            const contexts = new SecurityContextManager()
            contexts.addContext(serverOscore, Buffer.from('01', 'hex'))

            const server = trackServer(createServer({ oscoreContexts: contexts }))
            server.on('request', () => {
                done(new Error('Should not receive request — malformed PIV must be rejected'))
            })

            server.listen(port, () => {
                // Hand-craft a CoAP packet with an OSCORE option whose flag byte
                // encodes PIV length 6 (reserved per RFC 8613 §6.1).
                const oscoreValue = Buffer.concat([
                    Buffer.from([0x06]), // flags: pivLen=6
                    Buffer.alloc(6) // arbitrary PIV bytes
                ])
                const packet = generate({
                    code: '0.01',
                    confirmable: true,
                    messageId: 1,
                    token: Buffer.from([0xaa]),
                    options: [{ name: 'OSCORE' as any, value: oscoreValue }]
                })
                const client = dgram.createSocket('udp4')
                client.on('message', (msg) => {
                    try {
                        const reply = parse(msg)
                        expect(reply.code).to.equal('4.01')
                        client.close()
                        done()
                    } catch (e) {
                        client.close()
                        done(e as Error)
                    }
                })
                client.send(packet, port, '127.0.0.1')
            })
        }).timeout(2000)
    })

    describe('pending Echo nonce TTL', function () {
        it('should evict stored Echo nonces after the TTL elapses', function (done) {
            // Shortcut the TTL for the test by monkey-patching the static
            // (readonly is TS-only; the value is captured at store time).
            const originalTtl = (SecurityContextManager as any).PENDING_ECHO_TTL_MS
            ;(SecurityContextManager as any).PENDING_ECHO_TTL_MS = 50

            const contexts = new SecurityContextManager()
            const recipientId = Buffer.from('01', 'hex')
            const nonce = Buffer.from('cafebabe', 'hex')
            contexts.storePendingEcho(recipientId, undefined, nonce)
            expect(contexts.getPendingEcho(recipientId, undefined)).to.deep.equal(nonce)

            setTimeout(() => {
                try {
                    expect(contexts.getPendingEcho(recipientId, undefined)).to.equal(undefined)
                    done()
                } catch (e) {
                    done(e as Error)
                } finally {
                    ;(SecurityContextManager as any).PENDING_ECHO_TTL_MS = originalTtl
                }
            }, 150)
        }).timeout(2000)
    })
})
