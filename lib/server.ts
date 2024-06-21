/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import { EventEmitter } from 'events'
import { isIPv6, type AddressInfo } from 'net'
import { type CoapServerOptions, type requestListener, type CoapPacket, type Block, type MiddlewareParameters } from '../models/models'
import BlockCache from './cache'
import OutgoingMessage from './outgoing_message'
import { Socket, createSocket, type SocketOptions } from 'dgram'
import { LRUCache } from 'lru-cache'
import os from 'os'
import IncomingMessage from './incoming_message'
import ObserveStream from './observe_write_stream'
import RetrySend from './retry_send'
import { handleProxyResponse, handleServerRequest, parseRequest, proxyRequest } from './middlewares'
import { parseBlockOption } from './block'
import { generate, type NamedOption, type Option, type ParsedPacket } from 'coap-packet'
import { parseBlock2, createBlock2, getOption, isNumeric, isBoolean } from './helpers'
import { parameters } from './parameters'
import series from 'fastseries'
import Debug from 'debug'
const debug = Debug('CoAP Server')

function handleEnding (err: Error): void {
    if (err != null) {
        this.server._sendError(
            Buffer.from(err.message),
            this.rsinfo,
            this.packet
        )
    }
}

function removeProxyOptions (packet: CoapPacket): CoapPacket {
    const cleanOptions: Array<Option | NamedOption> = []
    if (packet.options == null) {
        packet.options = []
    }

    for (let i = 0; i < packet.options.length; i++) {
        const optionName = packet.options[i].name
        if (
            typeof optionName === 'string' &&
            optionName.toLowerCase() !== 'proxy-uri' &&
            optionName.toLowerCase() !== 'proxy-scheme'
        ) {
            cleanOptions.push(packet.options[i])
        }
    }

    packet.options = cleanOptions

    return packet
}

function allAddresses (type): string[] {
    let family = 'IPv4'
    if (type === 'udp6') {
        family = 'IPv6'
    }
    const addresses: string[] = []
    const macs: string[] = []
    const interfaces = os.networkInterfaces()
    for (const ifname in interfaces) {
        if (ifname in interfaces) {
            interfaces[ifname]?.forEach((a) => {
                // Checking for repeating MAC address to avoid trying to listen on same interface twice
                if (a.family === family && !macs.includes(a.mac)) {
                    addresses.push(a.address)
                    macs.push(a.mac)
                }
            })
        }
    }
    return addresses
}

// eslint-disable-next-line @typescript-eslint/ban-types
class CoapLRUCache<K extends {}, V extends {}> extends LRUCache<K, V> {
    pruneTimer: NodeJS.Timeout
}

interface Block2CacheEntry {
    buffer: Buffer
    options: Option[]
}

class CoAPServer extends EventEmitter {
    _options: CoapServerOptions = {}
    _proxiedRequests = new Map<string, MiddlewareParameters>()
    // eslint-disable-next-line @typescript-eslint/ban-types
    _middlewares: Function[]
    _multicastAddress: string | null
    _multicastInterface: string | null
    _lru: CoapLRUCache<string, any>
    _series: any
    // eslint-disable-next-line @typescript-eslint/ban-types
    _block1Cache: BlockCache<Buffer | {}>
    _block2Cache: BlockCache<Block2CacheEntry | null>
    _sock: Socket | EventEmitter | null
    _internal_socket: boolean
    _clientIdentifier: (request: IncomingMessage) => string

