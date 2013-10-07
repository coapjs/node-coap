
const BufferList = require('bl')
    , util       = require('util')
    , generate  = require('coap-packet').generate

function CoAPServerResponse(request, rsinfo, sock) {
  BufferList.call(this)

  this._packet = {
      messageId: request.messageId
    , token: request.token
  }
  this._rsinfo = rsinfo
  this._sock   = sock

  this.statusCode = '2.00'
}

util.inherits(CoAPServerResponse, BufferList)

CoAPServerResponse.prototype.end = function(a, b) {
  BufferList.prototype.end.call(this, a, b)

  var packet = this._packet
    , message
    , that = this

  packet.code = toCode(this.statusCode)
  packet.payload = this.slice()
  message = generate(packet)

 this._sock.send(message, 0, message.length, this._rsinfo.port, this._rsinfo.address, function(err) {
   if (err)
     that.emit('error', err)
 })
}

function toCode(code) {
  if (typeof code === 'string')
    return code

  var first  = Math.floor(code / 100)
    , second = code - first * 100
    , result = ''

  result += first + '.'

  if (second < 10)
    result += '0'

  result += second

  return result
}

module.exports = CoAPServerResponse
