'use strict'

/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const BufferList = require('bl')
const util = require('util')
const helpers = require('./helpers')
const toCode = helpers.toCode

function OutgoingMessage (request, send) {
  BufferList.call(this)

  this._packet = {
    messageId: request.messageId,
    token: request.token,
    options: [],
    confirmable: false,
    ack: false,
    reset: false
  }

  const that = this

  if (request.confirmable) {
    // replying in piggyback
    this._packet.ack = true

    this._ackTimer = setTimeout(function () {
      send(that, helpers.genAck(request))

      // we are no more in piggyback
      that._packet.confirmable = true
      that._packet.ack = false

      // we need a new messageId for the CON
      // reply
      delete that._packet.messageId

      that._ackTimer = null
    }, request.piggybackReplyMs)
  }

  this._send = send

  this.statusCode = ''
  this.code = ''
}

util.inherits(OutgoingMessage, BufferList)
helpers.addSetOption(OutgoingMessage)

OutgoingMessage.prototype.end = function (a, b) {
  BufferList.prototype.end.call(this, a, b)

  const packet = this._packet

  packet.code = toCode(this.code || this.statusCode)
  packet.payload = this

  if (this._ackTimer) { clearTimeout(this._ackTimer) }

  this._send(this, packet)

  // easy clean up after generating the packet
  delete this._packet.payload

  return this
}

OutgoingMessage.prototype.reset = function () {
  BufferList.prototype.end.call(this)

  const packet = this._packet

  packet.code = '0.00'
  packet.payload = ''
  packet.reset = true
  packet.ack = false
  packet.token = ''

  if (this._ackTimer) { clearTimeout(this._ackTimer) }

  this._send(this, packet)

  // easy clean up after generating the packet
  delete this._packet.payload

  return this
}

OutgoingMessage.prototype.writeHead = function (code, headers) {
  const packet = this._packet
  let header
  packet.code = String(code).replace(/(^\d[^.])/, '$1.')
  for (header in headers) {
    if (Object.prototype.hasOwnProperty.call(headers, header)) {
      this.setOption(header, headers[header])
    }
  }
}

module.exports = OutgoingMessage
