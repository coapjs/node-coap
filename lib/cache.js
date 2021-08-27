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
    delete cache[k]
}

/**
 * @class
 * @constructor
 * @template T
 * @param {number} retentionPeriod
 * @param {()=>T} factory Function which returns new cache objects
 */
function BlockCache (retentionPeriod, factory) {
    /** @type {{[k:string]:{payload:T,timeoutId:NodeJS.Timeout}}} */
    this._cache = {}
    this._retentionPeriod = retentionPeriod
    debug('Created cache with ' + (this._retentionPeriod / 1000) + 's retention period')
    this._factory = factory
}

BlockCache.prototype.reset = function () {
    for (const k in this._cache) {
        debug('clean-up cache expiry timer, key:', k)
        clearTimeout(this._cache[k].timeoutId)
        delete this._cache[k]
    }
}

/**
 * @param {string} key
 * @param {T} payload
 */
BlockCache.prototype.add = function (key, payload) {
    if (Object.prototype.hasOwnProperty.call(this._cache, key)) {
        debug('reuse old cache entry, key:', key)
        clearTimeout(this._cache[key].timeoutId)
        this._cache[key].payload = payload
    } else {
        debug('add payload to cache, key:', key)
        this._cache[key] = { payload: payload }
    }
    // setup new expiry timer
    this._cache[key].timeoutId = setTimeout(expiry, this._retentionPeriod, this._cache, key)
}

BlockCache.prototype.remove = function (key) {
    if (Object.prototype.hasOwnProperty.call(this._cache, key)) {
        debug('remove cache entry, key:', key)
        clearTimeout(this._cache[key].timeoutId)
        delete this._cache[key]
        return true
    }
    return false
}

BlockCache.prototype.contains = function (key) {
    return Object.prototype.hasOwnProperty.call(this._cache, key)
}

BlockCache.prototype.get = function (key) {
    return this._cache[key].payload
}

BlockCache.prototype.getWithDefaultInsert = function (key) {
    if (this.contains(key)) {
        return this._cache[key].payload
    } else {
        const def = this._factory()
        this.add(key, def)
        return def
    }
}

module.exports = BlockCache
