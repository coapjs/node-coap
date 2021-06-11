'use strict';

/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

require('./polyfill')

var dgram            = require('dgram')
  , os               = require('os')
  , net              = require('net')
  , util             = require('util')
  , series           = require('fastseries')
  , events           = require('events')
  , LRU              = require('lru-cache')
  , generate         = require('coap-packet').generate
  , IncomingMessage  = require('./incoming_message')
  , OutgoingMessage  = require('./outgoing_message')
  , ObserveStream    = require('./observe_write_stream')
  , parameters       = require('./parameters')
  , RetrySend        = require('./retry_send')
  , parseBlock2      = require('./helpers').parseBlock2
  , createBlock2     = require('./helpers').createBlock2
  , getOption        = require('./helpers').getOption
  , isNumeric        = require('./helpers').isNumeric
  , isBoolean        = require('./helpers').isBoolean
  , middlewares      = require('./middlewares')
  , debug            = require('debug')('CoAP Server')
  , parseBlockOption = require('./block').parseBlockOption
  , BlockCache       = require('./cache')

function handleEnding(err) {
  var request = this
  if (err) {
    request.server._sendError(Buffer.from(err.message), request.rsinfo, request.packet)
  }
}

function CoAPServer(options, listener) {
  if (!(this instanceof CoAPServer)) {
    return new CoAPServer(options, listener)
  }

  if (typeof options === 'function') {
    listener = options
    options = null
  }

  if (!options)
    options = {}

  this._options = options
  this._proxiedRequests = {}

  this._middlewares = [
    middlewares.parseRequest
  ]

  if (options.proxy) {
    this._middlewares.push(middlewares.proxyRequest)
    this._middlewares.push(middlewares.handleProxyResponse)
  }

  if (!this._options.piggybackReplyMs || !isNumeric(this._options.piggybackReplyMs)) {
    this._options.piggybackReplyMs = parameters.piggybackReplyMs
  }

  if (!isBoolean(this._options.sendAcksForNonConfirmablePackets)) {
    this._options.sendAcksForNonConfirmablePackets = parameters.sendAcksForNonConfirmablePackets
  }
  this._middlewares.push(middlewares.handleServerRequest)

  // Multicast settings
  this._multicastAddress = options.multicastAddress ? options.multicastAddress : null
  this._multicastInterface = options.multicastInterface ? options.multicastInterface : null

  // We use an LRU cache for the responses to avoid
  // DDOS problems.
  // max packet size is 1280
  // 32 MB / 1280 = 26214
  // The max lifetime is roughly 200s per packet.
  // Which gave us 131 packets/second guarantee
  this._lru = new LRU({
      max: options.cacheSize || (32768 * 1024)
    , length: function(n) { return n.buffer.byteLength }
    , maxAge: (parameters.exchangeLifetime * 1000)
    , dispose:  function(key, value) {
                  if (value.sender)
                    value.sender.reset()
                }
  })
  
  this._series = series()
  
  this._block1Cache = new BlockCache(parameters.exchangeLifetime * 1000, () => {
    return {};
  })
  this._block2Cache = new BlockCache(parameters.exchangeLifetime * 1000, () => {
    return null;
  });

  if (listener)
    this.on('request', listener)
  debug('initialized');
}

util.inherits(CoAPServer, events.EventEmitter)

CoAPServer.prototype._sendError = function(payload, rsinfo, packet) {
  var message = generate({
    code: '5.00',
    payload: payload,
    messageId: (packet)?packet.messageId:undefined,
    token: (packet)?packet.token:undefined
  })

  this._sock.send(message, 0, message.length, rsinfo.port)
}

function removeProxyOptions(packet) {
  var cleanOptions = []

  for (var i = 0; i < packet.options.length; i++) {
    if (packet.options[i].name.toLowerCase() !== 'proxy-uri' && packet.options[i].name.toLowerCase() !== 'proxy-scheme') {
      cleanOptions.push(packet.options[i])
    }
  }

  packet.options = cleanOptions

  return packet;
}

CoAPServer.prototype._sendProxied = function(packet, proxyUri, callback) {
  var url = require('url').parse(proxyUri)
    , host = url.hostname
    , port = url.port
    , message = generate(removeProxyOptions(packet))

  this._sock.send(message, 0, message.length, port, host, callback)
}

