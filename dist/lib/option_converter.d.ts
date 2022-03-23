/// <reference types="node" />
import { OptionValue } from '../models/models';
export declare function toBinary(name: string, value: Buffer | any): Buffer;
export declare function fromBinary(name: string, value: Buffer): any;
export declare function registerOption(name: string, toBinary: (value: OptionValue) => Buffer | null, fromBinary: (value: Buffer) => OptionValue | null): void;
export declare function ignoreOption(name: string): void;
export declare function isIgnored(name: string): boolean;
/**
 * Registers a new Content-Format.
 *
 * @param name Media-Type and parameters.
 * @param value The numeric code of the Content-Format.
 */
export declare function registerFormat(name: string, value: number): void;
