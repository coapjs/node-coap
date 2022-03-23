"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SegmentedTransmission = void 0;
const coap_packet_1 = require("coap-packet");
const block_1 = require("./block");
class SegmentedTransmission {
    constructor(blockSize, req, packet) {
        var _a, _b, _c;
        if (blockSize < 0 || blockSize > 6) {
            throw new Error(`invalid block size ${blockSize}`);
        }
        this.blockState = {
            num: 0,
            more: 0,
            size: 0
        };
        this.setBlockSizeExp(blockSize);
        this.totalLength = (_b = (_a = packet.payload) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
        this.currentByte = 0;
        this.lastByte = 0;
        this.req = req;
        this.payload = (_c = packet.payload) !== null && _c !== void 0 ? _c : Buffer.alloc(0);
        this.packet = packet;
        this.packet.payload = undefined;
        this.resendCount = 0;
    }
    setBlockSizeExp(blockSizeExp) {
        this.blockState.size = blockSizeExp;
        this.byteSize = (0, block_1.exponentToByteSize)(blockSizeExp);
    }
    updateBlockState() {
        this.blockState.num = this.currentByte / this.byteSize;
        this.blockState.more = ((this.currentByte + this.byteSize) < this.totalLength) ? 1 : 0;
        this.req.setOption('Block1', (0, block_1.generateBlockOption)(this.blockState));
    }
    isCorrectACK(retBlockState) {
        return retBlockState.num === this.blockState.num; // && packet.code == "2.31"
    }
    resendPreviousPacket() {
        if (this.resendCount < 5) {
            this.currentByte = this.lastByte;
            if (this.remaining() > 0) {
                this.sendNext();
            }
            this.resendCount++;
        }
        else {
            throw new Error('Too many block re-transfers');
        }
    }
    /**
     *
     * @param retBlockState The received block state from the other end
     */
    receiveACK(retBlockState) {
        if (this.blockState.size !== retBlockState.size) {
            this.setBlockSizeExp(retBlockState.size);
        }
        if (this.remaining() > 0) {
            this.sendNext();
        }
        this.resendCount = 0;
    }
    remaining() {
        return this.totalLength - this.currentByte;
    }
    sendNext() {
        const blockLength = Math.min(this.totalLength - this.currentByte, this.byteSize);
        const subBuffer = this.payload.slice(this.currentByte, this.currentByte + blockLength);
        this.updateBlockState();
        this.packet.ack = false;
        this.packet.reset = false;
        this.packet.confirmable = true;
        this.packet.payload = subBuffer;
        this.lastByte = this.currentByte;
        this.currentByte += blockLength;
        let buf;
        try {
            buf = (0, coap_packet_1.generate)(this.packet);
        }
        catch (err) {
            this.req.sender.reset();
            this.req.emit('error', err);
            return;
        }
        this.req.sender.send(buf, !this.packet.confirmable);
    }
}
exports.SegmentedTransmission = SegmentedTransmission;
//# sourceMappingURL=segmentation.js.map