CoAPServer.prototype._sendReverseProxied = function(packet, rsinfo, callback) {
  var host = rsinfo.address
    , port = rsinfo.port
    , message = generate(packet)

  this._sock.send(message, 0, message.length, port, host, callback)
}

function handleRequest(server) {
  return function (msg, rsinfo) {
    var request = {
        raw: msg,
        rsinfo: rsinfo,
        server: server
      }
      , activeMiddlewares = []

    for (var i = 0; i < server._middlewares.length; i++) {
      activeMiddlewares.push(server._middlewares[i])
    }

    server._series(request, activeMiddlewares, request, handleEnding)
  }
}

function allAddresses(type) {
    var family = 'IPv4'
    if (type === 'udp6') {
        family = 'IPv6'
    }
    var addresses = [];
    var interfaces = os.networkInterfaces();
    for (var ifname in interfaces)  {
        if (interfaces.hasOwnProperty(ifname)) {
            interfaces[ifname].forEach(function (a) {
                if (a.family == family) {
                    addresses.push(a.address)
                }
            })
        }
    }
    return addresses;
}

CoAPServer.prototype.listen = function(port, address, done) {
  var that = this

  if (port == undefined) {
    port = parameters.coapPort
  }

  if (typeof port === 'function') {
    done = port
    port = parameters.coapPort
  }

  if (typeof address === 'function') {
    done = address
    address = null
  }

  if (this._sock) {
    if (done)
      done(new Error('Already listening'))
    else
      throw new Error('Already listening')

    return this
  }

  if (address && net.isIPv6(address))
    this._options.type = 'udp6'

  if (!this._options.type)
    this._options.type = 'udp4'

  if (port instanceof events.EventEmitter) {
    this._sock = port
    if (done) setImmediate(done)
  } else {
    this._internal_socket = true
    this._sock = dgram.createSocket({type: this._options.type, reuseAddr : true})

    this._sock.bind(port, address || null, function () {
      try {
        if (that._multicastAddress) {
          that._sock.setMulticastLoopback(true)

          if (that._multicastInterface) {
            that._sock.addMembership(that._multicastAddress, that._multicastInterface)
          } else {
            allAddresses(that._options.type).forEach(function(_interface) {
              that._sock.addMembership(that._multicastAddress, _interface)
            })
          }
        }
      } catch (err) {
        if (done)
          return done(err)
        else
          throw err;
      }

      if (done)
        return done()
    })
  }

  this._sock.on('message', handleRequest(this))

  this._sock.on('error', function(error) {
    that.emit('error', error)
  })

  if (parameters.pruneTimerPeriod) {
    // Start LRU pruning timer
    this._lru.pruneTimer = setInterval(function () {
      that._lru.prune()
    }, parameters.pruneTimerPeriod*1000)
    if (this._lru.pruneTimer.unref) {
      this._lru.pruneTimer.unref()
    }
  }

  return this
}

CoAPServer.prototype.close = function(done) {
  if (done) {
    setImmediate(done)
  }

  if (this._lru.pruneTimer) {
    clearInterval(this._lru.pruneTimer)
  }

  if (this._sock) {
    if (this._internal_socket) {
      this._sock.close()
    }
    this._lru.reset()
    this._sock = null
    this.emit('close')
  } else {
    this._lru.reset()
  }

  this._block2Cache.reset();
  this._block1Cache.reset();

  return this
}

/**
 * Entry point for a new datagram from the client.
 * @param {Packet} packet The packet that was sent from the client.
 * @param {Object} rsinfo Connection info 
 */
