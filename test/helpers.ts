/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { expect } from 'chai'

import { toCode, getOption, hasOption, removeOption, parseBlock2, createBlock2 } from '../lib/helpers'

describe('Helpers', () => {
    describe('Has Options', () => {
        it('Should return true', (done) => {
            const options = [
                { name: 'test', value: 'hello' },
                { name: 'test2', value: 'world' }
            ]
            expect(hasOption(options, 'test')).to.eql(true)
            setImmediate(done)
        })

        it('Should return null', (done) => {
            const options = [
                { name: 'test2', value: 'world' }
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

    describe('Parse Block2', () => {
        it('Should have case 3 equal 4128', (done) => {
            const buff = Buffer.from([0x01, 0x02, 0x03])
            const res = parseBlock2(buff)
            if (res != null) {
                expect(res.num).to.eql(4128)
                setImmediate(done)
            }
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

    // packetToMessage

    // removeOption

    // or

    // isOptions

    // isNumeric

    // isBoolean
})
