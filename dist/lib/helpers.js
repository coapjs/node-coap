"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBoolean = exports.isNumeric = exports.isOption = exports.or = exports.createBlock2 = exports.parseBlock2 = exports.removeOption = exports.getOption = exports.hasOption = exports.packetToMessage = exports.toCode = exports.setOption = exports.genAck = void 0;
const option_converter_1 = require("./option_converter");
const capitalize_1 = __importDefault(require("capitalize"));
const codes = {
    0.01: 'GET',
    0.02: 'POST',
    0.03: 'PUT',
    0.04: 'DELETE',
    0.05: 'FETCH',
    0.06: 'PATCH',
    0.07: 'iPATCH'
};
function genAck(request) {
    return {
        messageId: request.messageId,
        code: '0.00',
        options: [],
        confirmable: false,
        ack: true,
        reset: false
    };
}
exports.genAck = genAck;
const optionAliases = {
    'Content-Type': 'Content-Format',
    Etag: 'ETag'
};
function setOption(packet, name, values) {
    var _a, _b, _c, _d;
    name = capitalize_1.default.words(name);
    name = (_a = optionAliases[name]) !== null && _a !== void 0 ? _a : name;
    const optionName = name;
    if ((0, option_converter_1.isIgnored)(name)) {
        return;
    }
    packet.options = (_b = packet.options) === null || _b === void 0 ? void 0 : _b.filter((option) => {
        return option.name !== name;
    });
    if (!Array.isArray(values)) {
        (_c = packet.options) === null || _c === void 0 ? void 0 : _c.push({
            name: optionName,
            value: (0, option_converter_1.toBinary)(name, values)
        });
    }
    else {
        for (const value of values) {
            (_d = packet.options) === null || _d === void 0 ? void 0 : _d.push({ name: optionName, value });
        }
    }
}
exports.setOption = setOption;
function toCode(code) {
    if (typeof code === 'string') {
        return code;
    }
    const first = Math.floor(code / 100);
    const second = code - first * 100;
    let result = '';
    result += String(first) + '.';
    if (second < 10) {
        result += '0';
    }
    result += String(second);
    return result;
}
exports.toCode = toCode;
function packetToMessage(dest, packet) {
    var _a;
    const options = (_a = packet.options) !== null && _a !== void 0 ? _a : [];
    const paths = [];
    const queries = [];
    let query = '';
    dest.payload = packet.payload;
    dest.options = packet.options;
    dest.code = packet.code;
    dest.method = codes[dest.code];
    dest.headers = {};
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (typeof option.name !== 'string') {
            continue;
        }
        if (option.name === 'Uri-Path') {
            paths.push(option.value);
        }
        if (option.name === 'Uri-Query') {
            queries.push(option.value);
        }
        option.value = (0, option_converter_1.fromBinary)(option.name, option.value);
        if (option.value != null && !Buffer.isBuffer(option.value)) {
            dest.headers[option.name] = option.value;
        }
    }
    if (dest.headers['Content-Format'] != null) {
        dest.headers['Content-Type'] = dest.headers['Content-Format'];
    }
    query = queries.join('&');
    let url = '/' + paths.join('/');
    if (query !== '') {
        url += '?' + query;
    }
    dest.url = url;
}
exports.packetToMessage = packetToMessage;
function hasOption(options, name) {
    for (const option of options) {
        if (option.name === name) {
            return true;
        }
    }
    return null;
}
exports.hasOption = hasOption;
/**
 * get an option value from options
 *
 * @param options array of object, in form `{name: value}`
 * @param name name of the object wanted to retrive
 * @returns `value`, or null
 */
function getOption(options, name) {
    if (options == null) {
        return null;
    }
    for (const option of options) {
        if (option.name === name) {
            return option.value;
        }
    }
    return null;
}
exports.getOption = getOption;
/**
 * Remove an option value from options
 *
 * @param options array of object, in form {name: value}
 * @param name name of the object wanted to remove
 * @returns `true` if the option was found and removed
 */
function removeOption(options, name) {
    let result = false;
    options.forEach((option, index) => {
        if (option.name === name) {
            options.splice(index, 1);
            result = true;
        }
    });
    return result;
}
exports.removeOption = removeOption;
/**
 * Parse an encoded block2 option and return a block state object.
 *
 * @param block2Value block2 value buffer
 * @returns Block state object with `num`, `size`, and `more` flag.
 *          With an invalid block2 value, the function will return `null`.
 */
function parseBlock2(block2Value) {
    let num;
    switch (block2Value.length) {
        case 0:
            return { more: 0, size: 0, num: 0 };
        case 1:
            num = block2Value[0] >> 4;
            break;
        case 2:
            num = (block2Value[0] * 256 + block2Value[1]) >> 4;
            break;
        case 3:
            num = (block2Value[0] * 256 * 256 + block2Value[1] * 256 + block2Value[2]) >> 4;
            break;
        default:
            // Block2 is more than 3 bytes
            return null;
    }
    const lastByte = block2Value.slice(-1)[0];
    // limit value of size is 1024 (2**(6+4))
    if ((lastByte & 7) === 7) {
        // Block size is bigger than 1024
        return null;
    }
    const more = (lastByte & 8) >> 3;
    return {
        more,
        num,
        size: Math.pow(2, (lastByte & 7) + 4)
    };
}
exports.parseBlock2 = parseBlock2;
/**
 * Create buffer for block2 option
 *
 * @param requestedBlock Object containing block2 information
 * @returns Buffer carrying block2 value
 */
function createBlock2(requestedBlock) {
    const szx = Math.log(requestedBlock.size) / Math.log(2) - 4;
    const m = requestedBlock.more;
    const num = requestedBlock.num;
    let extraNum;
    let byte = 0;
    byte |= szx;
    byte |= m << 3;
    byte |= (num & 0xf) << 4;
    // total num occupy up to 5 octets
    // num share the higher octet of first byte, and (may) take more 2 bytes for the rest 4 octets
    if (num <= 0xf) {
        return Buffer.of(byte);
    }
    else if (num <= 0xfff) {
        extraNum = Buffer.of(num / 16);
    }
    else if (num <= 0xfffff) {
        extraNum = Buffer.alloc(2);
        extraNum.writeUInt16BE(num >> 4, 0);
    }
    else {
        // too big block2 number
        return null;
    }
    return Buffer.concat([extraNum, Buffer.of(byte)]);
}
exports.createBlock2 = createBlock2;
/**
 * Provide a or function to use with the reduce() Array method
 *
 * @param previous
 * @param current
 * @returns
 */
function or(previous, current) {
    return previous || current;
}
exports.or = or;
/**
 * Provide a function to detect whether an option has a particular name (for its use with filter or map).
 *
 * @param optionName
 * @returns
 */
function isOption(optionName) {
    return (option) => {
        return option.name === optionName;
    };
}
exports.isOption = isOption;
function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
exports.isNumeric = isNumeric;
function isBoolean(n) {
    return typeof (n) === 'boolean';
}
exports.isBoolean = isBoolean;
//# sourceMappingURL=helpers.js.map