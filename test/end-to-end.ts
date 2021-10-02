/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { nextPort } from './common'
import { Agent, Server, createServer, request } from '../index'
import { expect } from 'chai'
import { AddressInfo } from 'net'
import IncomingMessage from '../lib/incoming_message'

describe('end-to-end', function () {
    let server: Server
    let port: number

    beforeEach(function (done) {
        port = nextPort()
        server = createServer()
        server.listen(port, done)
    })

    process.on('uncaughtException', (err) => {
        console.log('Caught exception: ' + err.message)
    })

    it('should receive a request at a path with some query', function (done) {
        request(`coap://localhost:${port}/abcd/ef/gh/?foo=bar&beep=bop`).end()
        server.on('request', (req) => {
            expect(req.url).to.eql('/abcd/ef/gh?foo=bar&beep=bop')
            setImmediate(done)
        })
    })

    it('should return code 2.05 by default', function (done) {
        const req = request(`coap://localhost:${port}/abcd/ef/gh/?foo=bar&beep=bop`).end()
        req.on('response', (res) => {
            expect(res.code).to.eql('2.05')
            setImmediate(done)
        })

        server.on('request', (req, res) => {
            res.end('hello')
        })
    })

    it('should return code using res.code attribute', function (done) {
        request(`coap://localhost:${port}`)
            .on('response', (res) => {
                expect(res.code).to.eql('4.04')
                setImmediate(done)
            })
            .end()

        server.on('request', (req, res) => {
            res.code = '4.04'
            res.end('hello')
        })
    })

    it('should return code using res.statusCode attribute', function (done) {
        request(`coap://localhost:${port}`)
            .on('response', (res) => {
                expect(res.code).to.eql('4.04')
                setImmediate(done)
            })
            .end()

        server.on('request', (req, res) => {
            res.statusCode = '4.04'
            res.end('hello')
        })
    })

    it('should support observing', function (done) {
        const req = request({
            port: port,
            observe: true
        }).end()

        req.on('response', (res) => {
            res.once('data', (data) => {
                expect(data.toString()).to.eql('hello')
                res.once('data', (data) => {
                    expect(data.toString()).to.eql('world')
                    done()
                })
            })
        })

        server.on('request', (req, res) => {
            res.write('hello')
            res.end('world')
        })
    })

    it('should support a 4.04 observe request', function (done) {
        const req = request({
            port: port,
            observe: true
        }).end()

        req.on('response', (res) => {
            expect(res.code).to.eql('4.04')
            done()
        })

        server.on('request', (req, res) => {
            res.statusCode = '4.04'
            res.end()
        })
    })

    it('should support a 4.04 observe request and emit an end event in the response', function (done) {
        const req = request({
            port: port,
            observe: true
        }).end()

        req.on('response', (res: IncomingMessage) => {
            expect(res.code).to.eql('4.04')
            res.on('end', done)
            res.resume()
        })

        server.on('request', (req, res) => {
            res.statusCode = '4.04'
            res.end()
        })
    })

    it('should normalize strings using NFC', function (done) {
        request({
            port: port,
            // U+210E (plank constant) becomes to U+0068 (h) in “compatible” normalizations (should not happen)
            // U+0065 (e) U+0301 (combining acute accent) becomes U+00e9 (é) in “composed” normalizations (should happen)
            pathname: '/\u210e/\u0065\u0301'
        }).end()

        server.on('request', (req, res) => {
            expect(req.url).to.equal('/\u210e/\u00e9')
            done()
            res.end()
        })
    })

    describe('formats', function () {
        const formats = ['text/plain', 'application/link-format',
            'application/xml', 'application/octet-stream',
            'application/exi', 'application/json', 'application/cbor',
            'application/pkcs7-mime; smime-type=server-generated-key']

            ;['Accept', 'Content-Format'].forEach(function (option) {
            formats.forEach(function (format) {
                it('should pass the \'' + option + ': ' + format + '\' option to the server', function (done) {
                    const req = request(`coap://localhost:${port}`)
                    req.setOption(option, format)
                    req.end()

                    server.once('request', (req) => {
                        expect(req.options[0].name).to.eql(option)
                        expect(req.options[0].value).to.eql(format)
                        done()
                    })
                })

                it('should pass the \'' + option + ': ' + format + '\' option to the server if passed alongside the url', function (done) {
                    const req = {
                        port: port,
                        options: {}
                    }

                    req.options[option] = format

                    request(req).end()

                    server.once('request', (req) => {
                        expect(req.options[0].name).to.eql(option)
                        expect(req.options[0].value).to.eql(format)
                        done()
                    })
                })

                it('should pass the \'' + option + ': ' + format + '\' headers to the server if passed alongside the url', function (done) {
                    const req = {
                        port: port,
                        headers: {}
                    }

                    req.headers[option] = format

                    request(req).end()

                    server.once('request', (req) => {
                        expect(req.headers[option]).to.eql(format)
                        done()
                    })
                })

                it('should pass the \'' + option + ': ' + format + '\' header to the server', function (done) {
                    const req = request(`coap://localhost:${port}`)
                    req.setOption(option, format)
                    req.end()

                    server.once('request', (req) => {
                        expect(req.headers[option]).to.eql(format)
                        done()
                    })
                })
            })
        })

        formats.forEach(function (format) {
            it('should pass the \'Content-Format: ' + format + '\' option to the client', function (done) {
                const req = request(`coap://localhost:${port}`)
                req.end()

                server.once('request', (req, res) => {
                    res.setOption('Content-Format', format)
                    res.end()
                })

                req.on('response', (res) => {
                    expect(res.headers['Content-Format']).to.eql(format)
                    done()
                })
            })
        })
    })

    it('should allow encoding with \'Content-Format\'', function (done) {
        const req = request(`coap://localhost:${port}`)

        req.setOption('Content-Format', 'application/json; charset=utf8')
        req.end()

        server.once('request', (req) => {
            expect(req.options[0].name).to.equal('Content-Format')
            expect(req.options[0].value).to.equal('application/json')
            done()
        })
    })

    it('should allow option \'Max-Age\'', function (done) {
        const req = request(`coap://localhost:${port}`)

        req.setOption('Max-Age', 26763)
        req.end()

        server.once('request', (req) => {
            expect(req.options[0].name).to.equal('Max-Age')
            expect(req.options[0].value).to.equal(26763)
            done()
        })
    })

    it('should provide a writeHead() method', function (done) {
        const req = request(`coap://localhost:${port}`)
        req.end()
        req.on('response', (res) => {
            expect(res.headers['Content-Format']).to.equal('application/json')
            done()
        })

        server.once('request', (req, res) => {
            res.writeHead(200, { 'Content-Format': 'application/json' })
            res.write(JSON.stringify({}))
            res.end()
        })
    })

    it('should set and parse \'Location-Path\'', function (done) {
        const req = request({
            port: port,
            method: 'PUT'
        }).end()

        req.on('response', (res) => {
            expect(res.headers).to.have.property('Location-Path', '/hello')
            done()
        })

        server.on('request', (req, res) => {
            res.setOption('Location-Path', '/hello')
            res.end('hello')
        })
    })

    it('should set and parse \'Location-Query\'', function (done) {
        const req = request({
            port: port,
            method: 'PUT'
        }).end()

        req.on('response', (res) => {
            expect(res.headers).to.have.property('Location-Query', 'a=b')
            done()
        })

        server.on('request', (req, res) => {
            res.setOption('Location-Query', 'a=b')
            res.end('hello')
        })
    })

    it('should support multiple observe to the same destination', function (done) {
        const req1 = request({
            port: port,
            method: 'GET',
            observe: true,
            pathname: '/a'
        }).end()
        const req2 = request({
            port: port,
            method: 'GET',
            observe: true,
            pathname: '/b'
        }).end()
        let completed = 2

        server.on('request', (req, res) => {
            res.write('hello')
            setTimeout(() => {
                res.end('world')
            }, 10)
        })

        ;[req1, req2].forEach((req) => {
            let local = 2
            req.on('response', (res) => {
                res.on('data', (data) => {
                    if (--local === 0) {
                        --completed
                    }

                    if (completed === 0) {
                        done()
                    }
                })
            })
        })
    })

    it('should reuse the same socket for two concurrent requests', function (done) {
        request({
            port: port,
            method: 'GET',
            pathname: '/a'
        }).end()
        request({
            port: port,
            method: 'GET',
            pathname: '/b'
        }).end()
        let first: AddressInfo

        server.on('request', (req, res) => {
            res.end('hello')
            if (first == null) {
                first = req.rsinfo
            } else {
                expect(req.rsinfo).to.eql(first)
                done()
            }
        })
    })

    it('should create two sockets for two subsequent requests', function (done) {
        const agent = new Agent()
        const req1 = request({
            port: port,
            method: 'GET',
            pathname: '/a',
            agent: agent
        }).end()
        let first: AddressInfo

        server.on('request', (req, res) => {
            res.end('hello')
            if (first == null) {
                first = req.rsinfo
            } else {
                expect(req.rsinfo).not.to.eql(first)
                done()
            }
        })

        req1.on('response', () => {
            setImmediate(() => {
                request({
                    port: port,
                    method: 'GET',
                    pathname: '/b'
                }).end()
            })
        })
    })

    it('should use the port binded in the agent', function (done) {
        const agent = new Agent({ port: 3636 })
        request({
            port: port,
            method: 'GET',
            pathname: 'a',
            agent: agent
        }).end()

        server.on('request', (req, res) => {
            res.end('hello')
            expect(req.rsinfo.port).eql(3636)
            done()
        })
    })

    it('should ignore ignored options', function (done) {
        const req = request(`coap://localhost:${port}`)
        req.setOption('Cache-Control', 'private')
        req.end()

        server.on('request', (req) => {
            expect(req.headers).not.to.have.property('Cache-Control')
            done()
        })
    })
})
