/// <reference types="node" />
import { Block } from '../models/models';
import OutgoingMessage from './outgoing_message';
import { Packet } from 'coap-packet';
export declare class SegmentedTransmission {
    totalLength: number;
    currentByte: number;
    lastByte: number;
    req: OutgoingMessage;
    payload: Buffer;
    packet: Packet;
    resendCount: number;
    blockState: Block;
    byteSize: number;
    constructor(blockSize: number, req: OutgoingMessage, packet: Packet);
    setBlockSizeExp(blockSizeExp: number): void;
    updateBlockState(): void;
    isCorrectACK(retBlockState: Block): boolean;
    resendPreviousPacket(): void;
    /**
     *
     * @param retBlockState The received block state from the other end
     */
    receiveACK(retBlockState: Block): void;
    remaining(): number;
    sendNext(): void;
}
