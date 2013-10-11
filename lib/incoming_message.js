
const Readable  = require('stream').Readable
    , util      = require('util')
    , pktToMsg  = require('./helpers').packetToMessage

function IncomingMessage(packet) {
  Readable.call(this)

  pktToMsg(this, packet)

  this._packet = packet
  this._payloadIndex = 0
}

util.inherits(IncomingMessage, Readable)

IncomingMessage.prototype._read = function(size) {
  var end     = this._payloadIndex + size
    , start   = this._payloadIndex
    , payload = this._packet.payload
    , buf

  if (start < payload.length)
    buf = payload.slice(start, end)

  this._payloadIndex = end
  this.push(buf)
}

module.exports = IncomingMessage
