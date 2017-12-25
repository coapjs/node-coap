'use strict';

/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var Readable  = require('readable-stream').Readable
  , util      = require('util')
  , pktToMsg  = require('./helpers').packetToMessage

function IncomingMessage(packet, rsinfo, outSocket) {
  Readable.call(this)

  pktToMsg(this, packet)

  this.rsinfo = rsinfo
  this.outSocket = outSocket

  this._packet = packet
  this._payloadIndex = 0
}

util.inherits(IncomingMessage, Readable)

IncomingMessage.prototype._read = function(size) {
  var end     = this._payloadIndex + size
    , start   = this._payloadIndex
    , payload = this._packet.payload
    , buf     = null

  if (start < payload.length)
    buf = payload.slice(start, end)

  this._payloadIndex = end
  this.push(buf)
}

module.exports = IncomingMessage
