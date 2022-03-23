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
exports.handleProxyResponse = exports.proxyRequest = exports.handleServerRequest = exports.parseRequest = void 0;
const crypto_1 = __importDefault(require("crypto"));
const coap_packet_1 = require("coap-packet");
const helpers_1 = require("./helpers");
class MiddleWareError extends Error {
    /**
     * Creates a new `MiddleWareError`.
     *
     * @param middlewareName The middleware function throwing this error.
     */
    constructor(middlewareName) {
        super(`${middlewareName}: No CoAP Packet found!`);
    }
}
function parseRequest(request, next) {
    try {
        request.packet = (0, coap_packet_1.parse)(request.raw);
        next(null);
    }
    catch (err) {
        next(err);
    }
}
exports.parseRequest = parseRequest;
function handleServerRequest(request, next) {
    if (request.proxy != null) {
        return next(null);
    }
    if (request.packet == null) {
        return next(new MiddleWareError('handleServerRequest'));
    }
    try {
        request.server._handle(request.packet, request.rsinfo);
        next(null);
    }
    catch (err) {
        next(err);
    }
}
exports.handleServerRequest = handleServerRequest;
function proxyRequest(request, next) {
    if (request.packet == null) {
        return next(new MiddleWareError('proxyRequest'));
    }
    for (let i = 0; i < request.packet.options.length; i++) {
        const option = request.packet.options[i];
        if (typeof option.name !== 'string') {
            continue;
        }
        else if (option.name.toLowerCase() === 'proxy-uri') {
            request.proxy = option.value.toString();
        }
    }
    if (request.proxy != null) {
        if (request.packet.token.length === 0) {
            request.packet.token = crypto_1.default.randomBytes(8);
        }
        request.server._proxiedRequests.set(request.packet.token.toString('hex'), request);
        request.server._sendProxied(request.packet, request.proxy, next);
    }
    else {
        next(null);
    }
}
exports.proxyRequest = proxyRequest;
function isObserve(packet) {
    return packet.options.map((0, helpers_1.isOption)('Observe')).reduce(helpers_1.or, false);
}
function handleProxyResponse(request, next) {
    if (request.proxy != null) {
        return next(null);
    }
    if (request.packet == null) {
        return next(new MiddleWareError('handleProxyResponse'));
    }
    const originalProxiedRequest = request.server._proxiedRequests.get(request.packet.token.toString('hex'));
    if (originalProxiedRequest != null) {
        request.server._sendReverseProxied(request.packet, originalProxiedRequest.rsinfo);
        if (!isObserve(request.packet)) {
            request.server._proxiedRequests.delete(request.packet.token.toString('hex'));
        }
    }
    next(null);
}
exports.handleProxyResponse = handleProxyResponse;
//# sourceMappingURL=middlewares.js.map