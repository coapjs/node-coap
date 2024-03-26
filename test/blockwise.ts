/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { nextPort } from './common'
import { createServer, IncomingMessage, request } from '../index'
import { generate, Packet, parse } from 'coap-packet'
import { getOption, parseBlock2 } from '../lib/helpers'
import { generateBlockOption, parseBlockOption, exponentToByteSize, byteSizeToExponent } from '../lib/block'
import dgram from 'dgram'
import { expect } from 'chai'

describe('blockwise2', function () {
    let server
    let port
    let clientPort
    let client
    let bufferVal: number
    const payload = Buffer.alloc(1536)

    beforeEach(function (done) {
        bufferVal = 0
        port = nextPort()
        server = createServer()
        server.listen(port, done)
    })

    beforeEach(function (done) {
        clientPort = nextPort()
        client = dgram.createSocket('udp4')
        client.bind(clientPort, done)
    })

    afterEach(function () {
        server.close()
        client.close()
    })

    function send (message): void {
        client.send(message, 0, message.length, port, '127.0.0.1')
    }

    function nextBufferVal (): number {
        if (bufferVal > 255) {
            bufferVal = 0
        }
        return bufferVal++
    }

    function fillPayloadBuffer (buffer: Buffer): Buffer {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = nextBufferVal()
        }
        return buffer
    }

    it('should server not use blockwise in response when payload fit in one packet', function (done) {
        const payload = Buffer.alloc(100) // default max payload is 1024

        request({
            port
        })
            .on('response', (res) => {
                expect(res.code).to.eq('2.05')
                let blockwiseResponse = false
                for (const i in res.options) {
                    if (res.options[i].name === 'Block2') {
                        blockwiseResponse = true
                        break
                    }
                }
                expect(blockwiseResponse).to.eql(false)
                // expect(cache.get(res._packet.token.toString())).to.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    it('should use blockwise in response when payload bigger than max payload', function (done) {
        const payload = Buffer.alloc(1275) // 1275 produces a CoAP message (after headers) > 1280
        request({
            port
        })
            .on('response', (res) => {
                expect(res.code).to.eq('2.05')
                let blockwiseResponse = false
                for (const i in res.options) {
                    if (res.options[i].name === 'Block2') {
                        blockwiseResponse = true
                        break
                    }
                }
                expect(blockwiseResponse).to.eql(true)
                // expect(cache.get(res._packet.token.toString())).to.not.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    it('should blockwise response have etag', function (done) {
        request({
            port
        })
            .on('response', (res) => {
                expect(res.code).to.eq('2.05')
                expect(typeof res.headers.ETag).to.eql('string')
                // expect(cache.get(res._packet.token.toString())).to.not.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    it('should accept early negotation', function (done) {
        request({
            port
        })
            .setOption('Block2', Buffer.of(0x02))
            .on('response', (res) => {
                expect(res.code).to.eq('2.05')
                let block2
                for (const i in res.options) {
                    if (res.options[i].name === 'Block2') {
                        block2 = res.options[i].value
                        break
                    }
                }
                expect(block2 instanceof Buffer).to.eql(true)
                expect(block2[block2.length - 1] & 0x07).to.eql(2)
                // expect(cache.get(res._packet.token.toString())).to.not.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    it('should receive error when early negotation request block size higher than 1024', function (done) {
        request({
            port
        })
            .setOption('Block2', Buffer.of(0x07)) // request for block 0, with overload size of 2**(7+4)
            .on('response', (res) => {
                expect(res.code).to.eql('4.02')
                // expect(cache.get(res._packet.token.toString())).to.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    it('should receive error request for out of range block number', function (done) {
    // with a block size of 512 and a total payload of 1536 there will be 3 blocks
    // blocks are requested with a zero based index, i.e. indices 0, 1 and 2
    // block index 3 or higher is "out of range" and should cause an error response
        request({
            port
        })
            .setOption('Block2', Buffer.of(0x3D)) // request for block index 3
            .on('response', (res) => {
                expect(res.code).to.eql('4.02')
                // expect(cache.get(res._packet.token.toString())).to.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    it('should be able to receive part of message', function (done) {
        request({
            port
        })
            .setOption('Block2', Buffer.of(0x10)) // request from block 1, with size = 16
            .on('response', (res) => {
                expect(res.code).to.eq('2.05')
                expect(res.payload).to.eql(payload.slice(1 * 16, payload.length + 1))
                // expect(cache.get(res._packet.token.toString())).to.not.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    it('should receive full response payload', function (done) {
        const payload = Buffer.alloc(16 * 0xff + 1)
        request({
            port
        })
            .setOption('Block2', Buffer.of(0x0)) // early negotation with block size = 16, almost 10000/16 = 63 blocks
            .on('response', (res) => {
                expect(res.code).to.eq('2.05')
                expect(res.payload).to.eql(payload)
                // expect(cache.get(res._packet.token.toString())).to.not.be.undefined
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })

    function sendNextBlock2 (reqToken: Buffer, reqBlock2Num: number): void {
        const packet: Packet = {
            messageId: 1100 + reqBlock2Num,
            token: reqToken,
            options: [{
                name: 'Block2',
                value: Buffer.of(reqBlock2Num << 4)
            }]
        }
        send(generate(packet))
    }

    function parallelBlock2Test (done: Mocha.Done, checkNReq, checkBlock2Message, checkNormalReq): void {
        const payloadLength = 32 + 16 + 1
        const payloadReq1 = Buffer.alloc(payloadLength)
        const payloadReq2 = Buffer.alloc(payloadLength)
        const req1Token = Buffer.alloc(4)
        let req1Done = false
        let req2Done = false
        let req1Block2Num = 0
        const reqClient2 = request({
            port
        })

        fillPayloadBuffer(payloadReq1)
        fillPayloadBuffer(payloadReq2)
        fillPayloadBuffer(req1Token)

        let nreq = 1
        server.on('request', (req, res) => {
            // only two request to upper level, blockwise transfer completed from cache
            if (nreq === 1) {
                res.end(payloadReq1)
            } else if (nreq === 2) {
                res.end(payloadReq2)
            }

            checkNReq(nreq)

            nreq++
        })

        // Send first request, initiate blockwise transfer from server
        sendNextBlock2(req1Token, req1Block2Num)

        client.on('message', (msg, rinfo) => {
            checkBlock2Message(msg, payloadReq1, req1Block2Num, payloadLength)

            const expectMore = (req1Block2Num + 1) * 16 <= payloadLength
            if (expectMore) {
                // Request next block after 50 msec delay
                req1Block2Num++

                setTimeout(() => {
                    // Send next request, fetch next block of blockwise transfer from server
                    sendNextBlock2(req1Token, req1Block2Num)
                }, 50)
            } else {
                // No more blocks, transfer completed.
                req1Done = true
                if (req1Done && req2Done) {
                    setImmediate(done)
                }
            }
        })

        reqClient2.setOption('Block2', Buffer.of(0x10)) // request from block 1, with size = 16

        // Delay second request so that first request gets first packet
        setTimeout(() => {
            reqClient2.end()
        }, 1)

        reqClient2.on('response', (res) => {
            checkNormalReq(res, payloadReq2)

            req2Done = true
            if (req1Done && req2Done) {
                setImmediate(done)
            }
        })
    }

    function checkNothing (): void {
    }

    it('should two parallel block2 requests should result only two requests to upper level', function (done) {
        const checkNreq = (nreq: number): void => {
            expect(nreq).to.be.within(1, 2)
        }

        parallelBlock2Test(done, checkNreq, checkNothing, checkNothing)
    })

    it('should have code 2.05 for all block2 messages of successful parallel requests', function (done) {
        const checkBlock2Code = (msg: Buffer): void => {
            const res = parse(msg)

            // Have correct code?
            expect(res.code).to.eql('2.05')
        }

        const checkNormalRespCode = (res: Packet): void => {
            // Have correct code?
            expect(res.code).to.eql('2.05')
        }

        parallelBlock2Test(done, checkNothing, checkBlock2Code, checkNormalRespCode)
    })

    it('should have correct block2 option for parallel requests', function (done) {
        const checkBlock2Option = (msg: Buffer, payloadReq1, req1Block2Num: number, payloadLength: number): void => {
            const res = parse(msg)

            // Have block2 option?
            const block2Buff = getOption(res.options, 'Block2')
            if (block2Buff instanceof Buffer) {
                const block2 = parseBlock2(block2Buff)
                expect(block2).to.not.eql(null)

                const expectMore = (req1Block2Num + 1) * 16 <= payloadLength ? 1 : 0

                // Have correct num / moreBlocks fields?
                if (block2 != null) {
                    expect(block2.num).to.eql(req1Block2Num)
                    expect(block2.more).to.eql(expectMore)
                } else {
                    done(new Error('parseBlock2 returned an invalid Block option!'))
                }
            } else {
                done(new Error('getOption did not return a Buffer!'))
            }
        }

        parallelBlock2Test(done, checkNothing, checkBlock2Option, checkNothing)
    })

    it('should have correct payload in block2 messages for parallel requests', function (done) {
        const checkBlock2Payload = (msg, payloadReq1, req1Block2Num): void => {
            const res = parse(msg)

            // Have correct payload?
            expect(res.payload).to.eql(payloadReq1.slice(req1Block2Num * 16, req1Block2Num * 16 + 16))
        }

        const checkNormalRespPayload = (res, payloadReq2): void => {
            // Have correct payload?
            expect(res.payload).to.eql(payloadReq2.slice(1 * 16, payload.length + 1))
        }

        parallelBlock2Test(done, checkNothing, checkBlock2Payload, checkNormalRespPayload)
    })

    it('should support the Size2 option', function (done) {
        request({
            port
        })
            .setOption('Size2', 0)
            .on('response', (res: IncomingMessage) => {
                const size2 = res.headers.Size2
                expect(size2).to.eql(payload.length)
                setImmediate(done)
            })
            .end()
        server.on('request', (req, res) => {
            res.end(payload)
        })
    })
})

describe('blockwise1', () => {
    describe('Generate Block Options', () => {
        it('it should return buffer', (done) => {
            const payload = Buffer.of(0x01)
            const value = generateBlockOption(0, 0, 1)
            expect(payload).to.eql(value)
            setImmediate(done)
        })

        it('it should return buffer equal to 1,0,1', (done) => {
            const payload = Buffer.of(0x01, 0x00, 0x01)
            const value = generateBlockOption(4096, 0, 1)
            expect(payload).to.eql(value)
            setImmediate(done)
        })

        it('it should return buffer equal to 1,1', (done) => {
            const payload = Buffer.of(0x01, 0x01)
            const value = generateBlockOption(16, 0, 1)
            expect(payload).to.eql(value)
            setImmediate(done)
        })

        it('it should throw Invalid Parameters error', (done) => {
            expect(() => {
                generateBlockOption(0, 0, undefined)
            }).to.throw('Invalid parameters')
            setImmediate(done)
        })

        it('it should throw Sequence error', (done) => {
            expect(() => {
                generateBlockOption(1048576, 0, 0)
            }).to.throw('Sequence number out of range')
            setImmediate(done)
        })
    })

    describe('Parse Block Options', () => {
        it('it should return object', (done) => {
            const payload = Buffer.of(0x01)
            const response = {
                num: 0,
                more: 0,
                size: 1
            }
            const value = parseBlockOption(payload)
            expect(value).to.eql(response)
            setImmediate(done)
        })

        it('it should return object when length is equal to 2', (done) => {
            const payload = Buffer.of(0x01, 0x02)
            const response = {
                num: 16,
                more: 0,
                size: 2
            }
            const value = parseBlockOption(payload)
            expect(value).to.eql(response)
            setImmediate(done)
        })

        it('it should return object when length is equal to 3', (done) => {
            const payload = Buffer.of(0x01, 0x02, 0x03)
            const response = {
                num: 4128,
                more: 0,
                size: 3
            }
            const value = parseBlockOption(payload)
            expect(value).to.eql(response)
            setImmediate(done)
        })

        it('it should throw Invalid Block Option error', (done) => {
            const payload = Buffer.from([0x04, 0x01, 0x03, 0x04])
            expect(() => {
                parseBlockOption(payload)
            }).to.throw('Invalid block option buffer length. Must be 1, 2 or 3. It is 4')
            setImmediate(done)
        })
    })

    describe('Exponenent to Byte Size', () => {
        it('it should return value', (done) => {
            const response = 1024
            const payload = 6
            const value = exponentToByteSize(payload)
            expect(value).to.eql(response)
            setImmediate(done)
        })
    })

    describe('Byte Size to Exponenet', () => {
        it('it should return value', (done) => {
            const response = 1024
            const payload = 6
            const value = byteSizeToExponent(response)
            expect(value).to.eql(payload)
            setImmediate(done)
        })
    })
})
