/*
 * Copyright (c) 2013-2014 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const dgram           = require('dgram')
    , util            = require('util')
    , events          = require('events')
    , LRU             = require('lru-cache')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , IncomingMessage = require('./incoming_message')
    , OutgoingMessage = require('./outgoing_message')
    , ObserveStream   = require('./observe_write_stream')
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

  if (!options.type)
    options.type = 'udp4'

  var that = this
  this._sock = dgram.createSocket(options.type, function(msg, rsinfo) {
    var packet
    try {
      packet = parse(msg)
    } catch(err) {
      return that._sendError(new Buffer('Unable to parse packet'), rsinfo)
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

CoAPServer.prototype._sendError = function(payload, rsinfo) {
  var message = generate({ code: '5.00', payload: payload })
  this._sock.send(message, 0, message.length,
                  rsinfo.port, rsinfo.address)
}

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
    setImmediate(done)
  }

  this._sock = null

  return this
}

CoAPServer.prototype._handle = function(packet, rsinfo) {

  var sock      = this._sock
    , lru       = this._lru
    , acks      = this._acks
    , cached    = lru.peek(toKey(rsinfo.address, rsinfo.port, packet, true))
    , Message   = OutgoingMessage
    , that = this
    , request
    , response

  if (cached && !packet.ack && !packet.reset)
    return sock.send(cached, 0, cached.length, rsinfo.port, rsinfo.address)
  else if (cached && (packet.ack || packet.reset)) {
    if (cached.response && packet.reset)
      cached.response.end()
    return lru.del(toKey(rsinfo.address, rsinfo.port, packet, false))
  }
  else if (packet.ack || packet.reset)
    return // nothing to do, ignoring silently

  request = new IncomingMessage(packet)

  if (request.headers['Observe'] === 0) {
    Message = ObserveStream
    if (packet.code !== '0.01')
      // it is not a GET
      return this._sendError(new Buffer('Observe can only be present with a GET'), rsinfo)
  }

  response = new Message(packet, function(response, packet) {
    var buf
      , sender = new RetrySend(sock, rsinfo.port,
                               rsinfo.address)

    try {
      buf = generate(packet)
    } catch(err) {
      return response.emit('error', err)
    }

    if (Message === OutgoingMessage) {
      sender.on('error', response.emit.bind(response, 'error'))
    } else {
      buf.response = response
      sender.on('error', function() {
        response.end()
      })
    }

    lru.set(toKey(rsinfo.address, rsinfo.port,
                  packet, packet.ack || !packet.confirmable), buf)

    buf.sender = sender

    sender.send(buf, packet.ack || packet.reset || packet.confirmable === false)
  })

  request.rsinfo = rsinfo
  response.statusCode = '2.05'

  this.emit('request', request, response)
}

function toKey(address, port, packet, appendToken) {
  var result = address + port + packet.messageId

  if (appendToken)
    result += packet.token.toString('hex')

  return result
}

module.exports = CoAPServer
