/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const coap = require('../')
const parameters = coap.parameters

describe('Parameters', function () {
    afterEach(function () {
        parameters.defaultTiming()
    })

    it('should ignore empty parameter', function () {
    // WHEN
        coap.updateTiming()

        // THEN
        expect(parameters.maxRTT).to.eql(202)
        expect(parameters.exchangeLifetime).to.eql(247)
        expect(parameters.maxTransmitSpan).to.eql(45)
        expect(parameters.maxTransmitWait).to.eql(93)
    })

    it('should verify custom timings', function () {
    // GIVEN
        const coapTiming = {
            ackTimeout: 1,
            ackRandomFactor: 2,
            maxRetransmit: 3,
            maxLatency: 5,
            piggybackReplyMs: 6
        }

        // WHEN
        coap.updateTiming(coapTiming)

        // THEN
        expect(parameters.maxRTT).to.eql(11)
        expect(parameters.exchangeLifetime).to.eql(25)
        expect(parameters.maxTransmitSpan).to.eql(14)
        expect(parameters.maxTransmitWait).to.eql(30)
    })

    it('should verify default timings', function () {
    // THEN
        expect(parameters.maxRTT).to.eql(202)
        expect(parameters.exchangeLifetime).to.eql(247)
        expect(parameters.maxTransmitSpan).to.eql(45)
        expect(parameters.maxTransmitWait).to.eql(93)
    })
})