CoAPServer.prototype._handle = function(packet, rsinfo) {

  if (packet.code[0] !== '0') {
    // According to RFC7252 Section 4.2 receiving a confirmable messages
    // that can't be processed, should be rejected by ignoring it AND
    // sending a reset. In this case confirmable response message would
    // be silently ignored, which is not exactly as stated in the standard.
    // However, sending a reset would interfere with a coap client which is
    // re-using a socket (see pull-request #131).
    return
  }

  var sock      = this._sock
    , lru       = this._lru
    // , acks      = this._acks
    , cached    = lru.peek(toKey(rsinfo.address, rsinfo.port, packet, true))
    , Message   = OutMessage
    , that = this
    , request
    , response

  if (cached && !packet.ack && !packet.reset) {
    return sock.send(cached, 0, cached.length, rsinfo.port, rsinfo.address)
  } else if (cached && (packet.ack || packet.reset)) {
    if (cached.response && packet.reset) {
      cached.response.end()
    }
    return lru.del(toKey(rsinfo.address, rsinfo.port, packet, false))
  } else if (packet.ack || packet.reset) {
    return // nothing to do, ignoring silently
  }

  request = new IncomingMessage(packet, rsinfo)

  if (request.headers['Observe'] === 0) {
    Message = ObserveStream
    if (packet.code !== '0.01')
      // it is not a GET
      return this._sendError(Buffer.from('Observe can only be present with a GET'), rsinfo)
  }

  var cache_key = toCacheKey(rsinfo.address, rsinfo.port, packet);

  packet.piggybackReplyMs = this._options.piggybackReplyMs;
  var generateResponse = function() {
    var response = new Message(packet, function(response, packet) {
      var buf
        , sender = new RetrySend(sock, rsinfo.port, rsinfo.address)

      try {
        buf = generate(packet)
      } catch(err) {
        return response.emit('error', err)
      }
      if (Message === OutMessage) {
        sender.on('error', response.emit.bind(response, 'error'))
      } else {
        buf.response = response
        sender.on('error', function() {
          response.end()
        })
      }
  
      var key = toKey(rsinfo.address, rsinfo.port,
          packet, packet.ack || !packet.confirmable)
      lru.set(key, buf)
      buf.sender = sender
  
      if (that._options.sendAcksForNonConfirmablePackets || packet.confirmable) {
        sender.send(buf, packet.ack || packet.reset || packet.confirmable === false)
      } else {
        debug('OMIT ACK PACKAGE')
      }
    })
  
    response.statusCode = '2.05'
    response._request = request._packet
    response._cachekey = cache_key

    //inject this function so the response can add an entry to the cache
    response._addCacheEntry = that._block2Cache.add.bind(that._block2Cache)

    return response
  }

  response = generateResponse()
  request.rsinfo = rsinfo
  
  if (packet.token && packet.token.length > 0) {
    // return cached value only if this request is not the first block request
    var block2Buff = getOption(packet.options, 'Block2')
    var requestedBlockOption
    if (block2Buff) {
      requestedBlockOption = parseBlock2(block2Buff)
    }
    if (!requestedBlockOption) {
      requestedBlockOption = {num: 0}
    }

    if (requestedBlockOption.num < 1) {
      if(this._block2Cache.remove(cache_key)) {
        debug('first block2 request, removed old entry from cache')
      }
    } else {
      debug('check if packet token is in cache, key:', cache_key)
      if (this._block2Cache.contains(cache_key)) {
        debug('found cached payload, key:', cache_key)
        response.end(this._block2Cache.get(cache_key));
        return;
      }
    }
  }
  // else goes here?
  {
    var block1Buff = getOption(packet.options, 'Block1')
    if(block1Buff) {
      var blockState = parseBlockOption(block1Buff)

      if(blockState) {
        /** @type {{[k:string]:Buffer}} */
        let cachedData = this._block1Cache.getWithDefaultInsert(cache_key)
        var blockByteSize = Math.pow(2, 4 + blockState.blockSize)
        var incomingByteIndex = blockState.sequenceNumber * blockByteSize
        // Store in the cache object, use the byte index as the key
        cachedData[incomingByteIndex] = request.payload
  
        if(!blockState.moreBlocks) {
          // Last block
          var byteOffsets = Object.keys(cachedData)
            .map((str) => {
              return parseInt(str)
            }).sort((a, b) => {
              return a - b;
            });
          var byteTotalSum = incomingByteIndex + request.payload.length
          var next = 0
          var concat = Buffer.alloc(byteTotalSum)
          for(var i = 0; i < byteOffsets.length; i++) {
            if(byteOffsets[i] == next) {
              var buff = cachedData[byteOffsets[i]];
              buff.copy(concat, next, 0, buff.length);
              next += buff.length;
            } else {
              throw new Error("Byte offset not the next in line...");
            }
          }
          
          this._block1Cache.remove(cache_key)

          if(next == concat.length) {
            request.payload = concat
          } else {
            throw new Error("Last byte index is not equal to the concat buffer length!");
          }
        } else {
          // More blocks to come. ACK this block
          response.code = "2.31"
          response.setOption("Block1", block1Buff)
          response.end();
          return;
        }
      } else {
        throw new Error("Invalid block state" + blockState);
      }
    }
  }

  this.emit('request', request, response)
}

