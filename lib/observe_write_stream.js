
const Writable = require('stream').Writable
    , util       = require('util')
    , helpers    = require('./helpers')
    , toCode     = helpers.toCode

function ObserveWriteStream(request, send) {
  Writable.call(this)

  this._packet = {
      token: request.token
    , options: []
    , confirmable: request.confirmable
    , ack: false
    , reset: false
  }

  if (request.confirmable) {
    // ack the request straight away
    send(this, helpers.genAck(request))
  }

  this._send = send
  this.statusCode = ''

  this._counter = 0
}

util.inherits(ObserveWriteStream, Writable)
helpers.addSetOption(ObserveWriteStream)

ObserveWriteStream.prototype._write = function write(data, encoding, done) {
  var packet = this._packet
  this.setOption('Observe', ++this._counter)
  packet.payload = data
  this._send(this, packet)

  delete this._packet.messageId
  delete this._packet.payload
  done()
}

module.exports = ObserveWriteStream
