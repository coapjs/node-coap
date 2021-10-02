/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { expect } from 'chai'
import BlockCache from '../lib/cache'

describe('Cache', () => {
    describe('Block Cache', () => {
        it('Should set up empty cache object', (done) => {
            const b = new BlockCache<{}>(10000, () => { return {} })
            expect(b._cache.size).to.eql(0)
            setImmediate(done)
        })
    })

    describe('Reset', () => {
        it('Should reset all caches', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.add('test', { payload: 'test' })
            b.reset()
            expect(b._cache.size).to.eql(0)
            setImmediate(done)
        })
    })

    describe('Add', () => {
        it('Should add to cache', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.add('test', { payload: 'test' })
            expect(b.contains('test')).to.equal(true)
            setImmediate(done)
        })
    // reuse old cache entry
    })

    describe('Remove', () => {
        it('Should from cache', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.add('test', { payload: 'test' })
            b.add('test2', { payload: 'test2' })
            b.remove('test')
            expect(b.contains('test')).to.equal(false)
            setImmediate(done)
        })
    })

    describe('Contains', () => {
        it('Should check if value exists & return true', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.add('test', { payload: 'test' })
            expect(b.contains('test')).to.eql(true)
            setImmediate(done)
        })

        it('Should check if value exists & return false', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.add('test', { payload: 'test' })
            expect(b.contains('test2')).to.eql(false)
            setImmediate(done)
        })
    })

    describe('Get', () => {
        it('Should return payload from cache', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.add('test', { payload: 'test' })
            expect(b.get('test')).to.eql({ payload: 'test' })
            setImmediate(done)
        })
    })

    describe('Get with default insert', () => {
        it('Should return payload from cache if it exists', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.add('test', { payload: 'test' })
            expect(b.getWithDefaultInsert('test')).to.eql({ payload: 'test' })
            setImmediate(done)
        })

        it('Should add to cache if it doesnt exist', (done) => {
            const b = new BlockCache<{payload: string} | null>(10000, () => { return null })
            b.getWithDefaultInsert('test')
            expect(b.contains('test')).to.equal(true)
            setImmediate(done)
        })
    })
})