    constructor (serverOptions?: CoapServerOptions | typeof requestListener, listener?: typeof requestListener) {
        super()

        this._options = {}

        if (typeof serverOptions === 'function') {
            listener = serverOptions
        } else if (serverOptions != null) {
            this._options = serverOptions
        }

        this._middlewares = [parseRequest]

        if (this._options.proxy === true) {
            this._middlewares.push(proxyRequest)
            this._middlewares.push(handleProxyResponse)
        }

        if (typeof this._options.clientIdentifier !== 'function') {
            this._options.clientIdentifier = (request) => {
                return `${request.rsinfo.address}:${request.rsinfo.port}`
            }
        }

        this._clientIdentifier = this._options.clientIdentifier

        if (
            (this._options.piggybackReplyMs == null) ||
            !isNumeric(this._options.piggybackReplyMs)
        ) {
            this._options.piggybackReplyMs = parameters.piggybackReplyMs
        }

        if (!isBoolean(this._options.sendAcksForNonConfirmablePackets)) {
            this._options.sendAcksForNonConfirmablePackets =
                parameters.sendAcksForNonConfirmablePackets
        }
        this._middlewares.push(handleServerRequest)

        // Multicast settings
        this._multicastAddress = this._options.multicastAddress ?? null
        this._multicastInterface = this._options.multicastInterface ?? null

        // We use an LRU cache for the responses to avoid
        // DDOS problems.
        // total cache size is 32MiB
        // max message size is 1152 bytes
        // 32 MiB / 1152 = 29127 messages total

        // The max lifetime is roughly 200s per message.
        // Which gave us 145 messages/second guarantee
        let maxSize = 32768 * 1024 // Maximum cache size is 32 MiB

        if (typeof this._options.cacheSize === 'number' && this._options.cacheSize >= 0) {
            maxSize = this._options.cacheSize
        }

        this._lru = new CoapLRUCache({
            maxSize,
            sizeCalculation: (n, key) => {
                return n.buffer.byteLength
            },
            ttl: parameters.exchangeLifetime * 1000,
            dispose: (value, key) => {
                if (value.sender != null) {
                    value.sender.reset()
                }
            }
        })

        this._series = series()

        this._block1Cache = new BlockCache(
            parameters.exchangeLifetime * 1000,
            () => {
                return {}
            }
        )
        this._block2Cache = new BlockCache(
            parameters.exchangeLifetime * 1000,
            () => {
                return null
            }
        )

        if (listener != null) {
            this.on('request', listener)
        }
        debug('initialized')
    }

    handleRequest () {
        return (msg: Buffer, rsinfo: AddressInfo) => {
            const request: MiddlewareParameters = {
                raw: msg,
                rsinfo,
                server: this
            }
            // eslint-disable-next-line @typescript-eslint/ban-types
            const activeMiddlewares: Function[] = []

            for (let i = 0; i < this._middlewares.length; i++) {
                activeMiddlewares.push(this._middlewares[i])
            }

            this._series(request, activeMiddlewares, request, handleEnding)
        }
    }

    _sendError (payload: Buffer, rsinfo: AddressInfo, packet?: CoapPacket, code = '5.00'): void {
        const message = generate({
            code,
            payload,
            messageId: packet != null ? packet.messageId : undefined,
            token: packet != null ? packet.token : undefined
        }, parameters.maxMessageSize)

        if (this._sock instanceof Socket) {
            this._sock.send(message, 0, message.length, rsinfo.port)
        }
    }

    _sendProxied (packet: CoapPacket, proxyUri: string, callback: (error: Error | null, bytes: number) => void): void {
        const url = new URL(proxyUri)
        const host = url.hostname
        const port = parseInt(url.port)
        const message = generate(removeProxyOptions(packet), parameters.maxMessageSize)

        if (this._sock instanceof Socket) {
            this._sock.send(message, port, host, callback)
        }
    }

    _sendReverseProxied (packet: ParsedPacket, rsinfo: AddressInfo, callback?: (error: Error | null, bytes: number) => void): void {
        const host = rsinfo.address
        const port = rsinfo.port
        const message = generate(packet, parameters.maxMessageSize)

        if (this._sock instanceof Socket) {
            this._sock.send(message, port, host, callback)
        }
    }

    private generateSocket (address: string | undefined, port: number, done?: (err?: Error) => void): Socket {
        const socketOptions: SocketOptions = {
            type: this._options.type ?? 'udp4',
            reuseAddr: this._options.reuseAddr
        }
        const sock = createSocket(socketOptions)

        sock.bind(port, address, () => {
            try {
                if (this._multicastAddress != null) {
                    const multicastAddress = this._multicastAddress
                    sock.setMulticastLoopback(true)

                    if (this._multicastInterface != null) {
                        sock.addMembership(
                            multicastAddress,
                            this._multicastInterface
                        )
                    } else if (this._options.type === 'udp4') {
                        allAddresses(this._options.type).forEach((
                            _interface
                        ) => {
                            sock.addMembership(
                                multicastAddress,
                                _interface
                            )
                        })
                    } else {
                        // FIXME: Iterating over all network interfaces does not
                        //        work for IPv6 at the moment
                        sock.addMembership(multicastAddress)
                    }
                }
            } catch (err) {
                if (done != null) {
                    done(err)
                    return
                } else {
                    throw err
                }
            }

            if (done != null) {
                done()
            }
        })

        return sock
    }

