
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
}

util.inherits(CoAPServerResponse, BufferList)

CoAPServerResponse.prototype.end = function(a, b) {
  BufferList.prototype.end.call(this, a, b)

  var packet = this._packet
    , message
    , that = this

  packet.payload = this.slice()
  message = generate(packet)

 this._sock.send(message, 0, message.length, this._rsinfo.port, this._rsinfo.address, function(err) {
   if (err)
     that.emit('error', err)
 })
}

module.exports = CoAPServerResponse
