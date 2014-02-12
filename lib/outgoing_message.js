/*
 * Copyright (c) 2013-2014 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const BufferList = require('bl')
    , util       = require('util')
    , helpers    = require('./helpers')
    , toCode     = helpers.toCode

function OutgoingMessage(request, send) {
  BufferList.call(this)

  this._packet = {
      messageId: request.messageId
    , token: request.token
    , options: []
    , confirmable: false
    , ack: false
    , reset: false
  }

  var that = this

  if (request.confirmable) {
    // replying in piggyback
    this._packet.ack = true

    this._ackTimer = setTimeout(function() {

      send(that, helpers.genAck(request))

      // we are no more in piggyback
      that._packet.confirmable = true
      that._packet.ack = false

      // we need a new messageId for the CON
      // reply
      delete that._packet.messageId

      that._ackTimer = null

    }, 50)
  }

  this._send = send

  this.statusCode = ''
}

util.inherits(OutgoingMessage, BufferList)
helpers.addSetOption(OutgoingMessage)

OutgoingMessage.prototype.end = function(a, b) {
  BufferList.prototype.end.call(this, a, b)

  var packet = this._packet
    , message
    , that = this

  packet.code = toCode(this.statusCode)
  packet.payload = this

  this._send(this, packet)

  // easy clean up after generating the packet
  delete this._packet.payload

  if (this._ackTimer)
    clearTimeout(this._ackTimer)
  
  return this
}

module.exports = OutgoingMessage
