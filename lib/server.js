const dgram           = require('dgram')
    , util            = require('util')
    , events          = require('events')
    , LRU             = require('lru-cache')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , IncomingMessage = require('./incoming_message')
    , OutgoingMessage = require('./outgoing_message')
    , parameters      = require('./parameters')
    , RetrySend       = require('./retry_send')

function CoAPServer(options, listener) {
  if (!(this instanceof CoAPServer)) {
    return new CoAPServer(options)
  }

  if (typeof options === 'function') {
    listener = options
    options = null
  }

  if (!options)
    options = {}

  var that = this
  this._sock = dgram.createSocket('udp4', function(msg, rsinfo) {
    var packet
    try {
      packet = parse(msg)
    } catch(err) {
      var message = generate({ code: '5.00', payload: new Buffer('Unable to parse packet') })
      that._sock.send(message, 0, message.length,
                      rsinfo.port, rsinfo.address)
      return
    }

    that._handle(packet, rsinfo)
  })

  // We use an LRU cache for the responses to avoid
  // DDOS problems.
  // max packet size is 1280
  // 32 MB / 1280 = 26214
  // The max lifetime is roughly 200s per packet.
  // Which gave us 131 packets/second guarantee
  this._lru = LRU({
      max: options.cacheSize || (32768 * 1024)
    , length: function(n) { return n.length }
    , maxAge: parameters.exchangeLifetime
    , dispose:  function(key, value) {
                  if (value.sender)
                    value.sender.reset()
                }
  })

  if (listener)
    this.on('request', listener)
}

util.inherits(CoAPServer, events.EventEmitter)

CoAPServer.prototype.listen = function(port, address, done) {
  if (typeof port === 'function') {
    done = port
    port = parameters.coapPort
  }

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

  this._lru.reset()

  if (done) {
    done()
  }

  return this
}

CoAPServer.prototype._handle = function(packet, rsinfo) {
  var sender    = new RetrySend(this._sock, rsinfo.port, 
                                rsinfo.address)

    , lru       = this._lru
    , acks      = this._acks
    , cached    = lru.peek(toKey(rsinfo.address, rsinfo.port, packet))

    , request
    , response

  if (cached && !packet.ack)
    return sender.send(cached)
  else if (cached && packet.ack)
    return lru.del(toKey(rsinfo.address, rsinfo.port, packet))
  else if (packet.ack)
    return // nothing to do, ignoring silently

  request = new IncomingMessage(packet)
  response = new OutgoingMessage(packet, function(packet) {
    var buf

    try {
      buf = generate(packet)
    } catch(err) {
      return response.emit('error', err)
    }

    if (!packet.ack)
      buf.sender = sender

    if (!cached)
      lru.set(toKey(rsinfo.address, rsinfo.port, packet), buf)

    sender.send(buf, !packet.ack)
  })

  response.statusCode = '2.00'

  sender.on('error', response.emit.bind(response, 'error'))

  this.emit('request', request, response)
}

function toKey(address, port, packet) {
  return address + port + packet.token.toString('hex') + packet.messageId
}

module.exports = CoAPServer
