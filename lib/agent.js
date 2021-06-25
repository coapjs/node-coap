'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const util = require('util')
const crypto = require('crypto')
const events = require('events')
const dgram = require('dgram')
const parse = require('coap-packet').parse
const generate = require('coap-packet').generate
const IncomingMessage = require('./incoming_message')
const OutgoingMessage = require('./outgoing_message')
const ObserveStream = require('./observe_read_stream')
const RetrySend = require('./retry_send')
const parseBlock2 = require('./helpers').parseBlock2
const createBlock2 = require('./helpers').createBlock2
const getOption = require('./helpers').getOption
const removeOption = require('./helpers').removeOption
const maxToken = Math.pow(2, 32)
const maxMessageId = Math.pow(2, 16)
const pf = require('./polyfill')
let hasDNSbug = true
const SegmentedTransmission = require('./segmentation').SegmentedTransmission
const parseBlockOption = require('./block').parseBlockOption;

(function () {
    const major = parseInt(process.version.match(/^v([^.]+).*$/)[1])

    if (major >= 4) {
        hasDNSbug = false
    }
})()

function Agent (opts) {
    if (!(this instanceof Agent)) { return new Agent(opts) }

    if (!opts) { opts = {} }

    if (!opts.type) { opts.type = 'udp4' }

    if (opts.socket) {
        opts.type = opts.socket.type
        delete opts.port
    }

    this._opts = opts

    this._init(opts.socket)
}

util.inherits(Agent, events.EventEmitter)

Agent.prototype._init = function initSock (socket) {
    this._closing = false

    if (this._sock) {
        return
    }

    const that = this
    this._sock = socket || dgram.createSocket(this._opts.type)
    this._sock.on('message', function (msg, rsinfo) {
        let packet
        try {
            packet = parse(msg)
        } catch (err) {
            return
        }

        if (packet.code[0] === '0' && packet.code !== '0.00') {
            // ignore this packet since it's not a response.
            return
        }

        const outSocket = that._sock.address()
        that._handle(msg, rsinfo, outSocket)
    })

    if (this._opts.port) {
        this._sock.bind(this._opts.port)
    }

    this._sock.on('error', function (err) {
    // we are skipping DNS errors
        if (!hasDNSbug || err.code !== 'ENOTFOUND') { that.emit('error', err) }
    })

    this._msgIdToReq = {}
    this._tkToReq = {}
    this._tkToMulticastResAddr = {}

    this._lastToken = Math.floor(Math.random() * (maxToken - 1))
    this._lastMessageId = Math.floor(Math.random() * (maxMessageId - 1))

    this._msgInFlight = 0
    this._requests = 0
}

Agent.prototype._cleanUp = function cleanUp () {
    if (--this._requests !== 0) { return }

    if (!this._opts.socket) { this._closing = true }

    if (this._msgInFlight !== 0) { return }

    this._doClose()
}

Agent.prototype._doClose = function () {
    for (const k in this._msgIdToReq) { this._msgIdToReq[k].sender.reset() }

    if (this._opts.socket) { return }

    this._sock.close()
    this._sock = null
}

