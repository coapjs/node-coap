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
                // Server rejects unknown KID with plaintext 4.01
                // Client drops it (correct OSCORE behavior — no plaintext accepted from secured peer)
                // Give the server time to process and verify it didn't emit 'request'
                req.end()

                setTimeout(() => {
                    // If we got here, server correctly rejected without emitting 'request'
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
            contexts.onSsnChange((recipientId, idContext, ssn) => {
                ssnFired = true
                expect(recipientId.toString('hex')).to.equal('01')
                expect(typeof ssn).to.equal('bigint')
            })

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
                req.on('response', () => {
                    setTimeout(() => {
                        expect(ssnFired).to.equal(true)
                        done()
                    }, 50)
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
})
