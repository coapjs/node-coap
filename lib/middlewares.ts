/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import crypto from 'crypto'
import { parse, generate, ParsedPacket } from 'coap-packet'
import { Socket } from 'dgram'
import { or, isOption } from './helpers'
import { MiddlewareParameters } from '../models/models'
import { getOscoreOptionValue, parseOscoreOption } from './oscore_helpers'

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
        request.server._handle(
            request.packet,
            request.rsinfo,
            request.wasOscoreProtected ?? false,
            request.oscoreSenderId,
            request.oscoreIdContext
        )
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

export function oscoreDecryptRequest (request: MiddlewareParameters, next: middlewareCallback): void {
    if (request.packet == null) {
        return next(null)
    }

    // Skip OSCORE for proxied requests
    if (request.proxy != null) {
        return next(null)
    }

    const oscoreOptValue = getOscoreOptionValue(request.packet)

    if (oscoreOptValue == null) {
        // Not OSCORE-protected
        if (request.server._oscoreOnly) {
            request.server._sendError(
                Buffer.from('OSCORE required'),
                request.rsinfo, request.packet, '4.01'
            )
            return
        }
        return next(null)
    }

    const { kid, kidContext } = parseOscoreOption(oscoreOptValue)
    const ctxMgr = request.server._oscoreContextManager

    if (ctxMgr == null || kid == null) {
        request.server._sendError(
            Buffer.from('Unauthorized'),
            request.rsinfo, request.packet, '4.01'
        )
        return
    }

    const oscore = ctxMgr.getByKid(kid, kidContext ?? undefined)
    if (oscore == null) {
        request.server._sendError(
            Buffer.from('Unknown security context'),
            request.rsinfo, request.packet, '4.01'
        )
        return
    }

    oscore.decode(request.raw)
        .then((decoded) => {
            request.raw = decoded
            request.packet = parse(decoded)
            request.wasOscoreProtected = true
            request.oscoreContext = oscore
            request.oscoreSenderId = kid
            request.oscoreIdContext = kidContext ?? undefined

            const tokenHex = request.packet.token?.toString('hex')
            if (tokenHex != null && tokenHex.length > 0) {
                ctxMgr.bindToken(tokenHex, oscore)
            }

            next(null)
        })
        .catch((err) => {
            if (err?.status === 201) {
                // FIRST_REQUEST_AFTER_REBOOT — send 4.01 with Echo challenge
                const echoNonce = crypto.randomBytes(8)
                const errPkt = generate({
                    code: '4.01',
                    ack: request.packet?.confirmable === true,
                    messageId: request.packet?.messageId,
                    token: request.packet?.token,
                    options: [{ name: '252' as any, value: echoNonce }]
                })
                if (request.server._sock instanceof Socket) {
                    request.server._sock.send(
                        errPkt, 0, errPkt.length,
                        request.rsinfo.port, request.rsinfo.address
                    )
                }
                return
            }
            request.server._sendError(
                Buffer.from('OSCORE decode failed'),
                request.rsinfo, request.packet, '4.01'
            )
        })
}
