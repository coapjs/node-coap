
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
}

util.inherits(ObserveWriteStream, Writable)
helpers.addSetOption(ObserveWriteStream)

ObserveWriteStream.prototype._write = function write(data, encoding, done) {
  var packet = this._packet
  this.setOption('Observe', ++this._counter)

  if (this._counter === 16777215)
    this._counter = 1

  packet.code = this.statusCode
  packet.payload = data
  this._send(this, packet)

  this._packet.confirmable = this._request.confirmable
  this._packet.ack = !this._request.confirmable
  delete this._packet.messageId
  delete this._packet.payload

  done()
}

module.exports = ObserveWriteStream
