"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const helpers_1 = require("../lib/helpers");
describe('Helpers', () => {
    describe('Has Options', () => {
        it('Should return true', (done) => {
            const options = [
                { name: 'test', value: 'hello' },
                { name: 'test2', value: 'world' }
            ];
            (0, chai_1.expect)((0, helpers_1.hasOption)(options, 'test')).to.eql(true);
            setImmediate(done);
        });
        it('Should return null', (done) => {
            const options = [
                { name: 'test2', value: 'world' }
            ];
            (0, chai_1.expect)((0, helpers_1.hasOption)(options, 'test')).to.eql(null);
            setImmediate(done);
        });
    });
    describe('Get Options', () => {
        it('Should return option value', (done) => {
            const options = [
                { name: 'test', value: 'hello' },
                { name: 'test2', value: 'world' }
            ];
            (0, chai_1.expect)((0, helpers_1.getOption)(options, 'test')).to.eql('hello');
            setImmediate(done);
        });
        it('Should return null', (done) => {
            const options = [
                { name: 'test2', value: 'world' }
            ];
            (0, chai_1.expect)((0, helpers_1.getOption)(options, 'test')).to.eql(null);
            setImmediate(done);
        });
    });
    describe('Remove Options', () => {
        it('Should return true', (done) => {
            const options = [
                { name: 'test', value: 'hello' },
                { name: 'test2', value: 'world' }
            ];
            (0, chai_1.expect)((0, helpers_1.removeOption)(options, 'test')).to.eql(true);
            setImmediate(done);
        });
        it('Should return false', (done) => {
            const options = [
                { name: 'test2', value: 'world' }
            ];
            (0, chai_1.expect)((0, helpers_1.removeOption)(options, 'test')).to.eql(false);
            setImmediate(done);
        });
    });
    describe('Parse Block2', () => {
        it('Should have case 3 equal 4128', (done) => {
            const buff = Buffer.from([0x01, 0x02, 0x03]);
            const res = (0, helpers_1.parseBlock2)(buff);
            if (res != null) {
                (0, chai_1.expect)(res.num).to.eql(4128);
                setImmediate(done);
            }
        });
        it('Should return null', (done) => {
            const buff = Buffer.from([0x01, 0x02, 0x03, 0x04]);
            const res = (0, helpers_1.parseBlock2)(buff);
            (0, chai_1.expect)(res).to.eql(null);
            setImmediate(done);
        });
        it('Should parse a zero length buffer', (done) => {
            const buff = Buffer.alloc(0);
            const res = (0, helpers_1.parseBlock2)(buff);
            (0, chai_1.expect)(res).to.eql({ more: 0, num: 0, size: 0 });
            setImmediate(done);
        });
    });
    describe('Create Block2', () => {
        it('Should return a buffer carrying a block 2 value', (done) => {
            const buff = Buffer.from([0xff, 0xff, 0xe9]);
            const block = { more: 1, num: 1048574, size: 32 };
            const res = (0, helpers_1.createBlock2)(block);
            (0, chai_1.expect)(res).to.eql(buff);
            setImmediate(done);
        });
        it('Should return null', (done) => {
            const block = { more: 1, num: 1048576, size: 32 };
            const res = (0, helpers_1.createBlock2)(block);
            (0, chai_1.expect)(res).to.eql(null);
            setImmediate(done);
        });
    });
    describe('Convert Codes', () => {
        it('Should keep codes with type string', (done) => {
            (0, chai_1.expect)((0, helpers_1.toCode)('2.05')).to.eql('2.05');
            setImmediate(done);
        });
        it('Should convert numeric codes with zeros inbetween', (done) => {
            (0, chai_1.expect)((0, helpers_1.toCode)(404)).to.eql('4.04');
            setImmediate(done);
        });
        it('Should convert numeric codes', (done) => {
            (0, chai_1.expect)((0, helpers_1.toCode)(415)).to.eql('4.15');
            setImmediate(done);
        });
    });
    // genAck
    // packetToMessage
    // removeOption
    // or
    // isOptions
    // isNumeric
    // isBoolean
});
//# sourceMappingURL=helpers.js.map