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
    private _contexts: Map<string, OSCORE>
    private _tokenToContext: Map<string, OSCORE>
    private _pendingEchoNonces: Map<string, Buffer>

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
     * Listen for SSN changes across all managed contexts.
     */
    onSsnChange (cb: (recipientId: Buffer, idContext: Buffer | undefined, ssn: bigint) => void): this {
        return this.on('ssn', cb)
    }

    /**
     * Store a pending Echo nonce for a given security context.
     */
    storePendingEcho (recipientId: Buffer, idContext: Buffer | undefined, nonce: Buffer): void {
        const key = this._toKey(recipientId, idContext)
        this._pendingEchoNonces.set(key, nonce)
    }

    /**
     * Retrieve the pending Echo nonce for a given security context.
     */
    getPendingEcho (recipientId: Buffer, idContext: Buffer | undefined): Buffer | undefined {
        const key = this._toKey(recipientId, idContext)
        return this._pendingEchoNonces.get(key)
    }

    /**
     * Clear the pending Echo nonce for a given security context.
     */
    clearPendingEcho (recipientId: Buffer, idContext: Buffer | undefined): void {
        const key = this._toKey(recipientId, idContext)
        this._pendingEchoNonces.delete(key)
    }

    private _toKey (recipientId: Buffer, idContext?: Buffer): string {
        return `${recipientId.toString('hex')}:${idContext?.toString('hex') ?? ''}`
    }
}
