/*
 * Copyright (c) 2013-2014 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const Writable = require('stream').Writable
    , util       = require('util')
    , helpers    = require('./helpers')
    , toCode     = helpers.toCode

function ObserveWriteStream(request, send) {
  Writable.call(this)

  this._packet = {
      token: request.token
    , messageId: request.messageId
    , options: []
    , confirmable: false
    , ack: request.confirmable
    , reset: false
  }

  this._request = request
  this._send = send
  this.statusCode = ''

  this._counter = 0

  var that = this
  this.on('finish', function() {
    if (that._counter === 0) { // we have sent no messages
      that._doSend(null)
    }
  })
}

util.inherits(ObserveWriteStream, Writable)
helpers.addSetOption(ObserveWriteStream)

ObserveWriteStream.prototype._write = function write(data, encoding, done) {
  this.setOption('Observe', ++this._counter)

  if (this._counter === 16777215)
    this._counter = 1

  this._doSend(data)

  done()
}

ObserveWriteStream.prototype._doSend = function doSend(data) {
  var packet = this._packet
  packet.code = this.statusCode
  packet.payload = data
  this._send(this, packet)

  this._packet.confirmable = this._request.confirmable
  this._packet.ack = !this._request.confirmable
  delete this._packet.messageId
  delete this._packet.payload
}

module.exports = ObserveWriteStream
