/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { parameters } from '../index'
import RetrySend from '../lib/retry_send'
import { createParameters } from '../lib/parameters'
import OutgoingMessage from '../lib/outgoing_message'
import { SegmentedTransmission } from '../lib/segmentation'
import { expect } from 'chai'
import { generate } from 'coap-packet'
import sinon = require('sinon')

describe('RetrySend', function () {
    it('should use the default retry count', function () {
        const result = new RetrySend({}, 1234, 'localhost')
        expect(result._maxRetransmit).to.eql(parameters.maxRetransmit)
    })

    it('should use a custom retry count', function () {
        const result = new RetrySend({}, 1234, 'localhost', 55)
        expect(result._maxRetransmit).to.eql(55)
    })

    it('should use default retry count, using the retry_send factory method', function () {
        const result = new RetrySend({}, 1234, 'localhost')
        expect(result._maxRetransmit).to.eql(parameters.maxRetransmit)
    })

    it('should use a custom retry count, using the retry_send factory method', function () {
        const result = new RetrySend({}, 1234, 'localhost', 55)
        expect(result._maxRetransmit).to.eql(55)
    })

    describe('backoff reset across message boundaries', function () {
        // Math.random() = 0.5 gives an exact initial backoff:
        //   ackTimeout * (1 + (ackRandomFactor - 1) * 0.5) * 1000
        //   = 10 * (1 + 0.5 * 0.5) * 1000 = 12500ms
        const BASE_BACKOFF_MS = 12500
        let randomStub: sinon.SinonStub

        beforeEach(function () {
            randomStub = sinon.stub(Math, 'random').returns(0.5)
        })

        afterEach(function () {
            randomStub.restore()
        })

        function makeSender (): RetrySend {
            const params = createParameters({
                ackTimeout: 10,
                ackRandomFactor: 1.5,
                maxRetransmit: 4
            })
            const stubSocket: any = { send: () => {} }
            return new RetrySend(stubSocket, 1234, 'localhost', undefined, params)
        }

        function msg (messageId: number): Buffer {
            return generate({ messageId, token: Buffer.alloc(0), confirmable: true })
        }

        it('should restart _currentTime at the base when a new messageId is sent', function () {
            // Regression: a single RetrySend is reused across every block of a
            // segmented Block1 transfer. Without resetting _currentTime on a new
            // messageId, every stall permanently doubled the backoff for all
            // subsequent blocks — a one-way ratchet that pushed retransmits past
            // the peer's idle/session timeout.
            const sender = makeSender()
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS)

            sender.send(msg(1), false)
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS)

            // One stall → _bOff fires → _currentTime doubles to 25_000 ms.
            sender._bOff()
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS * 2)

            // ACK arrives — agent.ts calls sender.reset() — then the next block
            // is sent with a fresh messageId. _currentTime must restart at the
            // base, not stay at the doubled value.
            sender.reset()
            sender.send(msg(2), false)
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS)

            sender.reset()
        })

        it('should keep doubling _currentTime for retransmits of the SAME messageId, up to maxRetransmit', function () {
            // Don't-regress: the new-message reset must NOT bleed into the
            // same-message retransmission path. _bOff calls _send() without
            // changing _message, so messageId is unchanged and _currentTime
            // must remain doubled. After maxRetransmit doublings (4 here),
            // ++_sendAttemp exceeds maxRetransmit and no further _bOffTimer
            // is scheduled.
            const sender = makeSender()
            const ackTimer: any = { unref: () => {} }
            sender._sock.send = ((..._args: any[]) => ackTimer) as any

            sender.send(msg(1), false)
            expect(sender._sendAttemp).to.equal(1)
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS)

            // 4 same-message retransmits — _currentTime should hit 16× the base.
            sender._bOff()
            expect(sender._sendAttemp).to.equal(2)
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS * 2)

            sender._bOff()
            expect(sender._sendAttemp).to.equal(3)
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS * 4)

            sender._bOff()
            expect(sender._sendAttemp).to.equal(4)
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS * 8)

            sender._bOff()
            expect(sender._sendAttemp).to.equal(5) // exceeds maxRetransmit=4
            expect(sender._currentTime).to.equal(BASE_BACKOFF_MS * 16)

            // _sendAttemp(5) > maxRetransmit(4): the last _send() must not have
            // scheduled a new _bOffTimer. The previous timer reference is
            // whatever the prior schedule produced; verify the guard by
            // clearing the field and asserting it stays empty after another
            // _send() with the same messageId would (incorrectly) reschedule.
            const before = sender._bOffTimer
            sender._send() // mimic a stray _bOff fire path
            expect(sender._sendAttemp).to.equal(6)
            expect(sender._bOffTimer).to.equal(before) // unchanged: nothing rescheduled

            sender.reset()
        })

        it('should restart the backoff for the next Block1 chunk after a stall on the previous chunk', function () {
            // Integration: drive an actual SegmentedTransmission through a real
            // RetrySend, mirroring how lib/agent.ts manages the messageId across
            // blocks. Block 0 stalls once before its ACK; block 1 must then send
            // with the backoff reset to the base — not the doubled value.
            const params = createParameters({
                ackTimeout: 10,
                ackRandomFactor: 1.5,
                maxRetransmit: 4
            })
            const req = new OutgoingMessage({} as any, () => {})
            req._packet = {
                messageId: 1,
                token: Buffer.alloc(0),
                confirmable: true,
                ack: false,
                reset: false,
                options: []
            } as any
            req.sender = new RetrySend({ send: () => {} } as any, 1234, 'localhost', undefined, params)
            expect(req.sender._currentTime).to.equal(BASE_BACKOFF_MS)

            // 32-byte payload, 16-byte blocks (size exponent 0) → 2 blocks.
            const segment = new SegmentedTransmission(0, req, {
                messageId: 1,
                token: Buffer.alloc(0),
                confirmable: true,
                ack: false,
                reset: false,
                options: [],
                payload: Buffer.alloc(32, 0xab)
            } as any)

            // Send block 0.
            segment.sendNext()
            expect(req.sender._currentTime).to.equal(BASE_BACKOFF_MS)

            // Block 0 stalls once before the ACK arrives.
            req.sender._bOff()
            expect(req.sender._currentTime).to.equal(BASE_BACKOFF_MS * 2)

            // ACK arrives. Mirror agent.ts:332-348 — reset the sender, bump the
            // request's messageId, then receiveACK() drives sendNext() for the
            // next block.
            req.sender.reset()
            req._packet.messageId = 2
            segment.packet.messageId = 2
            segment.receiveACK({ size: 0, more: 1, num: 0 })

            // The new block was sent with a new messageId → the backoff must be
            // back at the base, not at the doubled value.
            expect(req.sender._currentTime).to.equal(BASE_BACKOFF_MS)
            expect(segment.blockState.num).to.equal(1)

            req.sender.reset()
        })
    })
})
