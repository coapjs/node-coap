/*
 * Copyright (c) 2013 - 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { CoapMethod, OptionName, Packet, ParsedPacket } from 'coap-packet'
import { Socket } from 'dgram'
import { AddressInfo } from 'net'
import type { OSCORE } from 'coap-oscore'
import Agent from '../lib/agent'
import IncomingMessage from '../lib/incoming_message'
import OutgoingMessage from '../lib/outgoing_message'
import CoAPServer from '../lib/server'
import type { SecurityContextManager } from '../lib/oscore'

export declare function requestListener (req: IncomingMessage, res: OutgoingMessage): void

export type OptionValue = null | string | number | Buffer | Buffer[]
export type BlockCacheMap<T> = Map<string, { payload: T, timeoutId: NodeJS.Timeout }>
export type CoapOptions = Partial<Record<OptionName, OptionValue>>

export interface Option {
    name: number | OptionName | string
    value: OptionValue
}

export interface Block {
    more: number
    num: number
    size: number
}

/**
 * Payload of the `block` event emitted by an outgoing request for each
 * Block1 (upload) or Block2 (download) transfer. Use it for progress
 * reporting on large transfers.
 *
 * - `direction`: `'sent'` for an outbound Block1 chunk, `'received'` for
 *   an inbound Block2 chunk.
 * - `num`: 0-indexed block number.
 * - `more`: `true` while further blocks are expected.
 * - `blockSize`: block size in bytes (16, 32, 64, 128, 256, 512, or 1024).
 * - `bytesTransferred`: cumulative bytes transferred including this block.
 * - `totalBytes`: total payload size in bytes. Known up-front for Block1;
 *   for Block2 it is only set on the final block.
 */
export interface BlockEvent {
    direction: 'sent' | 'received'
    num: number
    more: boolean
    blockSize: number
    bytesTransferred: number
    totalBytes?: number
}

export interface MiddlewareParameters {
    raw: Buffer
    rsinfo: AddressInfo
    server: CoAPServer
    packet?: ParsedPacket
    proxy?: string
    oscoreContext?: OSCORE
    wasOscoreProtected?: boolean
    oscoreSenderId?: Buffer
    oscoreIdContext?: Buffer
}

export interface CoapPacket extends Packet {
    piggybackReplyMs?: number
    url?: string
}

export interface ParametersUpdate {
    ackTimeout?: number
    ackRandomFactor?: number
    maxRetransmit?: number
    nstart?: number
    defaultLeisure?: number
    probingRate?: number
    maxLatency?: number
    piggybackReplyMs?: number
    maxPayloadSize?: number
    maxMessageSize?: number
    sendAcksForNonConfirmablePackets?: boolean
    pruneTimerPeriod?: number
}

export interface Parameters {
    ackTimeout: number
    ackRandomFactor: number
    maxRetransmit: number
    nstart: number
    defaultLeisure: number
    probingRate: number
    maxLatency: number
    piggybackReplyMs: number
    nonLifetime: number
    coapPort: number
    maxPayloadSize: number
    maxMessageSize: number
    sendAcksForNonConfirmablePackets: boolean
    pruneTimerPeriod: number
    maxTransmitSpan: number
    maxTransmitWait: number
    processingDelay: number
    exchangeLifetime: number
    maxRTT: number
    defaultTiming?: () => void
    refreshTiming?: (parameters?: Parameters) => void
}

export interface CoapRequestParams {
    host?: string
    hostname?: string
    port?: number
    method?: CoapMethod
    confirmable?: boolean
    observe?: 0 | 1 | boolean | string
    pathname?: string
    query?: string
    options?: Partial<Record<OptionName, OptionValue>>
    headers?: Partial<Record<OptionName, OptionValue>>
    agent?: Agent | false
    proxyUri?: string
    multicast?: boolean
    multicastTimeout?: number
    retrySend?: number
    token?: Buffer
    contentFormat?: string | number
    accept?: string | number
}

export interface CoapServerOptions {
    type?: 'udp4' | 'udp6'
    proxy?: boolean
    multicastAddress?: string
    multicastInterface?: string
    piggybackReplyMs?: number
    sendAcksForNonConfirmablePackets?: boolean
    clientIdentifier?: (request: IncomingMessage) => string
    reuseAddr?: boolean
    cacheSize?: number
    oscoreContexts?: SecurityContextManager
    oscoreOnly?: boolean
    parameters?: ParametersUpdate
}

export interface AgentOptions {
    type?: 'udp4' | 'udp6'
    socket?: Socket
    port?: number
    oscoreOnly?: boolean
    parameters?: ParametersUpdate
}
