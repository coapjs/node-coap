
const Readable  = require('stream').Readable
    , util      = require('util')
    , pktToMsg  = require('./helpers').packetToMessage

function ObserveReadStream(packet) {
  Readable.call(this, { objectMode: true })

  this._lastId = 0
  this.append(packet)
}

util.inherits(ObserveReadStream, Readable)

ObserveReadStream.prototype.append = function(packet) {
  if (!this.readable)
    return

  pktToMsg(this, packet)
  if (this.headers['Observe'] > this._lastId) {
    this._lastId = this.headers['Observe']
    this.push(packet.payload)
  }
}

ObserveReadStream.prototype.close = function() {
  this.push(null)
  this.emit('close')
}

// nothing to do, data will be pushed from the server
ObserveReadStream.prototype._read = function() {}

module.exports = ObserveReadStream