Agent.prototype._handle = function handle (msg, rsinfo, outSocket) {
    const packet = parse(msg)
    let buf
    let response
    const that = this
    let req = this._msgIdToReq[packet.messageId]
    const ackSent = function (err) {
        if (err && req) { req.emit('error', err) }

        that._msgInFlight--
        if (that._closing && that._msgInFlight === 0) {
            that._doClose()
        }
    }
    if (!req) {
        if (packet.token.length > 0) {
            req = this._tkToReq[packet.token.toString('hex')]
        }

        if ((packet.ack || packet.reset) && !req) {
            // Nothing to do on unknown or duplicate ACK/RST packet
            return
        }

        if (!req) {
            buf = generate({
                code: '0.00',
                reset: true,
                messageId: packet.messageId
            })

            this._msgInFlight++
            this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent)
            return
        }
    }

    if (packet.confirmable) {
        buf = generate({
            code: '0.00',
            ack: true,
            messageId: packet.messageId
        })

        this._msgInFlight++
        this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent)
    }

    if (packet.code !== '0.00' && (req._packet.token.length !== packet.token.length || pf.compareBuffers(req._packet.token, packet.token) !== 0)) {
    // The tokens don't match, ignore the message since it is a malformed response
        return
    }

    const block1Buff = getOption(packet.options, 'Block1')
    let block1
    if (block1Buff) {
        block1 = parseBlockOption(block1Buff)
        // check for error
        if (!block1) {
            req.sender.reset()
            return req.emit('error', new Error('Failed to parse block1'))
        }
    }

    req.sender.reset()

    if (block1 && packet.ack) {
    // var initialRequest = this._msgIdToReq[packet.messageId];
    // If the client takes too long to respond then the retry sender will send
    // another packet with the previous messageId, which we've already removed.
        const segmentedSender = req.segmentedSender
        if (segmentedSender) {
            // If there's more to send/receive, then carry on!
            if (segmentedSender.remaining() > 0) {
                if (segmentedSender.isCorrectACK(packet, block1)) {
                    delete this._msgIdToReq[req._packet.messageId]
                    req._packet.messageId = that._nextMessageId()
                    this._msgIdToReq[req._packet.messageId] = req
                    segmentedSender.receiveACK(packet, block1)
                } else {
                    segmentedSender.resendPreviousPacket()
                }
                return
            } else {
                // console.log("Packet received done");
                removeOption(req._packet.options, 'Block1')
                delete req.segmentedSender
            }
        }
    }

    if (!packet.confirmable && !req.multicast) {
        delete this._msgIdToReq[packet.messageId]
    }

    // Drop empty messages (ACKs), but process RST
    if (packet.code === '0.00' && !packet.reset) {
        return
    }

    const block2Buff = getOption(packet.options, 'Block2')
    let block2
    // if we got blockwise (2) response
    if (block2Buff) {
        block2 = parseBlock2(block2Buff)
        // check for error
        if (!block2) {
            req.sender.reset()
            return req.emit('error', new Error('failed to parse block2'))
        }
    }
    if (block2) {
        if (req.multicast) {
            req = this._convertMulticastToUnicastRequest(req, rsinfo)
            if (!req) {
                return
            }
        }

        // accumulate payload
        req._totalPayload = Buffer.concat([req._totalPayload, packet.payload])

        if (block2.moreBlock2) {
            // increase message id for next request
            delete this._msgIdToReq[req._packet.messageId]
            req._packet.messageId = that._nextMessageId()
            this._msgIdToReq[req._packet.messageId] = req

            // next block2 request
            const block2Val = createBlock2({
                moreBlock2: false,
                num: block2.num + 1,
                size: block2.size
            })
            if (!block2Val) {
                req.sender.reset()
                return req.emit('error', new Error('failed to create block2'))
            }
            req.setOption('Block2', block2Val)
            req._packet.payload = null
            req.sender.send(generate(req._packet))

            return
        } else {
            // get full payload
            packet.payload = req._totalPayload
            // clear the payload incase of block2
            req._totalPayload = Buffer.alloc(0)
        }
    }

    if (req.response) {
        if (req.response.append) {
            // it is an observe request
            // and we are already streaming
            return req.response.append(packet)
        } else {
            // TODO There is a previous response but is not an ObserveStream !
            return
        }
    } else if (block2) {
        delete that._tkToReq[req._packet.token.toString('hex')]
    } else if (!req.url.observe && !req.multicast) {
    // it is not, so delete the token
        delete that._tkToReq[packet.token.toString('hex')]
    }

    if (req.url.observe && packet.code !== '4.04') {
        response = new ObserveStream(packet, rsinfo, outSocket)
        response.on('close', function () {
            delete that._tkToReq[packet.token.toString('hex')]
            that._cleanUp()
        })
        response.on('deregister', function () {
            const deregisterUrl = Object.assign({}, req.url)
            deregisterUrl.observe = 1
            deregisterUrl.token = req._packet.token

            const deregisterReq = that.request(deregisterUrl)
            // If the request fails, we'll deal with it with a RST message anyway.
            deregisterReq.on('error', function () {})
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

Agent.prototype._nextToken = function nextToken () {
    const buf = Buffer.alloc(8)

    if (++this._lastToken === maxToken) { this._lastToken = 0 }

    buf.writeUInt32BE(this._lastToken, 0)
    crypto.randomBytes(4).copy(buf, 4)

    return buf
}

Agent.prototype._nextMessageId = function nextToken () {
    if (++this._lastMessageId === maxMessageId) { this._lastMessageId = 1 }

    return this._lastMessageId
}

/**
 * Entry point for a new client-side request.
 * @param {*} url A String representing a CoAP URL, or an object with the appropriate parameters.
 */
Agent.prototype.request = function request (url) {
    this._init()

    const options = url.options || url.headers
    let option
    const that = this
    const multicastTimeout = url.multicastTimeout !== undefined ? parseInt(url.multicastTimeout) : 20000

    const req = new OutgoingMessage({}, function (req, packet) {
        let buf

        if (url.confirmable !== false) {
            packet.confirmable = true
        }

        // multicast message should be forced non-confirmable
        if (url.multicast === true) {
            req.multicast = true
            packet.confirmable = false
        }

        let token
        if (!(packet.ack || packet.reset)) {
            packet.messageId = that._nextMessageId()
            if ((url.token instanceof Buffer) && (url.token.length > 0)) {
                if (url.token.length > 8) {
                    return req.emit('error', new Error('Token may be no longer than 8 bytes.'))
                }
                packet.token = url.token
            } else {
                packet.token = that._nextToken()
            }
            token = packet.token.toString('hex')
            that._tkToMulticastResAddr[token] = []
            if (req.multicast) {
                that._tkToMulticastResAddr[token] = []
            }
        }

        that._msgIdToReq[packet.messageId] = req
        if (token) {
            that._tkToReq[token] = req
        }

        const block1Buff = getOption(packet.options, 'Block1')
        if (block1Buff) {
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
            req.sender.send(buf, !packet.confirmable)
        }
    })

    req.sender = new RetrySend(this._sock, url.port, url.hostname || url.host, url.retrySend)

    req.url = url

    req.statusCode = url.method || 'GET'

    urlPropertyToPacketOption(url, req, 'pathname', 'Uri-Path', '/')
    urlPropertyToPacketOption(url, req, 'query', 'Uri-Query', '&')

    if (options) {
        for (option in options) {
            if (Object.prototype.hasOwnProperty.call(options, option)) {
                req.setOption(option, options[option])
            }
        }
    }

    if (url.proxyUri) {
        req.setOption('Proxy-Uri', url.proxyUri)
    }

    req.sender.on('error', req.emit.bind(req, 'error'))

    req.sender.on('sending', function () {
        that._msgInFlight++
    })

    req.sender.on('timeout', function (err) {
        req.emit('timeout', err)
        that.abort(req)
    })

    req.sender.on('sent', function () {
        if (req.multicast) return

        that._msgInFlight--
        if (that._closing && that._msgInFlight === 0) {
            that._doClose()
        }
    })

    // Start multicast monitoring timer in case of multicast request
    if (url.multicast === true) {
        req.multicastTimer = setTimeout(function () {
            if (req._packet.token) {
                const token = req._packet.token.toString('hex')
                delete that._tkToReq[token]
                delete that._tkToMulticastResAddr[token]
            }
            delete that._msgIdToReq[req._packet.messageId]
            that._msgInFlight--
            if (that._msgInFlight === 0 && that._closing) {
                that._doClose()
            }
        }, multicastTimeout)
    }

    if (typeof (url.observe) === 'number') { req.setOption('Observe', url.observe) } else if (url.observe) { req.setOption('Observe', null) } else { req.on('response', this._cleanUp.bind(this)) }

    this._requests++

    req._totalPayload = Buffer.alloc(0)

    return req
}

Agent.prototype.abort = function (req) {
    req.sender.removeAllListeners()
    req.sender.reset()
    this._cleanUp()
    delete this._msgIdToReq[req._packet.messageId]
    if (req._packet.token) {
        delete this._tkToReq[req._packet.token.toString('hex')]
    }
}

function urlPropertyToPacketOption (url, req, property, option, separator) {
    if (url[property]) {
        req.setOption(option, url[property].normalize('NFC').split(separator)
            .filter(function (part) { return part !== '' })
            .map(function (part) {
                const buf = Buffer.alloc(Buffer.byteLength(part))
                buf.write(part)
                return buf
            }))
    }
}

Agent.prototype._convertMulticastToUnicastRequest = function (req, rsinfo) {
    const unicastReq = this.request(req.url)
    const unicastAddress = rsinfo.address.split('%')[0]
    const token = req._packet.token.toString('hex')
    if (this._tkToMulticastResAddr[token].includes(unicastAddress)) {
        return null
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
    this._tkToMulticastResAddr[token].push(unicastAddress)
    unicastReq._packet.token = this._nextToken()
    this._requests++
    return unicastReq
}

module.exports = Agent
