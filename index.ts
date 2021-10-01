/*
 * Copyright (c) 2013 - 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import optionsConv = require('./lib/option_converter')
import Agent = require('./lib/agent')
import Server = require('./lib/server')
import IncomingMessage = require('./lib/incoming_message')
import OutgoingMessage = require('./lib/outgoing_message')
import ObserveReadStream = require('./lib/observe_read_stream')
import ObserveWriteStream = require('./lib/observe_write_stream')
import { parameters, refreshTiming, defaultTiming } from './lib/parameters'
import { CoapMethod, NamedOption, OptionName, Packet } from 'coap-packet'
import { Socket } from 'dgram'
import { isIPv6 } from "net"

export type OptionValue = string | number | Buffer | Array<Buffer>

export interface Option {
    name: number | OptionName | string;
    value: OptionValue;
}

export function createServer(options?: CoapServerOptions | typeof requestListener, listener?: typeof requestListener): Server {
    return new Server(options, listener)
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
    requestParams.port = parseInt(parsedUrl.port)
    requestParams.pathname = parsedUrl.pathname
    return requestParams
}

export function request (requestParams: CoapRequestParams | string): any {
    let agent: Agent
    if (typeof requestParams === 'string') {
        requestParams = _parseUrl(requestParams)
    }
    const ipv6 = isIPv6(requestParams.hostname || requestParams.host)
    if (requestParams.agent) {
        agent = requestParams.agent
    } else if (requestParams.agent === false && !ipv6) {
        agent = new Agent({ type: 'udp4' })
    } else if (requestParams.agent === false && ipv6) {
        agent = new Agent({ type: 'udp6' })
    } else if (ipv6) {
        agent = exports.globalAgentIPv6
    } else {
        agent = exports.globalAgent
    }
    return agent.request(requestParams)
}

export type CoapOptions = Partial<Record<OptionName, OptionValue>>

export interface CoapPacket extends Packet {
    piggybackReplyMs?: number,
    url?: string,
}

export type PrintablePacket = Omit<CoapPacket, 'token' | 'payload' | 'options'> & {
    token?: Buffer | string,
    payload?: Buffer | string,
    options?: (NamedOption | Option)[] | Partial<Record<OptionName | string | number, string | number>>
}

export interface Parameters {
    ackTimeout?: number,
    ackRandomFactor?: number,
    maxRetransmit?: number,
    maxLatency?: number,
    piggybackReplyMs?: number,
    coapPort?: number,
    maxPacketSize?: number,
    sendAcksForNonConfirmablePackets?: boolean,
    pruneTimerPeriod?: number,
    maxTransmitSpan?: number,
    maxTransmitWait?: number,
    processingDelay?: number,
    exchangeLifetime?: number,
    maxRTT?: number,
    defaultTiming?(): void,
    refreshTiming?(parameters?: Parameters): void,
}

export interface CoapRequestParams {
    host?: string,
    hostname?: string,
    port?: number,
    method?: CoapMethod,
    confirmable?: boolean,
    observe?: 0 | 1 | boolean,
    pathname?: string,
    query?: string,
    options?: Partial<Record<OptionName, OptionValue>>,
    headers?: Partial<Record<OptionName, OptionValue>>,
    agent?: Agent | false,
    proxyUri?: string,
    multicast?: boolean,
    multicastTimeout?: number,
    retrySend?: number,
    token?: Buffer,
}

export interface CoapServerOptions {
    type?: 'udp4' | 'udp6',
    proxy?: boolean,
    multicastAddress?: string,
    multicastInterface?: string,
    piggybackReplyMs?: number,
    sendAcksForNonConfirmablePackets?: boolean,
    clientIdentifier?: (request: IncomingMessage) => string,
    reuseAddr?: boolean,
    cacheSize?: number,
}

export interface AgentOptions {
    type?: 'udp4' | 'udp6',
    socket?: Socket,
    port?: number,
}

export let globalAgent = new Agent( { type: 'udp4' })
export let globalAgentIPv6 = new Agent( { type: 'udp6' })
export const registerOption = optionsConv.registerOption
export const registerFormat = optionsConv.registerFormat
export const ignoreOption = optionsConv.ignoreOption
export { parameters, refreshTiming as updateTiming, defaultTiming }
export { IncomingMessage, OutgoingMessage, ObserveReadStream, ObserveWriteStream, Agent, Server }
export declare function requestListener(req: IncomingMessage, res: OutgoingMessage): void
export declare function setOption (name: OptionName, value: OptionValue): void
export declare function getOption (options: Array<Option>, name: OptionName): OptionValue
