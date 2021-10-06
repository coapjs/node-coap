'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const toBinary = require('./option_converter').toBinary
const fromBinary = require('./option_converter').fromBinary
const codes = {
    0.01: 'GET',
    0.02: 'POST',
    0.03: 'PUT',
    0.04: 'DELETE',
    0.05: 'FETCH',
    0.06: 'PATCH',
    0.07: 'iPATCH'
}
const capitalize = require('capitalize')
const isIgnored = require('./option_converter').isIgnored

module.exports.genAck = (request) => {
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

function setOption (name, values) {
    let i

    name = capitalize.words(name)
    name = optionAliases[name] || name

    if (isIgnored(name)) {
        return this
    }

    this._packet.options = this._packet.options.filter((option) => {
        return option.name !== name
    })

    if (!Array.isArray(values)) {
        values = [values]
    }

    for (i = 0; i < values.length; i++) {
        this._packet.options.push({
            name: name,
            value: toBinary(name, values[i])
        })
    }

    return this
}

module.exports.addSetOption = (klass) => {
    const proto = klass.prototype
    proto.setOption = setOption
    proto.setHeader = setOption
}

module.exports.toCode = (code) => {
    if (typeof code === 'string') {
        return code
    }

    const first = Math.floor(code / 100)
    const second = code - first * 100
    let result = ''

    result += String(first) + '.'

    if (second < 10) {
        result += '0'
    }

    result += String(second)

    return result
}

module.exports.packetToMessage = (dest, packet) => {
    let i
    const options = packet.options
    let option
    const paths = []
    const queries = []
    let query = ''

    dest.payload = packet.payload
    dest.options = packet.options
    dest.code = packet.code
    dest.method = codes[packet.code]
    dest.headers = {}

    for (i = 0; i < options.length; i++) {
        option = options[i]

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

    if (dest.headers['Content-Format']) {
        dest.headers['Content-Type'] = dest.headers['Content-Format']
    }

    query = queries.join('&')
    let url = '/' + paths.join('/')
    if (query) {
        url += '?' + query
    }
    dest.url = url
}

module.exports.hasOption = (options, name) => {
    for (const i in options) {
        if (options[i].name === name) {
            return true
        }
    }
    return null
}

/*
get an option value from options
  options     array of object, in form {name: , value}
  name        name of the object wanted to retrive
  return      value, or null
*/
module.exports.getOption = (options, name) => {
    for (const i in options) {
        if (options[i].name === name) {
            return options[i].value
        }
    }
    return null
}

/*
get an option value from options
  options     array of object, in form {name: , value}
  name        name of the object wanted to retrive
  return      value, or null
*/
module.exports.removeOption = (options, name) => {
    for (const i in options) {
        if (options[i].name === name) {
            delete options[i]
            return true
        }
    }
    return false
}

module.exports.simplifyPacketForPrint = (packetIn) => {
    const packet = Object.assign({}, packetIn)
    packet.token = packet.token.toString('hex')
    packet.payload = `Buff: ${packet.payload.length}`
    const newOptions = {}
    for (const j in packet.options) {
        const name = packet.options[j].name
        const hex = packet.options[j].value.toString('hex')
        newOptions[name] = hex
    }
    packet.options = newOptions
    return packet
}

/**
 * Parse an encoded block2 option and return a block state object.
 *
 * @param {Buffer} block2Value block2 value buffer
 * @returns {Object} Block state object with `num`, `size`, and `more` flag.
 *                   With an invalid block2 value, the function will return `null`.
 */
module.exports.parseBlock2 = (block2Value) => {
    let num
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
module.exports.createBlock2 = (requestedBlock) => {
    let byte
    const szx = Math.log(requestedBlock.size) / Math.log(2) - 4
    const m = requestedBlock.more
    const num = requestedBlock.num
    let extraNum

    byte = 0
    byte |= szx
    byte |= m << 3
    byte |= (num & 0xf) << 4

    // total num occupy up to 5 octets
    // num share the higher octet of first byte, and (may) take more 2 bytes for the rest 4 octets
    if (num <= 0xf) {
        extraNum = null
    } else if (num <= 0xfff) {
        extraNum = Buffer.of(num / 16)
    } else if (num <= 0xfffff) {
        extraNum = Buffer.alloc(2)
        extraNum.writeUInt16BE(num >> 4, 0)
    } else {
    // too big block2 number
        return null
    }
    return (extraNum) ? Buffer.concat([extraNum, Buffer.of(byte)]) : Buffer.of(byte)
}

/**
 * Provide a or function to use with the reduce() Array method
 */
module.exports.or = (previous, current) => {
    return previous || current
}

/**
 * Provide a function to detect whether an option has a particular name (for its use with filter or map).
 */
module.exports.isOption = (optionName) => {
    return (option) => {
        return option.name === optionName
    }
}

module.exports.isNumeric = (n) => {
    return !isNaN(parseFloat(n)) && isFinite(n)
}

module.exports.isBoolean = (n) => {
    return typeof (n) === 'boolean'
}
