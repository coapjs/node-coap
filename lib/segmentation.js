'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const generate = require('coap-packet').generate
const generateBlockOption = require('./block').generateBlockOption
const exponentToByteSize = require('./block').exponentToByteSize

class SegmentedTransmission {
    constructor (blockSize, req, packet) {
        if (blockSize < 0 || blockSize > 6) {
            throw new Error(`invalid block size ${blockSize}`)
        }

        this.blockState = {
            num: 0,
            more: 0,
            size: 0
        }

        this.setBlockSizeExp(blockSize)

        this.totalLength = packet.payload.length
        this.currentByte = 0
        this.lastByte = 0

        this.req = req
        this.payload = packet.payload || Buffer.alloc(0)
        this.packet = packet

        this.packet.payload = undefined
        this.resendCount = 0
    }

    setBlockSizeExp (blockSizeExp) {
        this.blockState.size = blockSizeExp
        this.byteSize = exponentToByteSize(blockSizeExp)
    }

    updateBlockState () {
        this.blockState.num = this.currentByte / this.byteSize
        this.blockState.more = ((this.currentByte + this.byteSize) < this.totalLength) ? 1 : 0

        this.req.setOption('Block1', generateBlockOption(this.blockState))
    }

    isCorrectACK (retBlockState) {
        return retBlockState.num === this.blockState.num// && packet.code == "2.31"
    }

    resendPreviousPacket () {
        if (this.resendCount < 5) {
            this.currentByte = this.lastByte
            if (this.remaining() > 0) {
                this.sendNext()
            }
            this.resendCount++
        } else {
            throw new Error('Too many block re-transfers')
        }
    }

    /**
     *
     * @param {Object} retBlockState The received block state from the other end
     * @returns {Boolean} Returns true if the ACK was for the correct block.
     */
    receiveACK (retBlockState) {
        if (this.blockState.size !== retBlockState.size) {
            this.setBlockSizeExp(retBlockState.size)
        }

        if (this.remaining() > 0) {
            this.sendNext()
        }
        this.resendCount = 0
    }

    remaining () {
        return this.totalLength - this.currentByte
    }

    sendNext () {
        const blockLength = Math.min(this.totalLength - this.currentByte, this.byteSize)
        const subBuffer = this.payload.slice(this.currentByte, this.currentByte + blockLength)
        this.updateBlockState()

        this.packet.ack = false
        this.packet.reset = false
        this.packet.confirmable = true

        this.packet.payload = subBuffer

        this.lastByte = this.currentByte
        this.currentByte += blockLength
        let buf

        try {
            buf = generate(this.packet)
        } catch (err) {
            this.req.sender.reset()
            this.req.emit('error', err)
            return
        }
        this.req.sender.send(buf, !this.packet.confirmable)
    }
}

module.exports.SegmentedTransmission = SegmentedTransmission
