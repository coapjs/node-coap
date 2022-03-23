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
const index_1 = require("../index");
const retry_send_1 = __importDefault(require("../lib/retry_send"));
const chai_1 = require("chai");
describe('RetrySend', function () {
    it('should use the default retry count', function () {
        const result = new retry_send_1.default({}, 1234, 'localhost');
        (0, chai_1.expect)(result._maxRetransmit).to.eql(index_1.parameters.maxRetransmit);
    });
    it('should use a custom retry count', function () {
        const result = new retry_send_1.default({}, 1234, 'localhost', 55);
        (0, chai_1.expect)(result._maxRetransmit).to.eql(55);
    });
    it('should use default retry count, using the retry_send factory method', function () {
        const result = new retry_send_1.default({}, 1234, 'localhost');
        (0, chai_1.expect)(result._maxRetransmit).to.eql(index_1.parameters.maxRetransmit);
    });
    it('should use a custom retry count, using the retry_send factory method', function () {
        const result = new retry_send_1.default({}, 1234, 'localhost', 55);
        (0, chai_1.expect)(result._maxRetransmit).to.eql(55);
    });
});
//# sourceMappingURL=retry_send.js.map