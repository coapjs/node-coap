/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var bl              = require('bl')
  , util            = require('util')
  , events          = require('events')
  , dgram           = require('dgram')
  , parse           = require('coap-packet').parse
  , generate        = require('coap-packet').generate
  , URL             = require('url')
  , IncomingMessage = require('./incoming_message')
  , OutgoingMessage = require('./outgoing_message')
  , ObserveStream   = require('./observe_read_stream')
  , optionsConv     = require('./option_converter')
  , RetrySend       = require('./retry_send')
  , parseBlock2     = require('./helpers').parseBlock2
  , createBlock2    = require('./helpers').createBlock2
  , getOption       = require('./helpers').getOption
  , maxToken        = Math.pow(2, 32)
  , maxMessageId    = Math.pow(2, 16)
  , pf              = require('./polyfill')
  , hasDNSbug       = true

;(function () {
  var major = parseInt(process.version.match(/^v([^.]+).*$/)[1])

  if (major >= 4) {
    hasDNSbug = false
  }
})()

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
      , outSocket

    try {
      packet = parse(msg)
    } catch(err) {
      message = generate({ code: '5.00', payload: new Buffer('Unable to parse packet') })
      that._sock.send(message, 0, message.length,
                      rsinfo.port, rsinfo.address)
      return
    }

    outSocket = that._sock.address();
    that._handle(msg, rsinfo, outSocket)
  })

  if(this._opts.port){
    this._sock.bind( this._opts.port );
  };

  this._sock.on('error', function(err) {
    // we are skipping DNS errors
    if(!hasDNSbug || err.code !== 'ENOTFOUND')
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

Agent.prototype._handle = function handle(msg, rsinfo, outSocket) {
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
  } else if (packet.code != '0.00' && (req._packet.token.length != packet.token.length || pf.compareBuffers(req._packet.token, packet.token) != 0)) {
    // The tokens don't match, ignore the message since it is a malformed response
    return
  }

  if (!packet.confirmable && !req.multicast) {
    delete this._msgIdToReq[packet.messageId]
  }

  req.sender.reset()

  if (packet.code == '0.00')
    return

  var block2Buff = getOption(packet.options, 'Block2')
  var block2
  // if we got blockwise (2) response
  if (block2Buff) {
    block2 = parseBlock2(block2Buff)
    // check for error
    if (!block2) {
      req.sender.reset()
      return req.emit('error', new Error('failed to parse block2'))
    }
  }
  if (block2) {
    // accumulate payload
    req._totalPayload = Buffer.concat([req._totalPayload, packet.payload])

    if (block2.moreBlock2) {
      // increase message id for next request
      delete this._msgIdToReq[req._packet.messageId]
      req._packet.messageId = that._nextMessageId()
      this._msgIdToReq[req._packet.messageId] = req

      // next block2 request
      var block2Val = createBlock2({
        moreBlock2: false,
        num: block2.num+1,
        size: block2.size
      })
      if (!block2Val) {
        req.sender.reset()
        return req.emit('error', new Error('failed to create block2'))
      }
      req.setOption('Block2', block2Val)
      req.sender.send(generate(req._packet))

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
    if (req.response.append) {
      // it is an observe request
      // and we are already streaming
      return req.response.append(packet)
    } else {
      // TODO There is a previous response but is not an ObserveStream !
      return
    }

  }
  else if (block2) {
    delete that._tkToReq[req._packet.token.readUInt32BE(0)]
  }
  else if (!req.url.observe && packet.token.length > 0) {
    // it is not, so delete the token
    delete that._tkToReq[packet.token.readUInt32BE(0)]
  }

  if (req.url.observe && packet.code !== '4.04') {
    response = new ObserveStream(packet, rsinfo, outSocket)
    response.on('close', function() {
      delete that._tkToReq[packet.token.readUInt32BE(0)]
      that._cleanUp()
    })
  } else {
    response = new IncomingMessage(packet, rsinfo, outSocket)
  }

  if (!req.multicast) {
    req.response = response
  }

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

  var req
    , response
    , options = url.options || url.headers
    , option
    , that = this
    , multicastTimeout = url.multicastTimeout !== undefined ? parseInt(url.multicastTimeout) : 20000

  req = new OutgoingMessage({}, function(req, packet) {
    var buf

    if (url.confirmable !== false) {
      packet.confirmable = true
    }

    // multicast message should be forced non-confirmable
    if (url.multicast === true) {
      req.multicast = true
      packet.confirmable = false
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

  if (options) {
    for (option in options) {
      if (options.hasOwnProperty(option)) {
        req.setOption(option, options[option])
      }
    }
  }

  if (url.proxyUri) {
    req.setOption('Proxy-Uri', url.proxyUri)
  }

  req.sender.on('error', req.emit.bind(req, 'error'))

  req.sender.on('sending', function() {
    that._msgInFlight++
  })

  req.sender.on('timeout', function (err) {
    req.emit('timeout', err)
    that.abort(req)
  })

  req.sender.on('sent', function() {
    if (req.multicast) return;

    that._msgInFlight--
    if (that._closing && that._msgInFlight === 0) {
      that._doClose()
    }
  })

  // Start multicast monitoring timer in case of multicast request
  if (url.multicast === true) {
    req.multicastTimer = setTimeout(function() {
      that._msgInFlight--
      if (that._msgInFlight === 0) {
        that._doClose()
      }
    }, multicastTimeout)
  }

  if (url.observe)
    req.setOption('Observe', null)
  else
    req.on('response', this._cleanUp.bind(this))

  this._requests++

  req._totalPayload = new Buffer(0)

  return req
}

Agent.prototype.abort = function (req) {
  req.sender.removeAllListeners()
  req.sender.reset()
  this._cleanUp()
  delete this._msgIdToReq[req._packet.messageId]
  delete this._tkToReq[req._packet.token.readUInt32BE(0)]
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
