"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const parameters_1 = require("./parameters");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('Block Cache');
function expiry(cache, k) {
    debug('delete expired cache entry, key:', k);
    cache.delete(k);
}
class BlockCache {
    /**
     *
     * @param retentionPeriod
     * @param factory Function which returns new cache objects
     */
    constructor(retentionPeriod, factory) {
        this._cache = new Map();
        if (retentionPeriod != null) {
            this._retentionPeriod = retentionPeriod;
        }
        else {
            this._retentionPeriod = parameters_1.parameters.exchangeLifetime * 1000;
        }
        debug(`Created cache with ${this._retentionPeriod / 1000} s retention period`);
        this._factory = factory;
    }
    clearTimeout(key) {
        var _a;
        const timeoutId = (_a = this._cache.get(key)) === null || _a === void 0 ? void 0 : _a.timeoutId;
        if (timeoutId != null) {
            clearTimeout(timeoutId);
        }
    }
    reset() {
        for (const key of this._cache.keys()) {
            debug('clean-up cache expiry timer, key:', key);
            this.remove(key);
        }
    }
    /**
     * @param key
     * @param payload
     */
    add(key, payload) {
        const entry = this._cache.get(key);
        if (entry != null) {
            debug('reuse old cache entry, key:', key);
            clearTimeout(entry.timeoutId);
        }
        else {
            debug('add payload to cache, key:', key);
        }
        // setup new expiry timer
        const timeoutId = setTimeout(expiry, this._retentionPeriod, this._cache, key);
        this._cache.set(key, { payload, timeoutId });
    }
    remove(key) {
        if (this._cache.delete(key)) {
            debug('remove cache entry, key:', key);
            this.clearTimeout(key);
            return true;
        }
        return false;
    }
    contains(key) {
        return this._cache.has(key);
    }
    get(key) {
        var _a;
        return (_a = this._cache.get(key)) === null || _a === void 0 ? void 0 : _a.payload;
    }
    getWithDefaultInsert(key) {
        if (key == null) {
            return this._factory();
        }
        const value = this.get(key);
        if (value != null) {
            return value;
        }
        else {
            const def = this._factory();
            this.add(key, def);
            return def;
        }
    }
}
exports.default = BlockCache;
//# sourceMappingURL=cache.js.map