    listen (portOrCallback?: number | EventEmitter | ((err?: Error) => void), addressOrCallback?: string | ((err?: Error) => void), done?: (err?: Error) => void): this {
        let port = parameters.coapPort
        if (typeof portOrCallback === 'function') {
            done = portOrCallback
            port = parameters.coapPort
        } else if (typeof portOrCallback === 'number') {
            port = portOrCallback
        }

        let address: string | undefined
        if (typeof addressOrCallback === 'function') {
            done = addressOrCallback
        } else if (typeof addressOrCallback === 'string') {
            address = addressOrCallback
        }

        if (this._sock != null) {
            if (done != null) {
                done(new Error('Already listening'))
            } else {
                throw new Error('Already listening')
            }

            return this
        }

        if (address != null && isIPv6(address)) {
            this._options.type = 'udp6'
        }

        if (this._options.type == null) {
            this._options.type = 'udp4'
        }

        if (this._options.reuseAddr !== false) {
            this._options.reuseAddr = true
        }

        if (portOrCallback instanceof EventEmitter) {
            this._sock = portOrCallback
            if (done != null) {
                setImmediate(done)
            }
        } else {
            this._internal_socket = true
            this._sock = this.generateSocket(address, port, done)
        }

        this._sock.on('message', this.handleRequest())

        this._sock.on('error', (error) => {
            this.emit('error', error)
        })

        if (parameters.pruneTimerPeriod != null) {
            // Start LRU pruning timer
            this._lru.pruneTimer = setInterval(() => {
                this._lru.purgeStale()
            }, parameters.pruneTimerPeriod * 1000)
            if (this._lru.pruneTimer.unref != null) {
                this._lru.pruneTimer.unref()
            }
        }

        return this
    }

    close (done?: (err?: Error) => void): this {
        if (done != null) {
            setImmediate(done)
        }

        if (this._lru.pruneTimer != null) {
            clearInterval(this._lru.pruneTimer)
        }

        if (this._sock != null) {
            if (this._internal_socket && this._sock instanceof Socket) {
                this._sock.close()
            }
            this._lru.clear()
            this._sock = null
            this.emit('close')
        } else {
            this._lru.clear()
        }

        this._block2Cache.reset()
        this._block1Cache.reset()

        return this
    }

