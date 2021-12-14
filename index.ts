/*
 * Copyright (c) 2013 - 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import Agent from './lib/agent'
import Server from './lib/server'
import IncomingMessage from './lib/incoming_message'
import OutgoingMessage from './lib/outgoing_message'
import ObserveReadStream from './lib/observe_read_stream'
import ObserveWriteStream from './lib/observe_write_stream'
import { parameters, refreshTiming, defaultTiming } from './lib/parameters'
import { isIPv6 } from 'net'
import { registerOption, registerFormat, ignoreOption } from './lib/option_converter'
import { CoapServerOptions, requestListener, CoapRequestParams, ParametersUpdate, AgentOptions, CoapPacket, Option, OptionValue } from './models/models'

export let globalAgent = new Agent({ type: 'udp4' })
export let globalAgentIPv6 = new Agent({ type: 'udp6' })

export function setGlobalAgent (agent: Agent): void {
    globalAgent = agent
}

export function setGlobalAgentV6 (agent: Agent): void {
    globalAgentIPv6 = agent
}

export function createServer (options?: CoapServerOptions | typeof requestListener, listener?: typeof requestListener): Server {
    return new Server(options, listener)
}

function _getHostname (url: URL): string {
    const hostname = url.hostname
    // Remove brackets from literal IPv6 addresses
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.substring(1, hostname.length - 1)
    }
    return hostname
}

function _getQueryParamsFromSearch (url: URL): string | undefined {
    if (url.search != null) {
        return url.search.substring(1)
    }
}

function _getPort (url: URL): number {
    if (url.port !== '') {
        return parseInt(url.port)
    } else {
        return parameters.coapPort
    }
}

function _parseUrl (url: string): CoapRequestParams {
    const requestParams: CoapRequestParams = {}
    const parsedUrl = new URL(url)
    requestParams.hostname = _getHostname(parsedUrl)
    requestParams.query = _getQueryParamsFromSearch(parsedUrl)
    requestParams.port = _getPort(parsedUrl)
    requestParams.pathname = parsedUrl.pathname
    return requestParams
}

export function request (requestParams: CoapRequestParams | string): OutgoingMessage {
    let agent: Agent
    if (typeof requestParams === 'string') {
        requestParams = _parseUrl(requestParams)
    }
    const ipv6 = isIPv6(requestParams.hostname ?? requestParams.host ?? '')
    if (requestParams.agent != null && requestParams.agent !== false) {
        agent = requestParams.agent
    } else if (requestParams.agent === false && !ipv6) {
        agent = new Agent({ type: 'udp4' })
    } else if (requestParams.agent === false && ipv6) {
        agent = new Agent({ type: 'udp6' })
    } else if (ipv6) {
        agent = globalAgentIPv6
    } else {
        agent = globalAgent
    }
    return agent.request(requestParams)
}

export {
    parameters,
    refreshTiming as updateTiming,
    defaultTiming,
    registerOption,
    registerFormat,
    ignoreOption,
    IncomingMessage,
    OutgoingMessage,
    ObserveReadStream,
    ObserveWriteStream,
    Agent,
    Server,
    ParametersUpdate,
    CoapRequestParams,
    AgentOptions,
    CoapPacket,
    Option,
    OptionValue,
    CoapServerOptions
}
