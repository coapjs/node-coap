/// <reference types="node" />
import { Block } from '../models/models';
/**
 *
 * @param numOrBlockState The block sequence number or a block state object.
 * @param more Can indicate if more blocks are to follow.
 * @param size The block size.
 */
export declare function generateBlockOption(numOrBlockState: Block | number, more?: number, size?: number): Buffer;
export declare function parseBlockOption(buff: Buffer): Block;
export declare function exponentToByteSize(expo: number): number;
export declare function byteSizeToExponent(byteSize: number): number;