    /**
     * Entry point for a new datagram from the client.
     * @param packet The packet that was sent from the client.
     * @param rsinfo Connection info
     */
    _handle (packet: CoapPacket, rsinfo: AddressInfo): void {
        if (packet.code == null || packet.code[0] !== '0') {
            // According to RFC7252 Section 4.2 receiving a confirmable messages
            // that can't be processed, should be rejected by ignoring it AND
            // sending a reset. In this case confirmable response message would
            // be silently ignored, which is not exactly as stated in the standard.
            // However, sending a reset would interfere with a coap client which is
            // re-using a socket (see pull-request #131).
            return
        }

        const sock = this._sock
        const lru = this._lru
        let Message: typeof ObserveStream | typeof OutMessage = OutMessage
        const request = new IncomingMessage(packet, rsinfo)
        const cached = lru.peek(this._toKey(request, packet, true))

        if (cached != null && !(packet.ack ?? false) && !(packet.reset ?? false) && sock instanceof Socket) {
            sock.send(cached, 0, cached.length, rsinfo.port, rsinfo.address)
            return
        } else if (cached != null && ((packet.ack ?? false) || (packet.reset ?? false))) {
            if (cached.response != null && (packet.reset ?? false)) {
                cached.response.end()
            }
            lru.delete(this._toKey(request, packet, false))
            return
        } else if (packet.ack ?? packet.reset ?? false) {
            return // nothing to do, ignoring silently
        }

        if (request.headers.Observe === 0) {
            Message = ObserveStream
            if (packet.code !== '0.01' && packet.code !== '0.05') {
                // it is neither a GET nor a FETCH
                this._sendError(
                    Buffer.from('Observe can only be present with a GET or a FETCH'),
                    rsinfo
                )
                return
            }
        }

        if (packet.code === '0.05' && request.headers['Content-Format'] == null) {
            this._sendError(
                Buffer.from('FETCH requests must contain a Content-Format option'),
                rsinfo,
                undefined,
                '4.15' /* TODO: Check if this is the correct error code */
            )
            return
        }

        const cacheKey = this._toCacheKey(request, packet)

        packet.piggybackReplyMs = this._options.piggybackReplyMs
        const generateResponse = (): OutgoingMessage | ObserveStream | undefined => {
            const response = new Message(packet, (response, packet: ParsedPacket) => {
                /**
                 * Extended `Buffer` with additional fields for caching.
                 *
                 * TODO: Find a more elegant solution for this type.
                 */
                let buf: any
                const sender = new RetrySend(sock, rsinfo.port, rsinfo.address)

                try {
                    buf = generate(packet, parameters.maxMessageSize)
                } catch (err) {
                    response.emit('error', err)
                    return
                }
                if (Message === OutMessage) {
                    sender.on('error', response.emit.bind(response, 'error'))
                } else {
                    buf.response = response
                    sender.on('error', () => {
                        response.end()
                    })
                }

                const key = this._toKey(
                    request,
                    packet,
                    packet.ack || !packet.confirmable
                )
                lru.set(key, buf)
                buf.sender = sender

                if (
                    this._options.sendAcksForNonConfirmablePackets === true ||
                    packet.confirmable
                ) {
                    sender.send(
                        buf,
                        packet.ack || packet.reset || !packet.confirmable
                    )
                } else {
                    debug('OMIT ACK PACKAGE')
                }
            })

            response.statusCode = '2.05'
            response._request = request._packet
            if (cacheKey != null) {
                response._cachekey = cacheKey
            }

            // inject this function so the response can add an entry to the cache
            response._addCacheEntry = this._block2Cache.add.bind(this._block2Cache)

            return response
        }

        const response = generateResponse()
        request.rsinfo = rsinfo

        if (packet.token != null && packet.token.length > 0) {
            // return cached value only if this request is not the first block request
            const block2Buff = getOption(packet.options, 'Block2')
            let requestedBlockOption: Block = { num: 0, more: 0, size: 0 }
            if (block2Buff instanceof Buffer) {
                requestedBlockOption = parseBlock2(block2Buff) ?? requestedBlockOption
            }
            if (cacheKey == null) {
                return
            } else if (requestedBlockOption.num < 1) {
                if (this._block2Cache.remove(cacheKey)) {
                    debug('first block2 request, removed old entry from cache')
                }
            } else {
                debug('check if packet token is in cache, key:', cacheKey)
                if (this._block2Cache.contains(cacheKey)) {
                    debug('found cached payload, key:', cacheKey)
                    if (response != null) {
                        const cacheEntry = this._block2Cache.get(cacheKey)
                        cacheEntry?.options.forEach((option) => response._packet.options?.push(option))
                        response.end(cacheEntry?.buffer)
                    }
                    return
                }
            }
        }

        const block1Buff = getOption(packet.options, 'Block1')
        if (block1Buff instanceof Buffer) {
            const blockState = parseBlockOption(block1Buff)

            if (blockState != null) {
                const cachedData = this._block1Cache.getWithDefaultInsert(cacheKey)
                const blockByteSize = Math.pow(2, 4 + blockState.size)
                const incomingByteIndex = blockState.num * blockByteSize
                // Store in the cache object, use the byte index as the key
                cachedData[incomingByteIndex] = request.payload

                if (blockState.more === 0) {
                    // Last block
                    const byteOffsets = Object.keys(cachedData)
                        .map((str) => {
                            return parseInt(str)
                        })
                        .sort((a, b) => {
                            return a - b
                        })
                    const byteTotalSum =
                        incomingByteIndex + request.payload.length
                    let next = 0
                    const concat = Buffer.alloc(byteTotalSum)
                    for (let i = 0; i < byteOffsets.length; i++) {
                        if (byteOffsets[i] === next) {
                            const buff = cachedData[byteOffsets[i]]
                            if (!(buff instanceof Buffer)) {
                                continue
                            }
                            buff.copy(concat, next, 0, buff.length)
                            next += buff.length
                        } else {
                            throw new Error(
                                'Byte offset not the next in line...'
                            )
                        }
                    }

                    if (cacheKey != null) {
                        this._block1Cache.remove(cacheKey)
                    }

                    if (next === concat.length) {
                        request.payload = concat
                    } else {
                        throw new Error(
                            'Last byte index is not equal to the concat buffer length!'
                        )
                    }
                } else {
                    // More blocks to come. ACK this block
                    if (response != null) {
                        response.code = '2.31'
                        response.setOption('Block1', block1Buff)
                        response.end()
                    }
                    return
                }
            } else {
                throw new Error('Invalid block state')
            }
        }

        this.emit('request', request, response)

        this.saveAdditionalBlock2Options(cacheKey, response)
    }

    private saveAdditionalBlock2Options (cacheKey: string | null, response?: OutgoingMessage | ObserveStream): void {
        if (cacheKey != null) {
            const cacheEntry = this._block2Cache.get(cacheKey)
            response?._packet.options?.forEach((option) => cacheEntry?.options.push(option))
        }
    }

