/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import crypto = require('crypto')
import { Socket, createSocket } from 'dgram'
import { AgentOptions, CoapRequestParams, Block } from '../models/models'
import { EventEmitter } from 'events'
import { parse, generate, ParsedPacket } from 'coap-packet'
import IncomingMessage from './incoming_message'
import OutgoingMessage from './outgoing_message'
import ObserveStream from './observe_read_stream'
import RetrySend from './retry_send'
import { parseBlock2, createBlock2, getOption, removeOption } from './helpers'
import { SegmentedTransmission } from './segmentation'
import { parseBlockOption } from './block'
import { AddressInfo } from 'net'
import { parameters } from './parameters'

const maxToken = Math.pow(2, 32)
const maxMessageId = Math.pow(2, 16)

class Agent extends EventEmitter {
    _opts: AgentOptions
    _closing: boolean
    _sock: Socket | null
    _msgIdToReq: Map<number, OutgoingMessage>
    _tkToReq: Map<string, OutgoingMessage>
    _tkToMulticastResAddr: Map<string, string[]>
    private _lastToken: number
    _lastMessageId: number
    private _msgInFlight: number
    _requests: number
    constructor (opts?: AgentOptions) {
        super()

        if (opts == null) {
            opts = {}
        }

        if (opts.type == null) {
            opts.type = 'udp4'
        }

        if (opts.socket != null) {
            const sock = opts.socket as any
            opts.type = sock.type
            delete opts.port
        }

        this._opts = opts

        this._init(opts.socket)
    }

    _init (socket?: Socket): void {
        this._closing = false

        if (this._sock != null) {
            return
        }

        this._sock = socket ?? createSocket({ type: this._opts.type ?? 'udp4' })
        this._sock.on('message', (msg, rsinfo) => {
            let packet: ParsedPacket
            try {
                packet = parse(msg)
            } catch (err) {
                return
            }

            if (packet.code[0] === '0' && packet.code !== '0.00') {
                // ignore this packet since it's not a response.
                return
            }

            if (this._sock != null) {
                const outSocket = this._sock.address()
                this._handle(packet, rsinfo, outSocket)
            }
        })

        if (this._opts.port != null) {
            this._sock.bind(this._opts.port)
        }

        this._sock.on('error', (err) => {
            this.emit('error', err)
        })

        this._msgIdToReq = new Map()
        this._tkToReq = new Map()
        this._tkToMulticastResAddr = new Map()

        this._lastToken = Math.floor(Math.random() * (maxToken - 1))
        this._lastMessageId = Math.floor(Math.random() * (maxMessageId - 1))

        this._msgInFlight = 0
        this._requests = 0
    }

    close (done?: (err?: Error) => void): this {
        if (this._msgIdToReq.size === 0 && this._msgInFlight === 0) {
            // No requests in flight, close immediately
            this._doClose(done)
            return this
        }

        done = done ?? (() => {})
        this.once('close', done)
        for (const req of this._msgIdToReq.values()) {
            this.abort(req)
        }
        return this
    }

    _cleanUp (): void {
        if (--this._requests !== 0) {
            return
        }

        if (this._opts.socket == null) {
            this._closing = true
        }

        if (this._msgInFlight > 0) {
            return
        }

        this._doClose()
    }

    _doClose (done?: (err?: Error) => void): void {
        for (const req of this._msgIdToReq.values()) {
            req.sender.reset()
        }

        if (this._opts.socket != null) {
            return
        }

        if (this._sock == null) {
            this.emit('close')
            return
        }

        this._sock.close(() => {
            this._sock = null
            if (done != null) {
                done()
            }
            this.emit('close')
        })
    }

