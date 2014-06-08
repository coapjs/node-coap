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
    , _               = require('underscore')
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

  var block2 = _parseBlock2(packet.options);
  if (block2) {
    // accumulate payload
    req._totalPayload = Buffer.concat([req._totalPayload, packet.payload])

    if (block2.moreBlock2) {
      // increase message id for next request
      delete this._msgIdToReq[req._packet.messageId]
      req._packet.messageId = that._nextMessageId()
      this._msgIdToReq[req._packet.messageId] = req 

      // next block2 request
      // set block2 option, remove token
      var nextRequest = _.clone(req._packet)
      nextRequest = _packetSetBlock2(nextRequest, block2.num, block2.size)

      if (nextRequest.token)
        delete nextRequest.token

      var buf = generate(nextRequest)
      req.sender.send(buf)
      return
    }
    else {
      // get full payload
      packet.payload = req._totalPayload
      // clear the payload incase of block2
      req._totalPayload = new Buffer(0)
    }
  }

  if (req.response) {
    // it is an observe request
    // and we are already streaming
    return req.response.append(packet)
  }
  else if (block2) {
    delete that._tkToReq[req._packet.token.readUInt32BE(0)]
  }
  else if (!req.url.observe)
    // it is not, so delete the token
    delete that._tkToReq[packet.token.readUInt32BE(0)]

  if (req.url.observe && packet.code !== '4.04') {
    response = new ObserveStream(packet, rsinfo)
    response.on('close', function() {
      delete that._tkToReq[packet.token.readUInt32BE(0)]
      that._cleanUp()
    })
  } else {
    response = new IncomingMessage(packet, rsinfo)
  }

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

  req._totalPayload = new Buffer(0) 

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

function _parseBlock2(options) {
  for (var i in options) {
    if (options[i].name == 'Block2') {
      var block2Value = options[i].value
      var num
      switch (block2Value.length) {
        case 1:
        num = block2Value[0] >> 4
        break
        case 2:
        num = (block2Value[0]*256 + block2Value[1]) >> 4
        break
        case 3:
        num = (block2Value[0]*256*256 + block2Value[1]*256 + block2Value[2]) >>4
        break
        default:
        throw new Error('Too long block2 option size: '+block2Value.length)
      }
      return {
        moreBlock2: (block2Value.slice(-1)[0] & (0x01<<3))? true:false,
        num: num,
        size: Math.pow(2, (block2Value.slice(-1)[0] & 0x07)+4)
      }
    }
  }
  return null;
}

function _packetSetBlock2(packet, number, size) {
  if (size < 16) size = 16
  if (size > 1024) size = 1024
  if (number > 0xfffff)
    throw new Error('Block2 number access limit of 1048575, has:', number)

  var buffer = new Buffer(4)
  var block2Value = ((Math.log(size)/Math.log(2)-4)&0x07) + (number+1<<4)

  buffer.writeUInt32BE(block2Value,0)

  if (block2Value < 0xff) {
    buffer = buffer.slice(3,4);
  }
  else if (block2Value < 0xffff) {
    buffer = buffer.slice(2,4);
  }
  else {
    buffer = buffer.slice(1,4);
  } 
  var hasBlock = false;
  for (i in packet.options) {
    if (packet.options[i] && packet.options[i].name == 'Block2') {
      packet.options[i].value = buffer
      hasBlock = true;
    }
  }
  if (!hasBlock) {
    packet.options.push({
      name: 'Block2',
      value: buffer
    })
  }
  return packet
}

module.exports = Agent
