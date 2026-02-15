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
    private _contexts: Map<string, OSCORE>
    private _tokenToContext: Map<string, OSCORE>

    constructor () {
        super()
        this._contexts = new Map()
        this._tokenToContext = new Map()
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
     * Bind a token to a context for response encoding.
     */
    bindToken (tokenHex: string, context: OSCORE): void {
        this._tokenToContext.set(tokenHex, context)
    }

    /**
     * Look up context by token (for response encoding).
     */
    getByToken (tokenHex: string): OSCORE | undefined {
        return this._tokenToContext.get(tokenHex)
    }

    /**
     * Unbind a token (after response sent, or observe ended).
     */
    unbindToken (tokenHex: string): void {
        this._tokenToContext.delete(tokenHex)
    }

    /**
     * Listen for SSN changes across all managed contexts.
     */
    onSsnChange (cb: (recipientId: Buffer, idContext: Buffer | undefined, ssn: bigint) => void): this {
        return this.on('ssn', cb)
    }

    private _toKey (recipientId: Buffer, idContext?: Buffer): string {
        return `${recipientId.toString('hex')}:${idContext?.toString('hex') ?? ''}`
    }
}
