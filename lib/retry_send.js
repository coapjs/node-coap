'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const parameters = require('./parameters')
const util = require('util')
const EventEmitter = require('events').EventEmitter
const parse = require('coap-packet').parse

function RetrySend (sock, port, host, maxRetransmit) {
    if (!(this instanceof RetrySend)) {
        return new RetrySend(sock, port, host, maxRetransmit)
    }

    const that = this

    this._sock = sock

    this._port = port || parameters.coapPort

    this._host = host

    this._maxRetransmit = maxRetransmit || parameters.maxRetransmit
    this._sendAttemp = 0
    this._lastMessageId = -1
    this._currentTime = parameters.ackTimeout * (1 + (parameters.ackRandomFactor - 1) * Math.random()) * 1000

    this._bOff = function () {
        that._currentTime = that._currentTime * 2
        that._send()
    }
}

util.inherits(RetrySend, EventEmitter)

RetrySend.prototype._send = function (avoidBackoff) {
    const that = this

    this._sock.send(this._message, 0, this._message.length,
        this._port, this._host, function (err, bytes) {
            that.emit('sent', err, bytes)
            if (err) {
                that.emit('error', err)
            }
        })

    const messageId = parse(this._message).messageId
    if (messageId !== this._lastMessageId) {
        this._lastMessageId = messageId
        this._sendAttemp = 0
    }

    if (!avoidBackoff && ++this._sendAttemp <= this._maxRetransmit) { this._bOffTimer = setTimeout(this._bOff, this._currentTime) }

    this.emit('sending', this._message)
}

RetrySend.prototype.send = function (message, avoidBackoff) {
    const that = this

    this._message = message
    this._send(avoidBackoff)

    const timeout = avoidBackoff ? parameters.maxRTT : parameters.exchangeLifetime
    this._timer = setTimeout(function () {
        const err = new Error('No reply in ' + timeout + 's')
        err.retransmitTimeout = timeout
        if (!avoidBackoff) { that.emit('error', err) }
        that.emit('timeout', err)
    }, timeout * 1000)
}

RetrySend.prototype.reset = function () {
    clearTimeout(this._timer)
    clearTimeout(this._bOffTimer)
}

module.exports = RetrySend