    /**
     *
     * @param request
     * @param packet
     * @returns
     */
    _toCacheKey (request: IncomingMessage, packet: CoapPacket): string | null {
        if (packet.token != null && packet.token.length > 0) {
            return `${packet.token.toString('hex')}/${this._clientIdentifier(
                request
            )}`
        }

        return null
    }

    /**
     *
     * @param request
     * @param packet
     * @param appendToken
     * @returns
     */
    _toKey (request: IncomingMessage, packet: CoapPacket, appendToken: boolean): string {
        let result = this._clientIdentifier(request)

        if (packet.messageId != null) {
            result += `/${packet.messageId}`
        }

        if (appendToken && packet.token != null) {
            result += packet.token.toString('hex')
        }

        return result
    }
}

// Max block size defined in the protocol is 2^(6+4) = 1024
let maxBlock2 = 1024

// Some network stacks (e.g. 6LowPAN/Thread) might have a lower IP MTU.
// In those cases the maxPayloadSize parameter can be adjusted
if (parameters.maxPayloadSize < 1024) {
    // CoAP Block2 header only has sizes of 2^(i+4) for i in 0 to 6 inclusive,
    // so pick the next size down that is supported
    let exponent = Math.log2(parameters.maxPayloadSize)
    exponent = Math.floor(exponent)
    maxBlock2 = Math.pow(2, exponent)
}

/*
new out message
inherit from OutgoingMessage
to handle cached answer and blockwise (2)
*/
class OutMessage extends OutgoingMessage {
    _cachekey: string
    // eslint-disable-next-line @typescript-eslint/ban-types
    _addCacheEntry: Function

    /**
     * Entry point for a response from the server
     *
     * @param payload A buffer-like object containing data to send back to the client.
     * @returns
     */
    end (payload?: Buffer): this {
        // removeOption(this._request.options, 'Block1');
        // add logic for Block1 sending

        const block2Buff = getOption(this._request.options, 'Block2')
        let requestedBlockOption: Block | null = null
        // if we got blockwise (2) request
        if (block2Buff != null) {
            if (block2Buff instanceof Buffer) {
                requestedBlockOption = parseBlock2(block2Buff)
            }
            // bad option
            if (requestedBlockOption == null) {
                this.statusCode = '4.02'
                return super.end()
            }
        }

        // if payload is suitable for ONE message, shoot it out
        if (
            payload == null ||
            (requestedBlockOption == null && payload.length < maxBlock2)
        ) {
            return super.end(payload)
        }

        // for the first request, block2 option may be missed
        if (requestedBlockOption == null) {
            requestedBlockOption = {
                size: maxBlock2,
                more: 1,
                num: 0
            }
        }

        // block2 size should not bigger than maxBlock2
        if (requestedBlockOption.size > maxBlock2) { requestedBlockOption.size = maxBlock2 }

        // block number should have limit
        const lastBlockNum =
            Math.ceil(payload.length / requestedBlockOption.size) - 1
        if (requestedBlockOption.num > lastBlockNum) {
            // precondition fail, may request for out of range block
            this.statusCode = '4.02'
            return super.end()
        }
        // check if requested block is the last
        const more = requestedBlockOption.num < lastBlockNum ? 1 : 0

        const block2 = createBlock2({
            more,
            num: requestedBlockOption.num,
            size: requestedBlockOption.size
        })
        if (block2 == null) {
            // this catch never be match,
            // since we're gentleman, just handle it
            this.statusCode = '4.02'
            return super.end()
        }
        this.setOption('Block2', block2)
        this.setOption('ETag', _toETag(payload))
        const size2 = getOption(this._request.options, 'Size2')

        if (size2 === 0) {
            this.setOption('Size2', payload.length)
        }

        // cache it
        if (this._request.token != null && this._request.token.length > 0) {
            this._addCacheEntry(this._cachekey, { buffer: payload, options: [] })
        }
        super.end(
            payload.slice(
                requestedBlockOption.num * requestedBlockOption.size,
                (requestedBlockOption.num + 1) * requestedBlockOption.size
            )
        )

        return this
    }
}

/*
calculate id of a payload by xor each 2-byte-block from it
use to generate etag
  payload         an input buffer, represent payload need to generate id (hash)
  id              return var, is a buffer(2)
*/
function _toETag (payload: Buffer): Buffer {
    const id = Buffer.of(0, 0)
    let i = 0
    do {
        id[0] ^= payload[i]
        id[1] ^= payload[i + 1]
        i += 2
    } while (i < payload.length)
    return id
}

export default CoAPServer
