/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { parameters } from './parameters'
import { BlockCacheMap } from '../models/models'
import Debug from 'debug'
const debug = Debug('Block Cache')

function expiry<T> (cache: BlockCacheMap<T>, k: string): void {
    debug('delete expired cache entry, key:', k)
    cache.delete(k)
}

class BlockCache<T> {
    _retentionPeriod: number
    _cache: BlockCacheMap<T>
    _factory: () => T

    /**
     *
     * @param retentionPeriod
     * @param factory Function which returns new cache objects
     */
    constructor (retentionPeriod: number | null | undefined, factory: () => T) {
        this._cache = new Map()
        if (retentionPeriod != null) {
            this._retentionPeriod = retentionPeriod
        } else {
            this._retentionPeriod = parameters.exchangeLifetime * 1000
        }

        debug(`Created cache with ${this._retentionPeriod / 1000} s retention period`)
        this._factory = factory
    }

    private clearTimeout (key: string): void {
        const timeoutId = this._cache.get(key)?.timeoutId
        if (timeoutId != null) {
            clearTimeout(timeoutId)
        }
    }

    reset (): void {
        for (const key of this._cache.keys()) {
            debug('clean-up cache expiry timer, key:', key)
            this.remove(key)
        }
    }

    /**
     * @param key
     * @param payload
     */
    add (key: string, payload: T): void {
        const entry = this._cache.get(key)
        if (entry != null) {
            debug('reuse old cache entry, key:', key)
            clearTimeout(entry.timeoutId)
        } else {
            debug('add payload to cache, key:', key)
        }
        // setup new expiry timer
        const timeoutId = setTimeout(expiry, this._retentionPeriod, this._cache, key)
        this._cache.set(key, { payload, timeoutId })
    }

    remove (key: string): boolean {
        if (this._cache.delete(key)) {
            debug('remove cache entry, key:', key)
            this.clearTimeout(key)
            return true
        }
        return false
    }

    contains (key: string): boolean {
        return this._cache.has(key)
    }

    get (key: string): T | undefined {
        return this._cache.get(key)?.payload
    }

    getWithDefaultInsert (key: string | null): T {
        if (key == null) {
            return this._factory()
        }
        const value = this.get(key)
        if (value != null) {
            return value
        } else {
            const def = this._factory()
            this.add(key, def)
            return def
        }
    }
}

export default BlockCache
