/// <reference types="node" />
import { OptionName, NamedOption, Packet } from 'coap-packet';
import { CoapPacket, Option, OptionValue, Block } from '../models/models';
export declare function genAck(request: Packet): Packet;
export declare function setOption(packet: Packet, name: OptionName | string, values: OptionValue): void;
export declare function toCode(code: string | number): string;
export declare function packetToMessage(dest: any, packet: CoapPacket): void;
export declare function hasOption(options: Array<Option | NamedOption>, name: OptionName | string): true | null;
/**
 * get an option value from options
 *
 * @param options array of object, in form `{name: value}`
 * @param name name of the object wanted to retrive
 * @returns `value`, or null
 */
export declare function getOption(options: NamedOption[] | Option[] | undefined, name: OptionName | string): OptionValue | null;
/**
 * Remove an option value from options
 *
 * @param options array of object, in form {name: value}
 * @param name name of the object wanted to remove
 * @returns `true` if the option was found and removed
 */
export declare function removeOption(options: Option[], name: OptionName | string): boolean;
/**
 * Parse an encoded block2 option and return a block state object.
 *
 * @param block2Value block2 value buffer
 * @returns Block state object with `num`, `size`, and `more` flag.
 *          With an invalid block2 value, the function will return `null`.
 */
export declare function parseBlock2(block2Value: Buffer): Block | null;
/**
 * Create buffer for block2 option
 *
 * @param requestedBlock Object containing block2 information
 * @returns Buffer carrying block2 value
 */
export declare function createBlock2(requestedBlock: Block): Buffer | null;
/**
 * Provide a or function to use with the reduce() Array method
 *
 * @param previous
 * @param current
 * @returns
 */
export declare function or(previous: boolean, current: boolean): boolean;
/**
 * Provide a function to detect whether an option has a particular name (for its use with filter or map).
 *
 * @param optionName
 * @returns
 */
export declare function isOption(optionName: OptionName): (option: Option) => boolean;
export declare function isNumeric(n: any): boolean;
export declare function isBoolean(n: any): boolean;
