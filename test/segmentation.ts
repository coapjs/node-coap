/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { expect } from 'chai'
import { SegmentedTransmission } from '../lib/segmentation'
import OutgoingMessage from '../lib/outgoing_message'
import RetrySend from '../lib/retry_send'
import { createSocket } from 'dgram'

describe('Segmentation', () => {
    describe('Segmented Transmission', () => {
        it('Should throw invalid block size error', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            expect(() => {
                new SegmentedTransmission(-1, req, {}) // eslint-disable-line no-new
            }).to.throw('invalid block size -1')
            expect(() => {
                new SegmentedTransmission(7, req, {}) // eslint-disable-line no-new
            }).to.throw('invalid block size 7')
            setImmediate(done)
        })
    })

    describe('Set Block Size Exponent', () => {
        it('should set bytesize to value', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            const v = new SegmentedTransmission(1, req, { payload: Buffer.from([0x1]) })
            v.setBlockSizeExp(6)
            expect(v.blockState.size).to.eql(6)
            expect(v.byteSize).to.eql(1024)
            setImmediate(done)
        })
    })

    // Update Block State

    describe('Is Correct Acknowledgement', () => {
        it('Should return true', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            const v = new SegmentedTransmission(1, req, { payload: Buffer.from([0x1]) })
            const value = v.isCorrectACK({ num: 0, more: 0, size: 8 })
            expect(value).to.eql(true)
            setImmediate(done)
        })
        it('Should return false', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            const v = new SegmentedTransmission(1, req, { payload: Buffer.from([0x1]) })
            const value = v.isCorrectACK({ num: 1, more: 0, size: 8 })
            expect(value).to.eql(false)
            setImmediate(done)
        })
    })

    describe('Resend Previous Packet', () => {
        it('Should increment resend count', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            const v = new SegmentedTransmission(1, req, { payload: Buffer.from([0x1]) })
            v.resendCount = 2
            v.totalLength = 0
            v.currentByte = 1
            v.resendPreviousPacket()
            expect(v.resendCount).to.eql(3)
            setImmediate(done)
        })
        // should send next packet
        it('Should throw error', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            const v = new SegmentedTransmission(1, req, { payload: Buffer.from([0x1]) })
            v.resendCount = 6
            expect(() => {
                v.resendPreviousPacket()
            }).throw('Too many block re-transfers')
            setImmediate(done)
        })
    })

    describe('Recieve Acknowledgement', () => {
    // Should re-set block size exp
    // should send next packet
        it('Should set resend count to 0', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            req.sender = new RetrySend(createSocket('udp4'), 5683, 'localhost')
            const v = new SegmentedTransmission(1, req, { payload: Buffer.from([0x1]) })
            v.receiveACK({ size: 1, more: 0, num: 0 })
            v.totalLength = 0
            v.currentByte = 0
            expect(v.resendCount).to.eql(0)
            setImmediate(done)
        })
    })

    describe('Remaining', () => {
        it('Should return a value', (done) => {
            const req = new OutgoingMessage({}, (req, packet) => {})
            const v = new SegmentedTransmission(1, req, { payload: Buffer.from([0x1]) })
            v.totalLength = 0
            v.currentByte = 0
            expect(v.remaining()).to.eql(0)
            setImmediate(done)
        })
    })

    // Send Next
})
