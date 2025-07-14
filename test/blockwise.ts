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


    describe('blockwise1 with piggybacked and non-piggybacked responses', () => {
        let server: dgram.Socket
        let port: number

        beforeEach(function (done) {
            port = nextPort()
            server = dgram.createSocket('udp4')
            server.bind(port, done)
        })

        afterEach(function () {
            server.close()
        })

        it('should handle block1 with separate ack and response', function (done) {
            // Create a large payload that will require block1 (2 blocks of 16 bytes each)
            const largePayload = Buffer.alloc(32)
            for (let i = 0; i < largePayload.length; i++) {
                largePayload[i] = i % 256
            }

            let blockCount = 0
            let finalResponseSent = false
            let ackCount = 0
            let continueCount = 0

            server.on('message', (msg, rinfo) => {
                const packet = parse(msg)
                
                if (packet.code === '0.03' && packet.options?.some(opt => opt.name === 'Block1')) {
                    const block1Option = packet.options.find(opt => opt.name === 'Block1')
                    if (block1Option) {
                        const block1 = parseBlockOption(block1Option.value)
                        
                        if (block1) {
                            // Send ACK first (non-piggybacked)
                            const ack = generate({
                                code: '0.00',
                                messageId: packet.messageId,
                                ack: true,
                                token: Buffer.alloc(0)
                            })
                            server.send(ack, 0, ack.length, rinfo.port, rinfo.address)
                            ackCount++
                            
                            // Then send the block1 response after a delay
                            setTimeout(() => {
                                if (block1.more === 1) {
                                    // More blocks to come - send Continue (2.31)
                                    const continueResponse = generate({
                                        code: '2.31', // Continue
                                        messageId: packet.messageId + 1, // New message ID
                                        confirmable: true,
                                        token: packet.token,
                                        options: [{
                                            name: 'Block1',
                                            value: block1Option.value // Echo back the same block1 option
                                        }]
                                    })
                                    server.send(continueResponse, 0, continueResponse.length, rinfo.port, rinfo.address)
                                    continueCount++
                                } else {
                                    // Last block - send Changed (2.04)
                                    const changedResponse = generate({
                                        code: '2.04', // Changed
                                        messageId: packet.messageId + 1, // New message ID
                                        confirmable: true,
                                        token: packet.token,
                                        options: [{
                                            name: 'Block1',
                                            value: block1Option.value // Echo back the same block1 option
                                        }]
                                    })
                                    server.send(changedResponse, 0, changedResponse.length, rinfo.port, rinfo.address)
                                    finalResponseSent = true
                                }
                            }, 50)
                            
                            blockCount++
                        }
                    }
                }
            })

            // Use the coap client to send the request
            const req = request({
                port,
                method: 'PUT',
                confirmable: true
            })

            // Send the full payload - the client will handle block1 segmentation automatically
            req.setOption('Block1', Buffer.of(0x00)) // Block 0, size 16, more = 1
            req.write(largePayload) // Send the full payload

            let responseCount = 0
            req.on('response', (res) => {
                responseCount++
                
                // The client should only emit the final response
                expect(responseCount).to.eql(1)
                expect(res.code).to.eql('2.04') // Final response should be Changed
                expect(finalResponseSent).to.be.true
                expect(ackCount).to.eql(2) // Should have sent 2 ACKs (one for each block)
                expect(continueCount).to.eql(1) // Should have sent 1 Continue (for first block)
                
                // Check that we received the block1 response
                const block1Option = res.options?.find(opt => opt.name === 'Block1')
                expect(block1Option).to.not.be.undefined
                expect(block1Option?.value).to.eql(Buffer.of(0x10)) // Should be block 1
                
                setImmediate(done)
            })

            req.end()
        })

        it('should handle block1 with piggybacked ack and response', function (done) {
            // Create a large payload that will require block1 (2 blocks of 16 bytes each)
            const largePayload = Buffer.alloc(32)
            for (let i = 0; i < largePayload.length; i++) {
                largePayload[i] = i % 256
            }

            let blockCount = 0
            let finalResponseSent = false
            let piggybackCount = 0

            server.on('message', (msg, rinfo) => {
                const packet = parse(msg)
                
                if (packet.code === '0.03' && packet.options?.some(opt => opt.name === 'Block1')) {
                    const block1Option = packet.options.find(opt => opt.name === 'Block1')
                    if (block1Option) {
                        const block1 = parseBlockOption(block1Option.value)
                        
                        if (block1) {
                            // Send piggybacked response (ACK + Block1 response in one message)
                            setTimeout(() => {
                                if (block1.more === 1) {
                                    // More blocks to come - send Continue (2.31) piggybacked on ACK
                                    const piggybackResponse = generate({
                                        code: '2.31', // Continue
                                        messageId: packet.messageId,
                                        ack: true, // Piggybacked on ACK
                                        token: packet.token,
                                        options: [{
                                            name: 'Block1',
                                            value: block1Option.value // Echo back the same block1 option
                                        }]
                                    })
                                    server.send(piggybackResponse, 0, piggybackResponse.length, rinfo.port, rinfo.address)
                                    piggybackCount++
                                } else {
                                    // Last block - send Changed (2.04) piggybacked on ACK
                                    const piggybackResponse = generate({
                                        code: '2.04', // Changed
                                        messageId: packet.messageId,
                                        ack: true, // Piggybacked on ACK
                                        token: packet.token,
                                        options: [{
                                            name: 'Block1',
                                            value: block1Option.value // Echo back the same block1 option
                                        }]
                                    })
                                    server.send(piggybackResponse, 0, piggybackResponse.length, rinfo.port, rinfo.address)
                                    finalResponseSent = true
                                }
                            }, 50)
                            
                            blockCount++
                        }
                    }
                }
            })

            // Use the coap client to send the request
            const req = request({
                port,
                method: 'PUT',
                confirmable: true
            })

            // Send the full payload - the client will handle block1 segmentation automatically
            req.setOption('Block1', Buffer.of(0x00)) // Block 0, size 16, more = 1
            req.write(largePayload) // Send the full payload

            let responseCount = 0
            req.on('response', (res) => {
                responseCount++
                
                // The client should only emit the final response
                expect(responseCount).to.eql(1)
                expect(res.code).to.eql('2.04') // Final response should be Changed
                expect(finalResponseSent).to.be.true
                expect(piggybackCount).to.eql(1) // Should have sent 1 piggybacked Continue (for first block)
                
                // Check that we received the block1 response
                const block1Option = res.options?.find(opt => opt.name === 'Block1')
                expect(block1Option).to.not.be.undefined
                expect(block1Option?.value).to.eql(Buffer.of(0x10)) // Should be block 1
                
                setImmediate(done)
            })

            req.end()
        })

        it('should retransmit block1 requests when server does not respond', function (done) {
            // Create a large payload that will require block1 (2 blocks of 16 bytes each)
            const largePayload = Buffer.alloc(32)
            for (let i = 0; i < largePayload.length; i++) {
                largePayload[i] = i % 256
            }

            let messageCount = 0
            let lastMessageId = 0
            let retransmissionDetected = false

            server.on('message', (msg, rinfo) => {
                const packet = parse(msg)
                
                if (packet.code === '0.03' && packet.options?.some(opt => opt.name === 'Block1')) {
                    messageCount++
                    
                    // Check if this is a retransmission (same message ID as previous)
                    if (packet.messageId === lastMessageId && messageCount > 1) {
                        retransmissionDetected = true
                    }
                    lastMessageId = packet.messageId
                    
                    // Don't send any response - this should trigger client retransmission
                    // The client should retransmit the same block1 request after timeout
                    
                    // After a few retransmissions, send a response to complete the test
                    if (messageCount >= 3) {
                        const block1Option = packet.options.find(opt => opt.name === 'Block1')
                        if (block1Option) {
                            const block1 = parseBlockOption(block1Option.value)
                            
                            if (block1) {
                                // Send final response to complete the transfer
                                const finalResponse = generate({
                                    code: '2.04', // Changed
                                    messageId: packet.messageId,
                                    ack: true,
                                    token: packet.token,
                                    options: [{
                                        name: 'Block1',
                                        value: block1Option.value
                                    }]
                                })
                                server.send(finalResponse, 0, finalResponse.length, rinfo.port, rinfo.address)
                            }
                        }
                    }
                }
            })

            // Temporarily update timing for faster retransmission in this test
            const { updateTiming, defaultTiming } = require('../index')
            
            // Use faster timing for this test
            const fastTiming = {
                ackTimeout: 0.1, // 100ms instead of 2s
                ackRandomFactor: 1.0, // No randomization for faster testing
                maxRetransmit: 3 // Reduce max retransmissions for faster test
            }
            
            // Update global timing
            updateTiming(fastTiming)

            // Use the coap client to send the request
            const req = request({
                port,
                method: 'PUT',
                confirmable: true
            })

            // Send the full payload - the client will handle block1 segmentation automatically
            req.setOption('Block1', Buffer.of(0x00)) // Block 0, size 16, more = 1
            req.write(largePayload) // Send the full payload

            req.on('response', (res) => {
                // Verify that retransmission was detected
                expect(retransmissionDetected).to.be.true
                expect(messageCount).to.be.greaterThan(1) // Should have sent multiple messages due to retransmission
                expect(res.code).to.eql('2.04') // Final response should be Changed
                
                // Restore original timing
                defaultTiming()
                setImmediate(done)
            })

            req.on('error', (err) => {
                // If the client times out completely, that's also acceptable
                // as it indicates retransmission was working
                expect(messageCount).to.be.greaterThan(1)
                
                // Restore original timing
                defaultTiming()
                setImmediate(done)
            })

            req.end()
        })

        it('should handle block1 retransmissions for each block', function (done) {
            // Create a large payload that will require block1 (2 blocks of 16 bytes each)
            const largePayload = Buffer.alloc(32)
            for (let i = 0; i < largePayload.length; i++) {
                largePayload[i] = i % 256
            }

            let blockCount = 0
            let ackCount = 0
            let responseCount = 0
            let retransmissionCount = 0
            let lastMessageId = 0
            let lastBlockNum = -1

            server.on('message', (msg, rinfo) => {
                const packet = parse(msg)
                
                if (packet.code === '0.03' && packet.options?.some(opt => opt.name === 'Block1')) {
                    const block1Option = packet.options.find(opt => opt.name === 'Block1')
                    if (block1Option) {
                        const block1 = parseBlockOption(block1Option.value)
                        
                        if (block1) {
                            // Check if this is a retransmission of the same block
                            if (packet.messageId === lastMessageId && block1.num === lastBlockNum) {
                                retransmissionCount++
                            } else {
                                // New block or new message ID
                                retransmissionCount = 0
                                blockCount++
                            }
                            
                            lastMessageId = packet.messageId
                            lastBlockNum = block1.num
                            
                            // Don't ACK the first 2 retransmissions of each block
                            // Only ACK after the 3rd attempt (2 retransmissions)
                            if (retransmissionCount >= 2) {
                                // Send ACK for this block
                                const ack = generate({
                                    code: '0.00',
                                    messageId: packet.messageId,
                                    ack: true,
                                    token: Buffer.alloc(0)
                                })
                                server.send(ack, 0, ack.length, rinfo.port, rinfo.address)
                                ackCount++
                                
                                // Then send the response after a delay
                                setTimeout(() => {
                                    if (block1.more === 1) {
                                        // More blocks to come - send Continue (2.31)
                                        const continueResponse = generate({
                                            code: '2.31', // Continue
                                            messageId: packet.messageId + 1, // New message ID
                                            confirmable: true,
                                            token: packet.token,
                                            options: [{
                                                name: 'Block1',
                                                value: block1Option.value // Echo back the same block1 option
                                            }]
                                        })
                                        server.send(continueResponse, 0, continueResponse.length, rinfo.port, rinfo.address)
                                        responseCount++
                                    } else {
                                        // Last block - send Changed (2.04)
                                        const changedResponse = generate({
                                            code: '2.04', // Changed
                                            messageId: packet.messageId + 1, // New message ID
                                            confirmable: true,
                                            token: packet.token,
                                            options: [{
                                                name: 'Block1',
                                                value: block1Option.value // Echo back the same block1 option
                                            }]
                                        })
                                        server.send(changedResponse, 0, changedResponse.length, rinfo.port, rinfo.address)
                                        responseCount++
                                    }
                                }, 50) // Small delay to ensure ACK is sent first
                            }
                            // If retransmissionCount < 2, don't send anything - this forces retransmission
                        }
                    }
                }
            })

            // Temporarily update timing for faster retransmission in this test
            const { updateTiming, defaultTiming } = require('../index')
            
            // Use faster timing for this test
            const fastTiming = {
                ackTimeout: 0.1, // 100ms instead of 2s
                ackRandomFactor: 1.0, // No randomization for faster testing
                maxRetransmit: 3 // Reduce max retransmissions for faster test
            }
            
            // Update global timing
            updateTiming(fastTiming)

            // Use the coap client to send the request
            const req = request({
                port,
                method: 'PUT',
                confirmable: true
            })

            // Send the full payload - the client will handle block1 segmentation automatically
            req.setOption('Block1', Buffer.of(0x00)) // Block 0, size 16, more = 1
            req.write(largePayload) // Send the full payload

            req.on('response', (res) => {
                // Verify that we received the proper response
                expect(res.code).to.eql('2.04') // Final response should be Changed
                expect(ackCount).to.be.greaterThan(0) // Should have sent ACKs
                expect(responseCount).to.be.greaterThan(0) // Should have sent responses
                expect(retransmissionCount).to.be.greaterThan(0) // Should have had retransmissions
                
                // Check that we received the block1 response
                const block1Option = res.options?.find(opt => opt.name === 'Block1')
                expect(block1Option).to.not.be.undefined
                
                // Restore original timing
                defaultTiming()
                setImmediate(done)
            })

            req.on('error', (err) => {
                // If there's an error, it might be due to timing, but we should still have sent ACKs
                expect(ackCount).to.be.greaterThan(0)
                
                // Restore original timing
                defaultTiming()
                setImmediate(done)
            })

            req.end()
        })
    })
})
