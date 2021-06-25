'use strict'

/*
* Copyright (c) 2013-2021 node-coap contributors.
*
* node-coap is licensed under an MIT +no-false-attribs license.
* All rights not explicitly granted in the MIT license are reserved.
* See the included LICENSE file for more details.
*/

exports.compareBuffers = function (buf1, buf2) {
    if (Buffer.compare) { return Buffer.compare(buf1, buf2) } else {
        if (buf1.length !== buf2.length) return -1
        for (let i = 0; i < buf1.length; i++) {
            if (buf1[i] !== buf2[i]) return -1
        }
        return 0
    }
}
