"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextPort = void 0;
let portCounter = 9042;
function nextPort() {
    return ++portCounter;
}
exports.nextPort = nextPort;
//# sourceMappingURL=common.js.map