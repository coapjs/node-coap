/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import type { ParsedPacket } from 'coap-packet'

const OSCORE_OPTION_NAME = 'OSCORE'
const OSCORE_OPTION_NUMBER = 9
const FLAG_KID = 0x08
const FLAG_KID_CTX = 0x10
const FLAG_PIV_MASK = 0x07
// RFC 8613 §6.1: the upper bits (0x20, 0x40, 0x80) of the flag byte are
// reserved and MUST be 0. Per RFC 8613 §3.1, partial IV is bounded to 5
// bytes — so pivLen values 6 and 7 are also illegal.
const FLAG_RESERVED_MASK = 0xe0
const MAX_PIV_LEN = 5

export interface OscoreOptionFields {
    kid: Buffer | null
    kidContext: Buffer | null
    piv: Buffer | null
}

/**
 * Extract the OSCORE option value from a parsed CoAP packet.
 * The OSCORE option has number 9.
 */
export function getOscoreOptionValue (packet: ParsedPacket): Buffer | null {
    if (packet.options == null) {
        return null
    }

    for (const option of packet.options) {
        if (option.name === OSCORE_OPTION_NAME || option.name === OSCORE_OPTION_NUMBER) {
            if (Buffer.isBuffer(option.value)) {
                return option.value
            }
            return null
        }
    }
    return null
}

/**
 * Parse an OSCORE option value into its constituent fields.
 * Follows RFC 8613 Section 6.1:
 *   [flags_byte] [piv_bytes...] [kid_context_len] [kid_context_bytes...] [kid_bytes...]
 */
export function parseOscoreOption (value: Buffer): OscoreOptionFields {
    if (value.length === 0) {
        return { kid: null, kidContext: null, piv: null }
    }

    let offset = 0
    const flags = value[offset++]

    if ((flags & FLAG_RESERVED_MASK) !== 0) {
        throw new Error('Malformed OSCORE option: reserved flag bits set')
    }

    const pivLen = flags & FLAG_PIV_MASK
    if (pivLen > MAX_PIV_LEN) {
        throw new Error('Malformed OSCORE option: PIV length exceeds RFC 8613 §3.1 maximum')
    }
    let piv: Buffer | null = null
    if (pivLen > 0) {
        if (offset + pivLen > value.length) {
            throw new Error('Malformed OSCORE option: PIV truncated')
        }
        piv = value.slice(offset, offset + pivLen)
        offset += pivLen
    }

    let kidContext: Buffer | null = null
    if ((flags & FLAG_KID_CTX) !== 0) {
        if (offset >= value.length) {
            throw new Error('Malformed OSCORE option: missing KID Context length')
        }
        const kidCtxLen = value[offset++]
        if (offset + kidCtxLen > value.length) {
            throw new Error('Malformed OSCORE option: KID Context truncated')
        }
        kidContext = value.slice(offset, offset + kidCtxLen)
        offset += kidCtxLen
    }

    let kid: Buffer | null = null
    if ((flags & FLAG_KID) !== 0) {
        kid = value.slice(offset)
    }

    return { kid, kidContext, piv }
}

/**
 * Check if a parsed packet has an OSCORE option.
 */
export function hasOscoreOption (packet: ParsedPacket): boolean {
    return getOscoreOptionValue(packet) != null
}
