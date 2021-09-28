/*
 * Copyright (c) 2021 node-coap contributors.
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
import { CoapMethod, OptionName } from 'coap-packet'
import { Socket } from 'dgram'

export type OptionValue = string | number | Buffer | Array<Buffer>

export interface Option {
    name: number | OptionName;
    value: OptionValue;
}

export function setOption (name: OptionName, value: OptionValue): void
export function getOption (options: Array<Option>, name: OptionName): OptionValue

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
}

export interface CoapServerOptions {
    type?: 'udp4' | 'udp6',
    proxy?: boolean,
    multicastAddress?: string,
    multicastInterface?: string,
    piggybackReplyMs?: number,
    sendAcksForNonConfirmablePackets?: boolean,
    clientIdentifier?: (request: IncomingMessage) => string,
    reuseAddr?: boolean
}

export interface AgentOptions {
    type?: 'udp4' | 'udp6',
    socket?: Socket,
}

export const parameters: Parameters
export const globalAgent: Agent
export const globalAgentIPv6: Agent

export { IncomingMessage, OutgoingMessage, ObserveReadStream, Agent, Server }

export function requestListener(req: IncomingMessage, res: OutgoingMessage): void
export function updateTiming(values: Parameters): void
export function defaultTiming(): void
export function registerOption(name: string, toBinary: (value: string | number) => Buffer, fromBinary: (value: Buffer) => string | number): void
export function registerFormat(name: string, value: number): void
export function ignoreOption(name: string): void
export function request(requestParams: CoapRequestParams | string): any
export function createServer(options?: CoapServerOptions | typeof requestListener, listener?: typeof requestListener): Server
