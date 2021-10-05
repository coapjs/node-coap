/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import crypto from 'crypto'
import { parse, ParsedPacket } from 'coap-packet'
import { or, isOption } from './helpers'
import { MiddlewareParameters } from '../models/models'

type middlewareCallback = (nullOrError: null | Error) => void

class MiddleWareError extends Error {
    /**
     * Creates a new `MiddleWareError`.
     *
     * @param middlewareName The middleware function throwing this error.
     */
    constructor (middlewareName: string) {
        super(`${middlewareName}: No CoAP Packet found!`)
    }
}

export function parseRequest (request: MiddlewareParameters, next: middlewareCallback): void {
    try {
        request.packet = parse(request.raw)
        next(null)
    } catch (err) {
        next(err)
    }
}

export function handleServerRequest (request: MiddlewareParameters, next: middlewareCallback): void {
    if (request.proxy != null) {
        return next(null)
    }

    if (request.packet == null) {
        return next(new MiddleWareError('handleServerRequest'))
    }

    try {
        request.server._handle(request.packet, request.rsinfo)
        next(null)
    } catch (err) {
        next(err)
    }
}

export function proxyRequest (request: MiddlewareParameters, next: middlewareCallback): void {
    if (request.packet == null) {
        return next(new MiddleWareError('proxyRequest'))
    }

    for (let i = 0; i < request.packet.options.length; i++) {
        const option = request.packet.options[i]
        if (typeof option.name !== 'string') {
            continue
        } else if (option.name.toLowerCase() === 'proxy-uri') {
            request.proxy = option.value.toString()
        }
    }

    if (request.proxy != null) {
        if (request.packet.token.length === 0) {
            request.packet.token = crypto.randomBytes(8)
        }

        request.server._proxiedRequests.set(request.packet.token.toString('hex'), request)
        request.server._sendProxied(request.packet, request.proxy, next)
    } else {
        next(null)
    }
}

function isObserve (packet: ParsedPacket): boolean {
    return packet.options.map(isOption('Observe')).reduce(or, false)
}

export function handleProxyResponse (request: MiddlewareParameters, next: middlewareCallback): void {
    if (request.proxy != null) {
        return next(null)
    }

    if (request.packet == null) {
        return next(new MiddleWareError('handleProxyResponse'))
    }

    const originalProxiedRequest = request.server._proxiedRequests.get(request.packet.token.toString('hex'))
    if (originalProxiedRequest != null) {
        request.server._sendReverseProxied(request.packet, originalProxiedRequest.rsinfo)

        if (!isObserve(request.packet)) {
            request.server._proxiedRequests.delete(request.packet.token.toString('hex'))
        }
    }

    next(null)
}
