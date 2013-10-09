

const Readable = require('stream').Readable
    , util      = require('util')
    , convert    = require('./option_converter').fromBinary

function IncomingMessage(packet) {

  this._packet = packet
  this.payload = packet.payload
  this.options = packet.options
  this.headers = {}
  this._payloadIndex = 0

  this._parseOptions()

  Readable.call(this)
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

IncomingMessage.prototype._parseOptions = function() {
  var i
    , options = this._packet.options
    , option
    , paths   = []
    , queries = []
    , query   = ''

  for (i=0; i < options.length; i++) {
    option = options[i]

    if (option.name === 'Uri-Path') {
      paths.push(option.value)
    }

    if (option.name === 'Uri-Query') {
      queries.push(option.value)
    }

    option.value = convert(option.name, option.value)

    if (!Buffer.isBuffer(option.value))
      this.headers[option.name] = option.value
  }

  query = queries.join('&')
  this.url = '/' + paths.join('/')
  if (query) {
    this.url += '?' + query
  }
}

module.exports = IncomingMessage
