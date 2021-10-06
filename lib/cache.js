/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const debug = require('debug')('Block Cache')

function expiry (cache, k) {
    debug('delete expired cache entry, key:', k)
    cache.delete(k)
}

/**
 * @class
 * @constructor
 * @template T
 * @param {number} retentionPeriod
 * @param {()=>T} factory Function which returns new cache objects
 */
class BlockCache {
    constructor (retentionPeriod, factory) {
        /** @type {{[k:string]:{payload:T,timeoutId:NodeJS.Timeout}}} */
        this._cache = new Map()
        this._retentionPeriod = retentionPeriod
        debug(`Created cache with ${this._retentionPeriod / 1000} s retention period`)
        this._factory = factory
    }

    reset () {
        for (const [key, value] of this._cache) {
            debug('clean-up cache expiry timer, key:', key)
            clearTimeout(value.timeoutId)
            this._cache.delete(key)
        }
    }

    /**
     * @param {string} key
     * @param {T} payload
     */
    add (key, payload) {
        if (this.contains(key)) {
            debug('reuse old cache entry, key:', key)
            const entry = this._cache.get(key)
            clearTimeout(entry.timeoutId)

            entry.payload = payload
        } else {
            debug('add payload to cache, key:', key)
            this._cache.set(key, { payload })
        }
        // setup new expiry timer
        this._cache.get(key).timeoutId = setTimeout(expiry, this._retentionPeriod, this._cache, key)
    }

    remove (key) {
        if (this.contains(key)) {
            debug('remove cache entry, key:', key)
            clearTimeout(this._cache.get(key).timeoutId)
            this._cache.delete(key)
            return true
        }
        return false
    }

    contains (key) {
        return this._cache.has(key)
    }

    get (key) {
        return this._cache.get(key).payload
    }

    getWithDefaultInsert (key) {
        if (this.contains(key)) {
            return this.get(key)
        } else {
            const def = this._factory()
            this.add(key, def)
            return def
        }
    }
}

module.exports = BlockCache
