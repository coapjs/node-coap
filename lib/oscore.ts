/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { EventEmitter } from 'events'
import type { OSCORE } from 'coap-oscore'

/**
 * Server-side manager for multiple OSCORE security contexts.
 * Contexts are keyed by recipientId:idContext (hex) — matching
 * the KID + KID Context fields from the OSCORE option in incoming requests.
 */
export class SecurityContextManager extends EventEmitter {
    private static readonly MAX_TOKEN_BINDINGS = 10000
    // Echo challenges only need to live long enough for the client to
    // round-trip the nonce back; if the client never replies, the entry
    // is evicted so the map can't grow unbounded.
    private static readonly PENDING_ECHO_TTL_MS = 30_000
    private _contexts: Map<string, OSCORE>
    private _tokenToContext: Map<string, OSCORE>
    private _pendingEchoNonces: Map<string, { nonce: Buffer, timer: NodeJS.Timeout }>

    constructor () {
        super()
        this._contexts = new Map()
        this._tokenToContext = new Map()
        this._pendingEchoNonces = new Map()
    }

    /**
     * Register an OSCORE context for a client.
     * @param instance  Pre-built OSCORE instance
     * @param recipientId  The client's Sender ID (= server's Recipient ID). Used for lookup.
     * @param idContext  Optional ID Context for disambiguation
     */
    addContext (instance: OSCORE, recipientId: Buffer, idContext?: Buffer): this {
        const key = this._toKey(recipientId, idContext)
        this._contexts.set(key, instance)

        instance.on('ssn', (ssn: bigint) => {
            this.emit('ssn', recipientId, idContext, ssn)
        })

        return this
    }

    /**
     * Remove a context.
     */
    removeContext (recipientId: Buffer, idContext?: Buffer): boolean {
        const key = this._toKey(recipientId, idContext)
        return this._contexts.delete(key)
    }

    /**
     * Look up context by KID/KID-Context extracted from OSCORE option.
     */
    getByKid (kid: Buffer, kidContext?: Buffer): OSCORE | undefined {
        const key = this._toKey(kid, kidContext)
        return this._contexts.get(key)
    }

    /**
     * Compute a namespaced key for the token-to-context map.
     * Prevents collisions when two clients use the same token.
     */
    private _tokenKey (senderId: Buffer, tokenHex: string): string {
        return `${senderId.toString('hex')}:${tokenHex}`
    }

    /**
     * Bind a token to a context for response encoding.
     */
    bindToken (tokenHex: string, context: OSCORE, senderId: Buffer): void {
        // Evict oldest if at capacity
        if (this._tokenToContext.size >= SecurityContextManager.MAX_TOKEN_BINDINGS) {
            const firstKey = this._tokenToContext.keys().next().value
            if (firstKey != null) {
                this._tokenToContext.delete(firstKey)
            }
        }
        this._tokenToContext.set(this._tokenKey(senderId, tokenHex), context)
    }

    /**
     * Look up context by token (for response encoding).
     */
    getByToken (tokenHex: string, senderId: Buffer): OSCORE | undefined {
        return this._tokenToContext.get(this._tokenKey(senderId, tokenHex))
    }

    /**
     * Unbind a token (after response sent, or observe ended).
     */
    unbindToken (tokenHex: string, senderId: Buffer): void {
        this._tokenToContext.delete(this._tokenKey(senderId, tokenHex))
    }

    /**
     * Store a pending Echo nonce for a given security context.
     * The entry self-evicts after PENDING_ECHO_TTL_MS to prevent the map
     * from accumulating entries when peers never reply to the challenge.
     */
    storePendingEcho (recipientId: Buffer, idContext: Buffer | undefined, nonce: Buffer): void {
        const key = this._toKey(recipientId, idContext)
        const existing = this._pendingEchoNonces.get(key)
        if (existing != null) {
            clearTimeout(existing.timer)
        }
        const timer = setTimeout(() => {
            this._pendingEchoNonces.delete(key)
        }, SecurityContextManager.PENDING_ECHO_TTL_MS)
        if (typeof timer.unref === 'function') {
            timer.unref()
        }
        this._pendingEchoNonces.set(key, { nonce, timer })
    }

    /**
     * Retrieve the pending Echo nonce for a given security context.
     */
    getPendingEcho (recipientId: Buffer, idContext: Buffer | undefined): Buffer | undefined {
        const key = this._toKey(recipientId, idContext)
        return this._pendingEchoNonces.get(key)?.nonce
    }

    /**
     * Clear the pending Echo nonce for a given security context.
     */
    clearPendingEcho (recipientId: Buffer, idContext: Buffer | undefined): void {
        const key = this._toKey(recipientId, idContext)
        const entry = this._pendingEchoNonces.get(key)
        if (entry != null) {
            clearTimeout(entry.timer)
            this._pendingEchoNonces.delete(key)
        }
    }

    private _toKey (recipientId: Buffer, idContext?: Buffer): string {
        return `${recipientId.toString('hex')}:${idContext?.toString('hex') ?? ''}`
    }
}
