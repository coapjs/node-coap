/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { Block } from '../models/models'
import OutgoingMessage from './outgoing_message'
import { Packet, generate } from 'coap-packet'
import { generateBlockOption, exponentToByteSize } from './block'

export class SegmentedTransmission {
    totalLength: number
    currentByte: number
    lastByte: number
    req: OutgoingMessage
    payload: Buffer
    packet: Packet
    resendCount: number
    blockState: Block
    byteSize: number
    constructor (blockSize: number, req: OutgoingMessage, packet: Packet) {
        if (blockSize < 0 || blockSize > 6) {
            throw new Error(`invalid block size ${blockSize}`)
        }

        this.blockState = {
            num: 0,
            more: 0,
            size: 0
        }

        this.setBlockSizeExp(blockSize)

        this.totalLength = packet.payload?.length ?? 0
        this.currentByte = 0
        this.lastByte = 0

        this.req = req
        this.payload = packet.payload ?? Buffer.alloc(0)
        this.packet = packet

        this.packet.payload = undefined
        this.resendCount = 0
    }

    setBlockSizeExp (blockSizeExp: number): void {
        this.blockState.size = blockSizeExp
        this.byteSize = exponentToByteSize(blockSizeExp)
    }

    updateBlockState (): void {
        this.blockState.num = this.currentByte / this.byteSize
        this.blockState.more = ((this.currentByte + this.byteSize) < this.totalLength) ? 1 : 0

        this.req.setOption('Block1', generateBlockOption(this.blockState))
    }

    isCorrectACK (retBlockState: Block): boolean {
        return retBlockState.num === this.blockState.num// && packet.code == "2.31"
    }

    resendPreviousPacket (): void {
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
     * @param retBlockState The received block state from the other end
     */
    receiveACK (retBlockState: Block): void {
        if (this.blockState.size !== retBlockState.size) {
            this.setBlockSizeExp(retBlockState.size)
        }

        if (this.remaining() > 0) {
            this.sendNext()
        }
        this.resendCount = 0
    }

    remaining (): number {
        return this.totalLength - this.currentByte
    }

    sendNext (): void {
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
