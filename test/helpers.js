/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const toCode = require('../lib/helpers').toCode
const getOption = require('../lib/helpers').getOption
const hasOption = require('../lib/helpers').hasOption
const removeOption = require('../lib/helpers').removeOption
const simplifyPacketForPrint = require('../lib/helpers').simplifyPacketForPrint
const parseBlock2 = require('../lib/helpers').parseBlock2
const createBlock2 = require('../lib/helpers').createBlock2

describe('Helpers', () => {
    describe('Has Options', () => {
        it('Should return true', (done) => {
            const options = [
                { name: 'test' },
                { name: 'test2' }
            ]
            expect(hasOption(options, 'test')).to.eql(true)
            setImmediate(done)
        })

        it('Should return null', (done) => {
            const options = [
                { name: 'test2' }
            ]
            expect(hasOption(options, 'test')).to.eql(null)
            setImmediate(done)
        })
    })

    describe('Get Options', () => {
        it('Should return option value', (done) => {
            const options = [
                { name: 'test', value: 'hello' },
                { name: 'test2', value: 'world' }
            ]
            expect(getOption(options, 'test')).to.eql('hello')
            setImmediate(done)
        })

        it('Should return null', (done) => {
            const options = [
                { name: 'test2', value: 'world' }
            ]
            expect(getOption(options, 'test')).to.eql(null)
            setImmediate(done)
        })
    })

    describe('Remove Options', () => {
        it('Should return true', (done) => {
            const options = [
                { name: 'test', value: 'hello' },
                { name: 'test2', value: 'world' }
            ]
            expect(removeOption(options, 'test')).to.eql(true)
            setImmediate(done)
        })

        it('Should return false', (done) => {
            const options = [
                { name: 'test2', value: 'world' }
            ]
            expect(removeOption(options, 'test')).to.eql(false)
            setImmediate(done)
        })
    })

    describe('Simplify Packet for Print', () => {
        it('Should return pretty packet', (done) => {
            const packet = {
                token: '0x01',
                options: [],
                payload: '01 02 03'
            }
            const response = {
                options: {},
                payload: 'Buff: 8',
                token: '0x01'
            }
            expect(simplifyPacketForPrint(packet)).to.eql(response)
            setImmediate(done)
        })

        it('Should return packet with options as parsed hex values', (done) => {
            const packet = {
                token: '0x01',
                options: [{ name: 'test', value: [0x01, 0x02] }],
                payload: '01 02 03'
            }
            const response = {
                options: { test: '1,2' },
                payload: 'Buff: 8',
                token: '0x01'
            }
            expect(simplifyPacketForPrint(packet)).to.eql(response)
            setImmediate(done)
        })
    })

    describe('Parse Block2', () => {
        it('Should have case 3 equal 4128', (done) => {
            const buff = Buffer.from([0x01, 0x02, 0x03])
            const res = parseBlock2(buff)
            expect(res.num).to.eql(4128)
            setImmediate(done)
        })

        it('Should return null', (done) => {
            const buff = Buffer.from([0x01, 0x02, 0x03, 0x04])
            const res = parseBlock2(buff)
            expect(res).to.eql(null)
            setImmediate(done)
        })

        it('Should parse a zero length buffer', (done) => {
            const buff = Buffer.alloc(0)
            const res = parseBlock2(buff)
            expect(res).to.eql({ more: 0, num: 0, size: 0 })
            setImmediate(done)
        })
    })

    describe('Create Block2', () => {
        it('Should return a buffer carrying a block 2 value', (done) => {
            const buff = Buffer.from([0xff, 0xff, 0xe9])
            const block = { more: 1, num: 1048574, size: 32 }
            const res = createBlock2(block)
            expect(res).to.eql(buff)
            setImmediate(done)
        })

        it('Should return null', (done) => {
            const block = { more: 1, num: 1048576, size: 32 }
            const res = createBlock2(block)
            expect(res).to.eql(null)
            setImmediate(done)
        })
    })

    describe('Convert Codes', () => {
        it('Should keep codes with type string', (done) => {
            expect(toCode('2.05')).to.eql('2.05')
            setImmediate(done)
        })

        it('Should convert numeric codes with zeros inbetween', (done) => {
            expect(toCode(404)).to.eql('4.04')
            setImmediate(done)
        })

        it('Should convert numeric codes', (done) => {
            expect(toCode(415)).to.eql('4.15')
            setImmediate(done)
        })
    })

    // genAck

    // addSetOptions

    // packetToMessage

    // removeOption

    // or

    // isOptions

    // isNumeric

    // isBoolean
})
