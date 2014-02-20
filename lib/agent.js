/*
 * Copyright (c) 2013-2014 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const bl              = require('bl')
    , util            = require('util')
    , events          = require('events')
    , dgram           = require('dgram')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , URL             = require('url')
    , IncomingMessage = require('./incoming_message')
    , OutgoingMessage = require('./outgoing_message')
    , ObserveStream   = require('./observe_read_stream')
    , parameters      = require('./parameters')
    , optionsConv     = require('./option_converter')
    , RetrySend       = require('./retry_send')
    , maxToken        = Math.pow(2, 32)
    , maxMessageId    = Math.pow(2, 16)

function Agent(opts) {
  if (!(this instanceof Agent))
    return new Agent()

  if (!opts)
    opts = {}

  if (!opts.type)
    opts.type = 'udp4'

  this._opts = opts

  this._init()
}

util.inherits(Agent, events.EventEmitter)

Agent.prototype._init = function initSock() {
  if (this._sock)
    return

  var that = this
  this._sock = dgram.createSocket(this._opts.type, function(msg, rsinfo) {
    var packet
      , message

    try {
      packet = parse(msg)
    } catch(err) {
      message = generate({ code: '5.00', payload: new Buffer('Unable to parse packet') })
      that._sock.send(message, 0, message.length,
                      rsinfo.port, rsinfo.address)
      return
    }
    that._handle(msg, rsinfo)
  })

  if(this._opts.port){
    this._sock.bind( this._opts.port );
  }; 

  this._sock.on('error', function(err) {
    // we are skipping DNS errors
    if(err.code !== 'ENOTFOUND')
      that.emit('error', err)
  })

  this._msgIdToReq = {}
  this._tkToReq = {}

  this._lastToken = Math.floor(Math.random() * (maxToken - 1))
  this._lastMessageId = Math.floor(Math.random() * (maxMessageId - 1))

  this._closing = false
  this._msgInFlight = 0
  this._requests = 0
}

Agent.prototype._cleanUp = function cleanUp() {
  if (--this._requests !== 0)
    return

  this._closing = true

  if (this._msgInFlight !== 0)
    return

  this._doClose()
}

Agent.prototype._doClose = function() {
  for (var k in this._msgIdToReq)
    this._msgIdToReq[k].sender.reset()

  this._sock.close()
  this._sock = null
}

Agent.prototype._handle = function handle(msg, rsinfo) {
  var packet = parse(msg)
    , buf
    , response
    , that = this
    , req = this._msgIdToReq[packet.messageId]
    , ackSent = function(err) {
        if (err && req)
          req.emit('error', err)

        that._msgInFlight--
        if (that._closing && that._msgInFlight === 0) {
          that._doClose()
        }
      }

  if (packet.confirmable) {
    buf = generate({
        code: '0.00'
      , ack: true
      , messageId: packet.messageId
    })

    this._msgInFlight++
    this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent)
  }

  if (!req) {
    if (packet.token.length == 4) {
      req = this._tkToReq[packet.token.readUInt32BE(0)]
    }

    if (packet.ack && !req) {
      // nothing to do, somehow there was
      // a duplicate ack
      return
    }

    if (!req) {
      buf = generate({
          code: '0.00'
        , reset: true
        , messageId: packet.messageId
      })

      this._msgInFlight++
      this._sock.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, ackSent)
      return
    }
  }

  if (!packet.confirmable)
    delete this._msgIdToReq[packet.messageId]

  req.sender.reset()

  if (packet.code == '0.00')
    return

  if (req.response)
    // it is an observe request
    // and we are already streaming
    return req.response.append(packet)
  else if (!req.url.observe)
    // it is not, so delete the token
    delete that._tkToReq[packet.token.readUInt32BE(0)]

  if (req.url.observe && packet.code !== '4.04') {
    response = new ObserveStream(packet, rsinfo)
    response.on('close', function() {
      delete that._tkToReq[packet.token.readUInt32BE(0)]
      that._cleanUp()
    })
  } else
    response = new IncomingMessage(packet, rsinfo)

  req.response = response
  req.emit('response', response)
}

Agent.prototype._nextToken = function nextToken() {
  var buf = new Buffer(4)

  if (++this._lastToken === maxToken)
    this._lastToken = 0

  buf.writeUInt32BE(this._lastToken, 0)

  return buf;
}

Agent.prototype._nextMessageId = function nextToken() {
  if (++this._lastMessageId === maxMessageId)
    this._lastMessageId = 1

  return this._lastMessageId
}

Agent.prototype.request = function request(url) {
  this._init()

  var req, response
    , that = this

  req = new OutgoingMessage({}, function(req, packet) {
    var buf

    if (url.confirmable !== false) {
      packet.confirmable = true
    }

    if (!(packet.ack || packet.reset)) {
      packet.messageId = that._nextMessageId()
      packet.token = that._nextToken()
    }

    try {
      buf = generate(packet)
    } catch(err) {
      req.sender.reset()
      return req.emit('error', err)
    }

    that._msgIdToReq[packet.messageId] = req
    that._tkToReq[that._lastToken] = req

    req.sender.send(buf)
  })

  req.sender = new RetrySend(this._sock, url.port, url.hostname || url.host)

  req.url = url

  req.statusCode = url.method || 'GET'

  urlPropertyToPacketOption(url, req, 'pathname', 'Uri-Path', '/')
  urlPropertyToPacketOption(url, req, 'query', 'Uri-Query', '&')

  req.sender.on('error', req.emit.bind(req, 'error'))

  req.sender.on('sending', function() {
    that._msgInFlight++
  })

  req.sender.on('sent', function() {
    that._msgInFlight--
    if (that._closing && that._msgInFlight === 0) {
      that._doClose()
    }
  })

  if (url.observe)
    req.setOption('Observe', null)
  else
    req.on('response', this._cleanUp.bind(this))

  this._requests++

  return req
}

function urlPropertyToPacketOption(url, req, property, option, separator) {
  if (url[property])
    req.setOption(option, url[property].split(separator)
         .filter(function(part) { return part !== '' })
         .map(function(part) {

      var buf = new Buffer(Buffer.byteLength(part))
      buf.write(part)
      return buf
    }))
}

module.exports = Agent
