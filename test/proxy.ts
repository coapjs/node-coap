/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { nextPort } from './common'
import { expect } from 'chai'
import { parse, generate } from 'coap-packet'
import { request, createServer } from '../index'
import type { Server } from '../index'
import dgram from 'dgram'
import tk from 'timekeeper'
import sinon from 'sinon'
import type OutgoingMessage from '../lib/outgoing_message'
import type IncomingMessage from '../lib/incoming_message'

describe('proxy', function () {
    let server: Server,
        client,
        target,
        clock
    let port: number
    let clientPort: number
    let targetPort: number

    beforeEach(function (done) {
        clock = sinon.useFakeTimers()
        port = nextPort()
        server = createServer({
            proxy: true
        })
        server.listen(port, () => {
            clientPort = nextPort()
            client = dgram.createSocket('udp4')
            targetPort = nextPort()
            target = createServer()

            client.bind(clientPort, () => {
                target.listen(targetPort, done)
            })
        })
    })

    afterEach(function (done) {
        function closeSocket (socketToClose, callback): void {
            try {
                socketToClose.on('close', callback)
                socketToClose.close()
            } catch (ignored) {
                callback()
            }
        }

        clock.restore()

        closeSocket(client, () => {
            closeSocket(server, () => {
                closeSocket(target, () => {
                    tk.reset()
                    done()
                })
            })
        })
    })

    function send (message): void {
        client.send(message, 0, message.length, port, '127.0.0.1')
    }

    it('should resend the message to its destination specified in the Proxy-Uri option', function (done) {
        send(generate({
            options: [{
                name: 'Proxy-Uri',
                value: Buffer.from(`coap://localhost:${targetPort}/the/path`)
            }]
        }))

        target.on('request', (req, res) => {
            done()
        })
    })

    it('should resend notifications in an observe connection', function (done) {
        let counter = 0

        clock.restore()

        function sendObservation (): OutgoingMessage {
            target.on('request', (req, res) => {
                res.setOption('Observe', 1)
                res.write('Pruebas')

                setTimeout(() => {
                    res.write('Pruebas2')
                    res.end('Last msg')
                }, 500)
            })

            return request({
                port,
                observe: true,
                proxyUri: `coap://localhost:${targetPort}/the/path`
            }).end()
        }

        const req = sendObservation()

        req.on('response', (res) => {
            res.on('data', (msg) => {
                if (counter === 2) {
                    done()
                } else {
                    counter++
                }

                clock.tick(600)
            })
        })
    })

    it('should not process the request as a standard server request', function (done) {
        target.on('request', (req, res) => {
            done()
        })

        server.on('request', (req, res) => {
        })

        send(generate({
            options: [{
                name: 'Proxy-Uri',
                value: Buffer.from(`coap://localhost:${targetPort}/the/path`)
            }]
        }))
    })

    it('should return the target response to the original requestor', function (done) {
        send(generate({
            options: [{
                name: 'Proxy-Uri',
                value: Buffer.from(`coap://localhost:${targetPort}/the/path`)
            }]
        }))

        target.on('request', (req, res) => {
            res.end('The response')
        })

        client.on('message', (msg) => {
            const packet = parse(msg)
            expect(packet.payload.toString()).to.eql('The response')
            done()
        })
    })

    describe('with a proxied request initiated by an agent', function () {
        it('should forward the request to the URI specified in proxyUri ', function (done) {
            const req = request({
                host: 'localhost',
                port,
                proxyUri: `coap://localhost:${targetPort}`,
                query: 'a=b'
            })

            target.on('request', (req, res) => {
                done()
            })

            req.end()
        })
        it('should forward the response to the request back to the agent', function (done) {
            const req = request({
                host: 'localhost',
                port,
                proxyUri: `coap://localhost:${targetPort}`,
                query: 'a=b'
            })

            target.on('request', (req, res) => {
                res.end('This is the response')
            })

            req.on('response', (res) => {
                expect(res.payload.toString()).to.eql('This is the response')
                done()
            })

            req.end()
        })
    })

    describe('with a proxied request with a wrong destination', function () {
        it('should return an error to the caller', function (done) {
            this.timeout(20000)
            const req = request({
                host: 'localhost',
                port,
                proxyUri: 'coap://unexistentCOAPUri:7968',
                query: 'a=b'
            })

            target.on('request', (req, res) => {
                console.log('should not get here')
            })

            server.on('error', (req, res) => {})

            req
                .on('response', (res) => {
                    try {
                        expect(res.code).to.eql('5.00')
                        expect(res.payload.toString()).to.match(/ENOTFOUND|EAI_AGAIN/)
                    } catch (err) {
                        done(err)
                        return
                    }
                    done()
                })
                .end()
        })
    })

    describe('with a non-proxied request', function () {
        it('should call the handler as usual', function (done) {
            const req = request({
                host: 'localhost',
                port,
                query: 'a=b'
            })

            target.on('request', (req, res) => {
                console.log('should not get here')
            })

            server.on('request', (req, res) => {
                res.end('Standard response')
            })

            req
                .on('response', (res) => {
                    expect(res.payload.toString()).to.contain('Standard response')
                    done()
                })
                .end()
        })
    })

    describe('with an observe request to a proxied server', function () {
        it('should call the handler as usual', function (done) {
            const req = request({
                host: 'localhost',
                port,
                observe: true,
                query: 'a=b'
            })

            target.on('request', (req, res) => {
                console.log('should not get here')
            })

            server.on('request', (req, res) => {
                res.end('Standard response')
            })

            req
                .on('response', (res) => {
                    expect(res.payload.toString()).to.contain('Standard response')
                    done()
                })
                .end()
        })
        it('should allow all the responses', function (done) {
            const req = request({
                host: 'localhost',
                port,
                observe: true,
                query: 'a=b'
            })
            let count = 0

            target.on('request', (req: IncomingMessage, res) => {
                console.log('should not get here')
            })

            server.on('request', (req, res: OutgoingMessage) => {
                res.setOption('Observe', 1)
                res.write('This is the first response')

                setTimeout(() => {
                    res.setOption('Observe', 1)
                    res.write('And this is the second')
                }, 200)
            })

            req
                .on('response', (res) => {
                    res.on('data', (chunk) => {
                        count++

                        if (count === 1) {
                            expect(chunk.toString('utf8')).to.contain('This is the first response')
                            clock.tick(300)
                        } else if (count === 2) {
                            expect(chunk.toString('utf8')).to.contain('And this is the second')
                            done()
                        }
                    })
                })
                .end()
        })
    })
})
