'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

// Generic toBinary and fromBinary definitions
const optionToBinaryFunctions = {}
const optionFromBinaryFunctions = {}

// list of options silently ignored
const ignoredOptions = {}

module.exports.toBinary = function (name, value) {
    if (Buffer.isBuffer(value)) { return value }

    if (!optionToBinaryFunctions[name]) { throw new Error('Unknown string to Buffer converter for option: ' + name) }

    return optionToBinaryFunctions[name](value)
}

module.exports.fromBinary = function (name, value) {
    const convert = optionFromBinaryFunctions[name]

    if (!convert) { return value }

    return convert(value)
}

const registerOption = function (name, toBinary, fromBinary) {
    optionFromBinaryFunctions[name] = fromBinary
    optionToBinaryFunctions[name] = toBinary
}

module.exports.registerOption = registerOption

const ignoreOption = function (name) {
    ignoredOptions[name] = true
}

module.exports.ignoreOption = ignoreOption

ignoreOption('Cache-Control')
ignoreOption('Content-Length')
ignoreOption('Accept-Ranges')

module.exports.isIgnored = function (name) {
    return !!ignoredOptions[name]
}

// ETag option registration
const fromString = function (result) {
    return Buffer.from(result)
}

const toString = function (value) {
    return value.toString()
}

registerOption('ETag', fromString, toString)
registerOption('Location-Path', fromString, toString)
registerOption('Location-Query', fromString, toString)
registerOption('Proxy-Uri', fromString, toString)

const fromUint = function (result) {
    let uint = Number(result)
    if (!isFinite(uint) || Math.floor(uint) !== uint || uint < 0) {
        throw TypeError('Expected uint, got ' + result)
    }
    const parts = []
    while (uint > 0) {
        parts.unshift(uint % 256)
        uint = Math.floor(uint / 256)
    }
    return Buffer.from(parts)
}

const toUint = function (value) {
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

const registerFormat = function (name, value) {
    let bytes

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
registerFormat('text/plain', 0)
registerFormat('application/link-format', 40)
registerFormat('application/xml', 41)
registerFormat('application/octet-stream', 42)
registerFormat('application/exi', 47)
registerFormat('application/json', 50)
registerFormat('application/json-patch+json', 51)
registerFormat('application/merge-patch+json', 52)
registerFormat('application/cbor', 60)
registerFormat('application/cwt', 61)
registerFormat('application/multipart-core', 62)
registerFormat('application/cbor-seq', 63)
registerFormat('application/cose-key', 101)
registerFormat('application/cose-key-set', 102)
registerFormat('application/senml+json', 110)
registerFormat('application/sensml+json', 111)
registerFormat('application/senml+cbor', 112)
registerFormat('application/sensml+cbor', 113)
registerFormat('application/senml-exi', 114)
registerFormat('application/sensml-exi', 115)
registerFormat('application/coap-group+json', 256)
registerFormat('application/dots+cbor', 271)
registerFormat('application/missing-blocks+cbor-seq', 272)
registerFormat('application/senml+xml', 310)
registerFormat('application/sensml+xml', 311)
registerFormat('application/senml-etch+json', 320)
registerFormat('application/senml-etch+cbor', 322)
registerFormat('application/td+json', 432)

const contentFormatToBinary = function (value) {
    const result = formatsString[value.split(';')[0]]
    if (!result) { throw new Error('Unknown Content-Format: ' + value) }

    return result
}

const contentFormatToString = function (value) {
    if (value.length === 0) { return formatsBinaries[0] }

    if (value.length === 1) { value = value.readUInt8(0) } else if (value.length === 2) { value = value.readUInt16BE(0) } else { return null }

    const result = formatsBinaries[value]

    if (!result) return value

    return result
}

registerOption('Content-Format', contentFormatToBinary, contentFormatToString)
registerOption('Accept', contentFormatToBinary, contentFormatToString)
registerOption('Observe', function (sequence) {
    let buf

    if (!sequence) {
        buf = Buffer.alloc(0)
    } else if (sequence <= 0xff) {
        buf = Buffer.of(sequence)
    } else if (sequence <= 0xffff) {
        buf = Buffer.of(sequence >> 8, sequence)
    } else {
        buf = Buffer.of(sequence >> 16, sequence >> 8, sequence)
    }

    return buf
}, function (buf) {
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
