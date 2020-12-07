/*
 * Copyright (c) 2013-2020 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const getOption              = require('../lib/helpers').getOption;
const hasOption              = require('../lib/helpers').hasOption;
const simplifyPacketForPrint = require('../lib/helpers').simplifyPacketForPrint;

describe('Helpers', () => {

    describe('Has Options', () => {
        it('Should return true', (done) => {
            let options = [
                {name: 'test'},
                {name: 'test2'}
            ]
            expect(hasOption(options, 'test')).to.eql(true)
            setImmediate(done)
        })

        it('Should return null', (done) => {
            let options = [
                {name: 'test2'}
            ]
            expect(hasOption(options, 'test')).to.eql(null)
            setImmediate(done)
        })
    })

    describe('Get Options', () => {
        it('Should return option value', (done) => {
            let options = [
                {name: 'test', value: 'hello'},
                {name: 'test2', value: 'world'}
            ]
            expect(getOption(options, 'test')).to.eql('hello')
            setImmediate(done)
        })

        it('Should return null', (done) => {
            let options = [
                {name: 'test2', value: 'world'}
            ]
            expect(getOption(options, 'test')).to.eql(null)
            setImmediate(done)
        })
    })
    
    describe('Simplify Packet for Print', () => {
        it('Should return pretty packet', (done) => {
            let packet = {
                token: '0x01',
                options: [],
                payload: '01 02 03'
            }
            let response = {
                options: {},
                payload: "Buff: 8",
                token: "0x01"
            }
            expect(simplifyPacketForPrint(packet)).to.eql(response);
            setImmediate(done)
        })
    })

    // genAck

    // addSetOptions

    // toCode

    // packetToMessage

    // removeOption

    // or

    // isOptions

    // isNumeric

    // isBoolean
})