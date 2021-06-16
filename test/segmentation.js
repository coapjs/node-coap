/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const segment = require('../lib/segmentation')

describe('Segmentation', () => {
  describe('Segmented Transmission', () => {
    it('Should throw invalid block size error', (done) => {
      expect(() => {
        segment.SegmentedTransmission(-1, 0, 0)
      }).to.throw('invalid block size -1')
      expect(() => {
        segment.SegmentedTransmission(7, 0, 0)
      }).to.throw('invalid block size 7')
      setImmediate(done)
    })
  })

  describe('Set Block Size Exponent', () => {
    it('should set bytesize to value', (done) => {
      const v = new segment.SegmentedTransmission(1, 1, { payload: [1] })
      v.setBlockSizeExp(6)
      expect(v.blockState.blockSize).to.eql(6)
      expect(v.byteSize).to.eql(1024)
      setImmediate(done)
    })
  })

  // Update Block State

  describe('Is Correct Acknowledgement', () => {
    it('Should return true', (done) => {
      const v = new segment.SegmentedTransmission(1, 1, { payload: [1] })
      const value = v.isCorrectACK(1, { sequenceNumber: 0 })
      expect(value).to.eql(true)
      setImmediate(done)
    })
    it('Should return false', (done) => {
      const v = new segment.SegmentedTransmission(1, 1, { payload: [1] })
      const value = v.isCorrectACK(1, { sequenceNumber: 1 })
      expect(value).to.eql(false)
      setImmediate(done)
    })
  })

  describe('Resend Previous Packet', () => {
    it('Should increment resend count', (done) => {
      const v = new segment.SegmentedTransmission(1, 1, { payload: [1] })
      v.resendCount = 2
      v.totalLength = 0
      v.currentByte = 1
      v.resendPreviousPacket()
      expect(v.resendCount).to.eql(3)
      setImmediate(done)
    })
    // should send next packet
    it('Should throw error', (done) => {
      const v = new segment.SegmentedTransmission(1, 1, { payload: [1] })
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
      const req = {
        setOption: () => {},
        sender: {
          reset: () => {}
        },
        emit: () => {}

      }
      const v = new segment.SegmentedTransmission(1, req, { payload: [1] })
      v.receiveACK(1, { blockSize: 1 })
      v.totalLength = 0
      v.currentByte = 0
      expect(v.resendCount).to.eql(0)
      setImmediate(done)
    })
  })

  describe('Remaining', () => {
    it('Should return a value', (done) => {
      const v = new segment.SegmentedTransmission(1, 1, { payload: [1] })
      v.totalLength = 0
      v.currentByte = 0
      expect(v.remaining()).to.eql(0)
      setImmediate(done)
    })
  })

  // Send Next
})
