'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const { EventEmitter } = require('events')
const { isIPv6 } = require('net')
const BlockCache = require('./cache')
const OutgoingMessage = require('./outgoing_message')
const { createSocket, Socket } = require('dgram')
const LRU = require('lru-cache')
const os = require('os')
const IncomingMessage = require('./incoming_message')
const ObserveStream = require('./observe_write_stream')
const RetrySend = require('./retry_send')
const { handleProxyResponse, handleServerRequest, parseRequest, proxyRequest } = require('./middlewares')
const { parseBlockOption } = require('./block')
const { generate } = require('coap-packet')
const { parseBlock2, createBlock2, getOption, isNumeric, isBoolean } = require('./helpers')
const { parameters } = require('./parameters')
const series = require('fastseries')
const Debug = require('debug')
const debug = Debug('CoAP Server')

function handleEnding (err) {
    const request = this
    if (err != null) {
        request.server._sendError(
            Buffer.from(err.message),
            request.rsinfo,
            request.packet
        )
    }
}

function removeProxyOptions (packet) {
    const cleanOptions = []
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

function allAddresses (type) {
    let family = 'IPv4'
    if (type === 'udp6') {
        family = 'IPv6'
    }
    const addresses = []
    const interfaces = os.networkInterfaces()
    for (const ifname in interfaces) {
        if (ifname in interfaces) {
            interfaces[ifname].forEach((a) => {
                if (a.family === family) {
                    addresses.push(a.address)
                }
            })
        }
    }
    return addresses
}

class CoAPServer extends EventEmitter {
    constructor (serverOptions, listener) {
        super()
        this._options = {}
        this._proxiedRequests = new Map()
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
        this._multicastAddress = (this._options.multicastAddress != null)
            ? this._options.multicastAddress
            : null
        this._multicastInterface = (this._options.multicastInterface != null)
            ? this._options.multicastInterface
            : null

        // We use an LRU cache for the responses to avoid
        // DDOS problems.
        // max packet size is 1280
        // 32 MB / 1280 = 26214
        // The max lifetime is roughly 200s per packet.
        // Which gave us 131 packets/second guarantee
        let max = 32768 * 1024

        if (typeof this._options.cacheSize === 'number' && this._options.cacheSize >= 0) {
            max = this._options.cacheSize
        }

        this._lru = new LRU({
            max,
            length: (n, key) => {
                return n.buffer.byteLength
            },
            maxAge: parameters.exchangeLifetime * 1000,
            dispose: (key, value) => {
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
        return (msg, rsinfo) => {
            const request = {
                raw: msg,
                rsinfo: rsinfo,
                server: this
            }
            const activeMiddlewares = []

            for (let i = 0; i < this._middlewares.length; i++) {
                activeMiddlewares.push(this._middlewares[i])
            }

            this._series(request, activeMiddlewares, request, handleEnding)
        }
    }

    _sendError (payload, rsinfo, packet, code = '5.00') {
        const message = generate({
            code,
            payload: payload,
            messageId: packet != null ? packet.messageId : undefined,
            token: packet != null ? packet.token : undefined
        })

        if (this._sock instanceof Socket) {
            this._sock.send(message, rsinfo.port, rsinfo.host)
        }
    }

    _sendProxied (packet, proxyUri, callback) {
        const url = new URL(proxyUri)
        const host = url.hostname
        const port = parseInt(url.port)
        const message = generate(removeProxyOptions(packet))

        if (this._sock instanceof Socket) {
            this._sock.send(message, port, host, callback)
        }
    }

    _sendReverseProxied (packet, rsinfo, callback) {
        const host = rsinfo.address
        const port = rsinfo.port
        const message = generate(packet)

        if (this._sock instanceof Socket) {
            this._sock.send(message, port, host, callback)
        }
    }

    generateSocket (address, port, done) {
        const socketOptions = {
            type: this._options.type || 'udp4',
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
                    } else {
                        allAddresses(this._options.type).forEach((
                            _interface
                        ) => {
                            sock.addMembership(
                                multicastAddress,
                                _interface
                            )
                        })
                    }
                }
            } catch (err) {
                if (done != null) {
                    return done(err)
                } else {
                    throw err
                }
            }

            if (done != null) {
                return done()
            }
        })

        return sock
    }

    listen (portOrCallback, addressOrCallback, done) {
        let port = parameters.coapPort
        if (typeof portOrCallback === 'function') {
            done = portOrCallback
            port = parameters.coapPort
        } else if (typeof portOrCallback === 'number') {
            port = portOrCallback
        }

        let address
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
                this._lru.prune()
            }, parameters.pruneTimerPeriod * 1000)
            if (this._lru.pruneTimer.unref != null) {
                this._lru.pruneTimer.unref()
            }
        }

        return this
    }

    close (done) {
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
            this._lru.reset()
            this._sock = null
            this.emit('close')
        } else {
            this._lru.reset()
        }

        this._block2Cache.reset()
        this._block1Cache.reset()

        return this
    }

    /**
     * Entry point for a new datagram from the client.
     * @param {Packet} packet The packet that was sent from the client.
     * @param {Object} rsinfo Connection info
     */
    _handle (packet, rsinfo) {
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
        let Message = OutMessage
        const request = new IncomingMessage(packet, rsinfo)
        const cached = lru.peek(this._toKey(request, packet, true))

        if (cached != null && !packet.ack && !packet.reset && sock instanceof Socket) {
            return sock.send(cached, 0, cached.length, rsinfo.port, rsinfo.address)
        } else if (cached != null && (packet.ack || packet.reset)) {
            if (cached.response != null && packet.reset) {
                cached.response.end()
            }
            return lru.del(this._toKey(request, packet, false))
        } else if (packet.ack || packet.reset) {
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
            return this._sendError(
                Buffer.from('FETCH requests must contain a Content-Format option'),
                rsinfo,
                undefined,
                '4.15' /* TODO: Check if this is the correct error code */
            )
        }

        const cacheKey = this._toCacheKey(request, packet)

        packet.piggybackReplyMs = this._options.piggybackReplyMs
        const generateResponse = () => {
            const response = new Message(packet, (response, packet) => {
                let buf
                const sender = new RetrySend(sock, rsinfo.port, rsinfo.address)

                try {
                    buf = generate(packet)
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
            let requestedBlockOption
            if (block2Buff instanceof Buffer) {
                requestedBlockOption = parseBlock2(block2Buff)
            }
            if (requestedBlockOption == null) {
                requestedBlockOption = { num: 0 }
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
                        response.end(this._block2Cache.get(cacheKey))
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
                throw new Error('Invalid block state' + blockState)
            }
        }

        this.emit('request', request, response)
    }

    _toCacheKey (request, packet) {
        if (packet.token != null && packet.token.length > 0) {
            return `${packet.token.toString('hex')}/${this._clientIdentifier(
                request
            )}`
        }

        return null
    }

    _toKey (request, packet, appendToken) {
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

// maxBlock2 is in formular 2**(i+4), and must <= 2**(6+4)
let maxBlock2 = Math.pow(
    2,
    Math.floor(Math.log(parameters.maxPacketSize) / Math.log(2))
)
if (maxBlock2 > Math.pow(2, 6 + 4)) {
    maxBlock2 = Math.pow(2, 6 + 4)
}

/*
new out message
inherit from OutgoingMessage
to handle cached answer and blockwise (2)
*/
class OutMessage extends OutgoingMessage {
    /**
     * Entry point for a response from the server
     * @param {Buffer} payload A buffer-like object containing data to send back to the client.
     */
    end (payload) {
        // removeOption(this._request.options, 'Block1');
        // add logic for Block1 sending

        const block2Buff = getOption(this._request.options, 'Block2')
        let requestedBlockOption = null
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
            (requestedBlockOption == null && payload.length < parameters.maxPacketSize)
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

        // cache it
        if (this._request.token != null && this._request.token.length > 0) {
            this._addCacheEntry(this._cachekey, payload)
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
function _toETag (payload) {
    const id = Buffer.of(0, 0)
    let i = 0
    do {
        id[0] ^= payload[i]
        id[1] ^= payload[i + 1]
        i += 2
    } while (i < payload.length)
    return id
}

module.exports = CoAPServer
