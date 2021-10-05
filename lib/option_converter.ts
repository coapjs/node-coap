/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { OptionValue } from '../models/models'

// Generic toBinary and fromBinary definitions
const optionToBinaryFunctions = {}
const optionFromBinaryFunctions = {}

// list of options silently ignored
const ignoredOptions = {}

export function toBinary (name: string, value: Buffer | any): Buffer {
    if (Buffer.isBuffer(value)) {
        return value
    }

    if (optionToBinaryFunctions[name] == null) {
        throw new Error('Unknown string to Buffer converter for option: ' + name)
    }

    return optionToBinaryFunctions[name](value)
}

export function fromBinary (name: string, value: Buffer): any {
    const convert = optionFromBinaryFunctions[name]

    if (convert == null) {
        return value
    }

    return convert(value)
}

export function registerOption (name: string, toBinary: (value: OptionValue) => Buffer | null, fromBinary: (value: Buffer) => OptionValue | null): void {
    optionFromBinaryFunctions[name] = fromBinary
    optionToBinaryFunctions[name] = toBinary
}

export function ignoreOption (name: string): void {
    ignoredOptions[name] = true
}

ignoreOption('Cache-Control')
ignoreOption('Content-Length')
ignoreOption('Accept-Ranges')

export function isIgnored (name: string): boolean {
    return ignoredOptions[name] != null
}

// ETag option registration
const fromString = (result: string): Buffer => {
    return Buffer.from(result)
}

const toString = (value: Buffer): string => {
    return value.toString()
}

registerOption('ETag', fromString, toString)
registerOption('Location-Path', fromString, toString)
registerOption('Location-Query', fromString, toString)
registerOption('Proxy-Uri', fromString, toString)

const fromUint = (result: number): Buffer => {
    let uint = Number(result)
    if (!isFinite(uint) || Math.floor(uint) !== uint || uint < 0) {
        throw TypeError(`Expected uint, got ${result}`)
    }
    const parts: number[] = []
    while (uint > 0) {
        parts.unshift(uint % 256)
        uint = Math.floor(uint / 256)
    }
    return Buffer.from(parts)
}

const toUint = (value: Buffer): number => {
    let result = 0
    for (let i = 0; i < value.length; ++i) {
        result = 256 * result + value[i]
    }
    return result
}

registerOption('Max-Age', fromUint, toUint)

// Content-Format and Accept options registration
const formatsString = {}
const formatsBinaries = {}

/**
 * Registers a new Content-Format.
 *
 * @param name Media-Type and parameters.
 * @param value The numeric code of the Content-Format.
 */
export function registerFormat (name: string, value: number): void {
    let bytes: Buffer

    if (value > 255) {
        bytes = Buffer.alloc(2)
        bytes.writeUInt16BE(value, 0)
    } else {
        bytes = Buffer.of(value)
    }

    formatsString[name] = bytes
    formatsBinaries[value] = name
}

module.exports.registerFormat = registerFormat

// See https://www.iana.org/assignments/core-parameters/core-parameters.xhtml#content-formats
// for a list of all registered content-formats
const supportedContentFormats = {
    'text/plain': 0,
    'application/cose; cose-type="cose-encrypt0"': 16,
    'application/cose; cose-type="cose-mac0"': 17,
    'application/cose; cose-type="cose-sign1"': 18,
    'application/link-format': 40,
    'application/xml': 41,
    'application/octet-stream': 42,
    'application/exi': 47,
    'application/json': 50,
    'application/json-patch+json': 51,
    'application/merge-patch+json': 52,
    'application/cbor': 60,
    'application/cwt': 61,
    'application/multipart-core': 62,
    'application/cbor-seq': 63,
    'application/cose-key': 101,
    'application/cose-key-set': 102,
    'application/senml+json': 110,
    'application/sensml+json': 111,
    'application/senml+cbor': 112,
    'application/sensml+cbor': 113,
    'application/senml-exi': 114,
    'application/sensml-exi': 115,
    'application/coap-group+json': 256,
    'application/dots+cbor': 271,
    'application/missing-blocks+cbor-seq': 272,
    'application/pkcs7-mime; smime-type=server-generated-key': 280,
    'application/pkcs7-mime; smime-type=certs-only': 281,
    'application/pkcs8': 284,
    'application/csrattrs': 285,
    'application/pkcs10': 286,
    'application/pkix-cert': 287,
    'application/senml+xml': 310,
    'application/sensml+xml': 311,
    'application/senml-etch+json': 320,
    'application/senml-etch+cbor': 322,
    'application/td+json': 432,
    'application/vnd.ocf+cbor': 10000,
    'application/oscore': 10001,
    'application/javascript': 10002,
    'application/vnd.oma.lwm2m+tlv': 11542,
    'application/vnd.oma.lwm2m+json': 11543,
    'application/vnd.oma.lwm2m+cbor': 11544,
    'text/css': 20000,
    'image/svg+xml': 30000
}

for (const [name, value] of Object.entries(supportedContentFormats)) {
    registerFormat(name, value)
}

function contentFormatToBinary (value: string): Buffer {
    if (formatsString[value] != null) {
        return formatsString[value]
    }

    const result = formatsString[value.split(';')[0]]
    if (result == null) {
        throw new Error('Unknown Content-Format: ' + value)
    }

    return result
}

function contentFormatToString (value: Buffer): string | number | null {
    if (value.length === 0) {
        return formatsBinaries[0]
    }

    let numericValue: number
    if (value.length === 1) {
        numericValue = value.readUInt8(0)
    } else if (value.length === 2) {
        numericValue = value.readUInt16BE(0)
    } else {
        return null
    }

    const result = formatsBinaries[numericValue]

    if (result == null) {
        return numericValue
    }

    return result
}

registerOption('Content-Format', contentFormatToBinary, contentFormatToString)
registerOption('Accept', contentFormatToBinary, contentFormatToString)
registerOption('Observe', (sequence: number) => {
    let buf: Buffer

    if (sequence == null) {
        buf = Buffer.alloc(0)
    } else if (sequence <= 0xff) {
        buf = Buffer.of(sequence)
    } else if (sequence <= 0xffff) {
        buf = Buffer.of(sequence >> 8, sequence)
    } else {
        buf = Buffer.of(sequence >> 16, sequence >> 8, sequence)
    }

    return buf
}, (buf) => {
    let result = 0

    if (buf.length === 1) {
        result = buf.readUInt8(0)
    } else if (buf.length === 2) {
        result = buf.readUInt16BE(0)
    } else if (buf.length === 3) {
        result = (buf.readUInt8(0) << 16) | buf.readUInt16BE(1)
    }

    return result
})