    _handle (packet: ParsedPacket, rsinfo: AddressInfo, outSocket: AddressInfo): void {
        let buf: Buffer
        let response: IncomingMessage
        let req: OutgoingMessage | undefined = this._msgIdToReq.get(packet.messageId)
        const ackSent = (err: Error): void => {
            if (err != null && req != null) {
                req.emit('error', err)
            }

            this._msgInFlight--
            if (this._closing && this._msgInFlight === 0) {
                this._doClose()
            }
        }
        if (req == null) {
            if (packet.token.length > 0) {
                req = this._tkToReq.get(packet.token.toString('hex'))
            }

            if ((packet.ack || packet.reset) && req == null) {
                // Nothing to do on unknown or duplicate ACK/RST packet
                return
            }

            if (req == null) {
                buf = generate({
                    code: '0.00',
                    reset: true,
                    messageId: packet.messageId
                })

                if (this._sock != null) {
                    this._msgInFlight++
                    this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent)
                }
                return
            }
        }

        if (packet.confirmable) {
            buf = generate({
                code: '0.00',
                ack: true,
                messageId: packet.messageId
            })

            if (this._sock != null) {
                this._msgInFlight++
                this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent)
            }
        }

        if (packet.code !== '0.00' && (req._packet.token == null || req._packet.token.length !== packet.token.length || Buffer.compare(req._packet.token, packet.token) !== 0)) {
        // The tokens don't match, ignore the message since it is a malformed response
            return
        }

        const block1Buff = getOption(packet.options, 'Block1')
        let block1: Block | null = null
        if (block1Buff instanceof Buffer) {
            block1 = parseBlockOption(block1Buff)
            // check for error
            if (block1 == null) {
                req.sender.reset()
                req.emit('error', new Error('Failed to parse block1'))
                return
            }
        }

        req.sender.reset()

        if (block1 != null && packet.ack) {
        // If the client takes too long to respond then the retry sender will send
        // another packet with the previous messageId, which we've already removed.
            const segmentedSender = req.segmentedSender
            if (segmentedSender != null) {
                // If there's more to send/receive, then carry on!
                if (segmentedSender.remaining() > 0) {
                    if (segmentedSender.isCorrectACK(block1)) {
                        if (req._packet.messageId != null) {
                            this._msgIdToReq.delete(req._packet.messageId)
                        }
                        req._packet.messageId = this._nextMessageId()
                        this._msgIdToReq.set(req._packet.messageId, req)
                        segmentedSender.receiveACK(block1)
                    } else {
                        segmentedSender.resendPreviousPacket()
                    }
                    return
                } else {
                    // console.log("Packet received done");
                    if (req._packet.options != null) {
                        removeOption(req._packet.options, 'Block1')
                    }
                    delete req.segmentedSender
                }
            }
        }

        if (!packet.confirmable && !req.multicast) {
            this._msgIdToReq.delete(packet.messageId)
        }

        // Drop empty messages (ACKs), but process RST
        if (packet.code === '0.00' && !packet.reset) {
            return
        }

        const block2Buff = getOption(packet.options, 'Block2')
        let block2: Block | null = null
        // if we got blockwise (2) response
        if (block2Buff instanceof Buffer) {
            block2 = parseBlock2(block2Buff)
            // check for error
            if (block2 == null) {
                req.sender.reset()
                req.emit('error', new Error('failed to parse block2'))
                return
            }
        }
        if (block2 != null) {
            if (req.multicast) {
                req = this._convertMulticastToUnicastRequest(req, rsinfo)
                if (req == null) {
                    return
                }
            }

            // accumulate payload
            req._totalPayload = Buffer.concat([req._totalPayload, packet.payload])

            if (block2.more === 1) {
                // increase message id for next request
                if (req._packet.messageId != null) {
                    this._msgIdToReq.delete(req._packet.messageId)
                }
                req._packet.messageId = this._nextMessageId()
                this._msgIdToReq.set(req._packet.messageId, req)

                // next block2 request
                const block2Val = createBlock2({
                    more: 0,
                    num: block2.num + 1,
                    size: block2.size
                })
                if (block2Val == null) {
                    req.sender.reset()
                    req.emit('error', new Error('failed to create block2'))
                    return
                }
                req.setOption('Block2', block2Val)
                req._packet.payload = undefined
                req.sender.send(generate(req._packet))

                return
            } else {
                // get full payload
                packet.payload = req._totalPayload
                // clear the payload incase of block2
                req._totalPayload = Buffer.alloc(0)
            }
        }

        const observe = req.url.observe != null && [true, 0, '0'].includes(req.url.observe)

        if (req.response != null) {
            const response: any = req.response
            if (response.append != null) {
                // it is an observe request
                // and we are already streaming
                return response.append(packet)
            } else {
                // TODO There is a previous response but is not an ObserveStream !
                return
            }
        } else if (block2 != null && packet.token != null) {
            this._tkToReq.delete(packet.token.toString('hex'))
        } else if (!observe && !req.multicast) {
            // it is not, so delete the token
            this._tkToReq.delete(packet.token.toString('hex'))
        }

        if (observe && packet.code !== '4.04') {
            response = new ObserveStream(packet, rsinfo, outSocket)
            response.on('close', () => {
                this._tkToReq.delete(packet.token.toString('hex'))
                this._cleanUp()
            })
            response.on('deregister', () => {
                const deregisterUrl = Object.assign({}, req?.url)
                deregisterUrl.observe = 1
                deregisterUrl.token = req?._packet.token

                const deregisterReq = this.request(deregisterUrl)
                // If the request fails, we'll deal with it with a RST message anyway.
                deregisterReq.on('error', () => {})
                deregisterReq.end()
            })
        } else {
            response = new IncomingMessage(packet, rsinfo, outSocket)
        }

        if (!req.multicast) {
            req.response = response
        }

        req.emit('response', response)
    }

    _nextToken (): Buffer {
        const buf = Buffer.alloc(8)

        if (++this._lastToken === maxToken) {
            this._lastToken = 0
        }

        buf.writeUInt32BE(this._lastToken, 0)
        crypto.randomBytes(4).copy(buf, 4)

        return buf
    }

    _nextMessageId (): number {
        if (++this._lastMessageId === maxMessageId) {
            this._lastMessageId = 0
        }

        return this._lastMessageId
    }

    /**
     * Entry point for a new client-side request.
     * @param url The parameters for the request
     */
    request (url: CoapRequestParams): OutgoingMessage {
        this._init()

        const options = url.options ?? url.headers
        const multicastTimeout = url.multicastTimeout != null ? url.multicastTimeout : 20000
        const host = url.hostname ?? url.host
        const port = url.port ?? parameters.coapPort

        const req = new OutgoingMessage({}, (req, packet) => {
            let buf

            if (url.confirmable !== false) {
                packet.confirmable = true
            }

            // multicast message should be forced non-confirmable
            if (url.multicast === true) {
                req.multicast = true
                packet.confirmable = false
            }

            if (!(packet.ack ?? packet.reset ?? false)) {
                packet.messageId = this._nextMessageId()
                if ((url.token instanceof Buffer) && (url.token.length > 0)) {
                    if (url.token.length > 8) {
                        return req.emit('error', new Error('Token may be no longer than 8 bytes.'))
                    }
                    packet.token = url.token
                } else {
                    packet.token = this._nextToken()
                }
                const token = packet.token.toString('hex')
                if (req.multicast) {
                    this._tkToMulticastResAddr.set(token, [])
                }
                if (token != null) {
                    this._tkToReq.set(token, req)
                }
            }

            if (packet.messageId != null) {
                this._msgIdToReq.set(packet.messageId, req)
            }

            const block1Buff = getOption(packet.options, 'Block1')
            if (block1Buff != null) {
                // Setup for a segmented transmission
                req.segmentedSender = new SegmentedTransmission(block1Buff[0], req, packet)
                req.segmentedSender.sendNext()
            } else {
                try {
                    buf = generate(packet)
                } catch (err) {
                    req.sender.reset()
                    return req.emit('error', err)
                }
                req.sender.send(buf, packet.confirmable === false)
            }
        })

        req.sender = new RetrySend(this._sock, port, host, url.retrySend)

        req.url = url

        req.statusCode = url.method ?? 'GET'

        this.urlPropertyToPacketOption(url, req, 'pathname', 'Uri-Path', '/')
        this.urlPropertyToPacketOption(url, req, 'query', 'Uri-Query', '&')

        if (options != null) {
            for (const optionName of Object.keys(options)) {
                if (optionName in options) {
                    req.setOption(optionName, options[optionName])
                }
            }
        }

        if (url.proxyUri != null) {
            req.setOption('Proxy-Uri', url.proxyUri)
        }

        req.sender.on('error', req.emit.bind(req, 'error'))

        req.sender.on('sending', () => {
            this._msgInFlight++
        })

        req.sender.on('timeout', (err) => {
            req.emit('timeout', err)
            this.abort(req)
        })

        req.sender.on('sent', () => {
            if (req.multicast) {
                return
            }

            this._msgInFlight--
            if (this._closing && this._msgInFlight === 0) {
                this._doClose()
            }
        })

        // Start multicast monitoring timer in case of multicast request
        if (url.multicast === true) {
            req.multicastTimer = setTimeout(() => {
                if (req._packet.token != null) {
                    const token = req._packet.token.toString('hex')
                    this._tkToReq.delete(token)
                    this._tkToMulticastResAddr.delete(token)
                }
                if (req._packet.messageId != null) {
                    this._msgIdToReq.delete(req._packet.messageId)
                }
                this._msgInFlight--
                if (this._msgInFlight === 0 && this._closing) {
                    this._doClose()
                }
            }, multicastTimeout)
        }

        if (typeof (url.observe) === 'number') {
            req.setOption('Observe', url.observe)
        } else if (typeof (url.observe) === 'string') {
            req.setOption('Observe', parseInt(url.observe))
        } else if (url.observe === true || url.observe != null) {
            req.setOption('Observe', 0)
        } else {
            req.on('response', this._cleanUp.bind(this))
        }

        this._requests++

        req._totalPayload = Buffer.alloc(0)

        return req
    }

    abort (req: OutgoingMessage): void {
        req.sender.removeAllListeners()
        req.sender.reset()
        this._msgInFlight--
        this._cleanUp()
        if (req._packet.messageId != null) {
            this._msgIdToReq.delete(req._packet.messageId)
        }
        if (req._packet.token != null) {
            this._tkToReq.delete(req._packet.token.toString('hex'))
        }
    }

    urlPropertyToPacketOption (url: CoapRequestParams, req: OutgoingMessage, property: string, option: string, separator: string): void {
        if (url[property] != null) {
            req.setOption(option, url[property].normalize('NFC').split(separator)
                .filter((part) => { return part !== '' })
                .map((part) => {
                    const buf = Buffer.alloc(Buffer.byteLength(part))
                    buf.write(part)
                    return buf
                }))
        }
    }

    _convertMulticastToUnicastRequest (req: any, rsinfo: AddressInfo): OutgoingMessage | undefined {
        const unicastReq = this.request(req.url)
        const unicastAddress = rsinfo.address.split('%')[0]
        const token = req._packet.token.toString('hex')
        const addressArray = this._tkToMulticastResAddr.get(token) ?? []

        if (addressArray.includes(unicastAddress)) {
            return undefined
        }

        unicastReq.url.host = unicastAddress
        unicastReq.sender._host = unicastAddress
        clearTimeout(unicastReq.multicastTimer)
        unicastReq.url.multicast = false
        req.eventNames().forEach(eventName => {
            req.listeners(eventName).forEach(listener => {
                unicastReq.on(eventName, listener)
            })
        })
        addressArray.push(unicastAddress)
        unicastReq._packet.token = this._nextToken()
        this._requests++
        return unicastReq
    }
}

export default Agent
