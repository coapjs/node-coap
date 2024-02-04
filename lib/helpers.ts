/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { OptionName, NamedOption, Packet } from 'coap-packet'
import { CoapPacket, Option, OptionValue, Block } from '../models/models'
import { toBinary, fromBinary, isIgnored } from './option_converter'
import capitalize from 'capitalize'

const codes = {
    0.01: 'GET',
    0.02: 'POST',
    0.03: 'PUT',
    0.04: 'DELETE',
    0.05: 'FETCH',
    0.06: 'PATCH',
    0.07: 'iPATCH'
}

export function genAck (request: Packet): Packet {
    return {
        messageId: request.messageId,
        code: '0.00',
        options: [],
        confirmable: false,
        ack: true,
        reset: false
    }
}

const optionAliases = {
    'Content-Type': 'Content-Format',
    Etag: 'ETag'
}

export function setOption (packet: Packet, name: OptionName | string, values: OptionValue): void {
    name = capitalize.words(name)
    name = optionAliases[name] ?? name
    const optionName: OptionName = name as OptionName

    if (isIgnored(name)) {
        return
    }

    packet.options = packet.options?.filter((option) => {
        return option.name !== name
    })

    if (!Array.isArray(values)) {
        packet.options?.push({
            name: optionName,
            value: toBinary(name, values)
        })
    } else {
        for (const value of values) {
            packet.options?.push({ name: optionName, value })
        }
    }
}

export function toCode (code: string | number): string {
    if (typeof code === 'string') {
        return code
    }

    const codeClass = Math.floor(code / 100)
    const codeDetail = String(code - codeClass * 100).padStart(2, "0")

    return `${codeClass}.${codeDetail}`
}

export function packetToMessage (dest: any, packet: CoapPacket): void {
    const options = packet.options ?? []
    const paths: Buffer[] = []
    const queries: Buffer[] = []
    let query = ''

    dest.payload = packet.payload
    dest.options = packet.options
    dest.code = packet.code
    dest.method = codes[dest.code]
    dest.headers = {}

    for (let i = 0; i < options.length; i++) {
        const option = options[i]

        if (typeof option.name !== 'string') {
            continue
        }

        if (option.name === 'Uri-Path') {
            paths.push(option.value)
        }

        if (option.name === 'Uri-Query') {
            queries.push(option.value)
        }

        option.value = fromBinary(option.name, option.value)

        if (option.value != null && !Buffer.isBuffer(option.value)) {
            dest.headers[option.name] = option.value
        }
    }

    if (dest.headers['Content-Format'] != null) {
        dest.headers['Content-Type'] = dest.headers['Content-Format']
    }

    query = queries.join('&')
    let url = '/' + paths.join('/')
    if (query !== '') {
        url += '?' + query
    }
    dest.url = url
}

export function hasOption (options: Array<Option | NamedOption>, name: OptionName | string): true | null {
    for (const option of options) {
        if (option.name === name) {
            return true
        }
    }
    return null
}

/**
 * get an option value from options
 *
 * @param options array of object, in form `{name: value}`
 * @param name name of the object wanted to retrive
 * @returns `value`, or null
 */
export function getOption (options: NamedOption[] | Option[] | undefined, name: OptionName | string): OptionValue | null {
    if (options == null) {
        return null
    }

    for (const option of options) {
        if (option.name === name) {
            return option.value
        }
    }
    return null
}

/**
 * Remove an option value from options
 *
 * @param options array of object, in form {name: value}
 * @param name name of the object wanted to remove
 * @returns `true` if the option was found and removed
 */
export function removeOption (options: Option[], name: OptionName | string): boolean {
    let result = false
    options.forEach((option, index) => {
        if (option.name === name) {
            options.splice(index, 1)
            result = true
        }
    })
    return result
}

/**
 * Parse an encoded block2 option and return a block state object.
 *
 * @param block2Value block2 value buffer
 * @returns Block state object with `num`, `size`, and `more` flag.
 *          With an invalid block2 value, the function will return `null`.
 */
export function parseBlock2 (block2Value: Buffer): Block | null {
    let num: number
    switch (block2Value.length) {
        case 0:
            return { more: 0, size: 0, num: 0 }
        case 1:
            num = block2Value[0] >> 4
            break
        case 2:
            num = (block2Value[0] * 256 + block2Value[1]) >> 4
            break
        case 3:
            num = (block2Value[0] * 256 * 256 + block2Value[1] * 256 + block2Value[2]) >> 4
            break
        default:
            // Block2 is more than 3 bytes
            return null
    }
    const lastByte = block2Value.slice(-1)[0]
    // limit value of size is 1024 (2**(6+4))
    if ((lastByte & 7) === 7) {
        // Block size is bigger than 1024
        return null
    }
    const more = (lastByte & 8) >> 3
    return {
        more,
        num,
        size: Math.pow(2, (lastByte & 7) + 4)
    }
}

/**
 * Create buffer for block2 option
 *
 * @param requestedBlock Object containing block2 information
 * @returns Buffer carrying block2 value
 */
export function createBlock2 (requestedBlock: Block): Buffer | null {
    const szx = Math.log(requestedBlock.size) / Math.log(2) - 4
    const m = requestedBlock.more
    const num = requestedBlock.num
    let extraNum: Buffer

    let byte = 0
    byte |= szx
    byte |= m << 3
    byte |= (num & 0xf) << 4

    // total num occupy up to 5 octets
    // num share the higher octet of first byte, and (may) take more 2 bytes for the rest 4 octets
    if (num <= 0xf) {
        return Buffer.of(byte)
    } else if (num <= 0xfff) {
        extraNum = Buffer.of(num / 16)
    } else if (num <= 0xfffff) {
        extraNum = Buffer.alloc(2)
        extraNum.writeUInt16BE(num >> 4, 0)
    } else {
    // too big block2 number
        return null
    }
    return Buffer.concat([extraNum, Buffer.of(byte)])
}

/**
 * Provide a or function to use with the reduce() Array method
 *
 * @param previous
 * @param current
 * @returns
 */
export function or (previous: boolean, current: boolean): boolean {
    return previous || current
}

/**
 * Provide a function to detect whether an option has a particular name (for its use with filter or map).
 *
 * @param optionName
 * @returns
 */
export function isOption (optionName: OptionName): (option: Option) => boolean {
    return (option) => {
        return option.name === optionName
    }
}

export function isNumeric (n: any): boolean {
    return !isNaN(parseFloat(n)) && isFinite(n)
}

export function isBoolean (n: any): boolean {
    return typeof (n) === 'boolean'
}
