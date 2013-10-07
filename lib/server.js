const dgram           = require('dgram')
    , util            = require('util')
    , events          = require('events')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , IncomingMessage = require('./incoming_message')
    , ServerResponse  = require('./server_response')
    , coapPort  = 5683

function CoAPServer() {
  if (!(this instanceof CoAPServer)) {
    return new CoAPServer()
  }

  var that = this
  this._sock = dgram.createSocket('udp4', function(msg, rsinfo) {
    try {
      that._handle(msg, rsinfo)
    } catch(err) {
      that.emit('error', err)
    }
  })

}

util.inherits(CoAPServer, events.EventEmitter)

CoAPServer.prototype.listen = function(port, address, done) {
  if (typeof address === 'function') {
    done = address
    address = null
  }

  this._sock.bind(port, address, done)
  this._port = port
  this._address = address

  return this
}

CoAPServer.prototype.close = function(done) {
  this._sock.close()
  if (done) {
    done()
  }

  return this
}

CoAPServer.prototype._handle = function(msg, rsinfo) {
  var packet   = parse(msg)
    , request  = new IncomingMessage(packet)
    , response = new ServerResponse(packet, rsinfo, this._sock)

  this.emit('request', request, response)
}

module.exports = CoAPServer
