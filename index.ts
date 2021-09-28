'use strict'
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
import { CoapMethod, OptionName } from 'coap-packet'
import { Socket } from 'dgram'

const ObserveReadStream = require("./lib/observe_read_stream")
const ObserveWriteStream = require("./lib/observe_write_stream")
const OutgoingMessage = require("./lib/outgoing_message")
const IncomingMessage = require("./lib/incoming_message")
const Server = require("./lib/server")
const Agent = require("./lib/agent")

const optionsConv = require('./lib/option_converter')
const parameters = require('./lib/parameters')
const net = require('net')


export type OptionValue = string | number | Buffer | Array<Buffer>

export interface Option {
    name: number | OptionName;
    value: OptionValue;
}

export { IncomingMessage, OutgoingMessage, ObserveReadStream, ObserveWriteStream, Agent, Server }

export interface Parameters {
    ackTimeout?: number,
    ackRandomFactor?: number,
    maxRetransmit?: number,
    maxLatency?: number,
    piggybackReplyMs?: number,
    coapPort?: number,
    maxPacketSize?: number,
    sendAcksForNonConfirmablePackets?: boolean
}

export interface CoapRequestParams {
    host?: string,
    hostname?: string,
    port?: number | string,
    method?: CoapMethod,
    confirmable?: boolean,
    observe?: 0 | 1 | boolean,
    pathname?: string,
    query?: string,
    options?: Partial<Record<OptionName, OptionValue>>,
    headers?: Partial<Record<OptionName, OptionValue>>,
    agent?: typeof Agent | false,
    proxyUri?: string,
    multicast?: boolean,
    multicastTimeout?: number,
    retrySend?: number,
}

export interface CoapServerOptions {
    type?: 'udp4' | 'udp6',
    proxy?: boolean,
    multicastAddress?: string,
    multicastInterface?: string,
    piggybackReplyMs?: number,
    sendAcksForNonConfirmablePackets?: boolean,
    clientIdentifier?: (request: typeof IncomingMessage) => string,
    reuseAddr?: boolean
}

export interface AgentOptions {
    type?: 'udp4' | 'udp6',
    socket?: Socket,
}

function _getHostname (url: URL) {
    const hostname = url.hostname

    // Remove brackets from literal IPv6 addresses
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.substring(1, hostname.length - 1)
    }

    return hostname
}

function _getQueryParamsFromSearch (url: URL) {
    if (url.search != null) {
        return url.search.substring(1)
    }
}

function _parseUrl (url: string) {
    const requestParams: CoapRequestParams = {}

    const parsedUrl = new URL(url)

    requestParams.hostname = _getHostname(parsedUrl)
    requestParams.query = _getQueryParamsFromSearch(parsedUrl)
    requestParams.port = parsedUrl.port
    requestParams.pathname = parsedUrl.pathname

    return requestParams
}

export const globalAgent = new Agent({ type: 'udp4' })
export const globalAgentV6 = new Agent({ type: 'udp6' })

export function request (requestParams: CoapRequestParams) {
    let agent: typeof Agent

    if (typeof requestParams === 'string') {
        requestParams = _parseUrl(requestParams)
    }

    const ipv6 = net.isIPv6(requestParams.hostname || requestParams.host)

    if (requestParams.agent) {
        agent = requestParams.agent
    } else if (requestParams.agent === false && !ipv6) {
        agent = new Agent({ type: 'udp4' })
    } else if (requestParams.agent === false && ipv6) {
        agent = new Agent({ type: 'udp6' })
    } else if (ipv6) {
        agent = globalAgentV6
    } else {
        agent = globalAgent
    }

    return agent.request(requestParams)
}

export declare function requestListener(req: typeof IncomingMessage, res: typeof OutgoingMessage): void

module.exports.createServer = (options?: CoapServerOptions | typeof requestListener, listener?: typeof requestListener) => {
    return new Server(options, listener)
}


module.exports.registerOption = optionsConv.registerOption
module.exports.registerFormat = optionsConv.registerFormat
module.exports.ignoreOption = optionsConv.ignoreOption

module.exports.parameters = parameters
module.exports.updateTiming = parameters.refreshTiming
module.exports.defaultTiming = parameters.defaultTiming