function toCacheKey(address, port, packet) {
  if (packet.token && packet.token.length > 0) {
    return packet.token.toString('hex') + '/' + address + ':' + port
  }

  return null
}

function toKey(address, port, packet, appendToken) {
  var result = address + port + packet.messageId

  if (appendToken)
    result += packet.token.toString('hex')

  return result
}

/*
new out message
inherit from OutgoingMessage
to handle cached answer and blockwise (2)
*/
function OutMessage() {
  OutgoingMessage.apply(this, Array.prototype.slice.call(arguments));
}
util.inherits(OutMessage, OutgoingMessage)

// maxBlock2 is in formular 2**(i+4), and must <= 2**(6+4)
var maxBlock2 = Math.pow(2, Math.floor(Math.log(parameters.maxPacketSize)/Math.log(2)))
if (maxBlock2 > Math.pow(2, (6+4)))
  maxBlock2 = Math.pow(2, (6+4))

/**
 * Entry point for a response from the server
 * @param {Buffer} payload A buffer-like object containing data to send back to the client.
 */
OutMessage.prototype.end = function(payload) {
  var that = this
  
  // removeOption(this._request.options, 'Block1'); 
  // add logic for Block1 sending

  var block2Buff = getOption(this._request.options, 'Block2')
  var requestedBlockOption
  // if we got blockwise (2) request
  if (block2Buff) {
    requestedBlockOption = parseBlock2(block2Buff)
    // bad option
    if (!requestedBlockOption) {
      that.statusCode = '4.02'
      return OutgoingMessage.prototype.end.call(that)
    }
  }

  // if payload is suitable for ONE message, shoot it out
  if (!payload ||
    ((!requestedBlockOption) && (payload.length < parameters.maxPacketSize)))
    return OutgoingMessage.prototype.end.call(this, payload)

  // for the first request, block2 option may be missed
  if (!requestedBlockOption)
    requestedBlockOption = {
      size: maxBlock2,
      num: 0
    }

  // block2 size should not bigger than maxBlock2
  if (requestedBlockOption.size > maxBlock2)
    requestedBlockOption.size = maxBlock2

  // block number should have limit
  var lastBlockNum = Math.ceil(payload.length/requestedBlockOption.size) - 1
  if (requestedBlockOption.num > lastBlockNum) {
    // precondition fail, may request for out of range block
    that.statusCode = '4.02'
    return OutgoingMessage.prototype.end.call(that)
  }
  // check if requested block is the last
  var moreFlag = requestedBlockOption.num < lastBlockNum
  
  var block2 = createBlock2({
    moreBlock2: moreFlag,
    num: requestedBlockOption.num,
    size: requestedBlockOption.size
  })
  if (!block2) {
    // this catch never be match,
    // since we're gentleman, just handle it
    that.statusCode = '4.02'
    return OutgoingMessage.prototype.end.call(that)
  }
  this.setOption('Block2', block2)
  this.setOption('ETag', _toETag(payload))

  // cache it
  if (this._request.token && this._request.token.length > 0) {
    this._addCacheEntry(this._cachekey, payload)
  }
  OutgoingMessage.prototype.end.call(this, payload.slice((requestedBlockOption.num)*requestedBlockOption.size, (requestedBlockOption.num+1)*requestedBlockOption.size))
};

/*
calculate id of a payload by xor each 2-byte-block from it
use to generate etag
  payload         an input buffer, represent payload need to generate id (hash)
  id              return var, is a buffer(2)
*/
function _toETag(payload) {
  var id = Buffer.of(0, 0)
  var i = 0
  do {
    id[0] ^= payload[i]
    id[1] ^= payload[i+1]
    i += 2
  } while (i<payload.length)
  return id
}

module.exports = CoAPServer