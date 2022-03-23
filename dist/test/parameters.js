"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../index");
const chai_1 = require("chai");
describe('Parameters', function () {
    afterEach(function () {
        (0, index_1.defaultTiming)();
    });
    it('should ignore empty parameter', function () {
        // WHEN
        (0, index_1.updateTiming)();
        // THEN
        (0, chai_1.expect)(index_1.parameters.maxRTT).to.eql(202);
        (0, chai_1.expect)(index_1.parameters.exchangeLifetime).to.eql(247);
        (0, chai_1.expect)(index_1.parameters.maxTransmitSpan).to.eql(45);
        (0, chai_1.expect)(index_1.parameters.maxTransmitWait).to.eql(93);
    });
    it('should verify custom timings', function () {
        // GIVEN
        const coapTiming = {
            ackTimeout: 1,
            ackRandomFactor: 2,
            maxRetransmit: 3,
            maxLatency: 5,
            piggybackReplyMs: 6
        };
        // WHEN
        (0, index_1.updateTiming)(coapTiming);
        // THEN
        (0, chai_1.expect)(index_1.parameters.maxRTT).to.eql(11);
        (0, chai_1.expect)(index_1.parameters.exchangeLifetime).to.eql(25);
        (0, chai_1.expect)(index_1.parameters.maxTransmitSpan).to.eql(14);
        (0, chai_1.expect)(index_1.parameters.maxTransmitWait).to.eql(30);
    });
    it('should verify default timings', function () {
        // THEN
        (0, chai_1.expect)(index_1.parameters.maxRTT).to.eql(202);
        (0, chai_1.expect)(index_1.parameters.exchangeLifetime).to.eql(247);
        (0, chai_1.expect)(index_1.parameters.maxTransmitSpan).to.eql(45);
        (0, chai_1.expect)(index_1.parameters.maxTransmitWait).to.eql(93);
    });
});
//# sourceMappingURL=parameters.js.map