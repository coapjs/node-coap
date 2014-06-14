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

  this._sock.bind(port, address || null, done)
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
    , Message   = OutMessage 
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

    if (Message === OutMessage) {
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

  response._request = request

  // todo:
  // should use mem cache to buffer responses
  // dont alway bother uper layer, especially when the return is in blockwise (2)
  // if (cachedPayload)
  //   response.end(cachedPayload);
  // else
  //   this.emit('request', request, response)
  this.emit('request', request, response)
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

var maxBlock2   = 1024    //16, 32, 64, must <= 2**(6+4)

OutMessage.prototype.end= function(payload) {
  var that = this
  var requestedBlockOption = _parseBlock2(that._request.options) 

  // if payload is suitable for ONE message, shoot it out
  if (!payload || 
    ((!requestedBlockOption) && (payload.length < maxBlock2)))
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
  // 0 base counter for totalBlock, hence use floor (vs ceil)
  var totalBlock = Math.floor(payload.length/requestedBlockOption.size)
  var isLastBlock
  if (requestedBlockOption.num < totalBlock)
    isLastBlock = false
  else if (requestedBlockOption.num == totalBlock) 
    isLastBlock = true
  else
    return that._sendError(new Buffer('Out of range representation'), rsinfo)

  var block2 = _createBlock(requestedBlockOption, isLastBlock)
  _packetSetOption(this._packet, 'Block2', block2)
  _packetSetOption(this._packet, 'ETag', _toETag(payload))

  OutgoingMessage.prototype.end.call(this, payload.slice((requestedBlockOption.num)*requestedBlockOption.size, (requestedBlockOption.num+1)*requestedBlockOption.size))
};

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
      // limit value of size is 1024 (2**(6+4))
      if (block2Value.slice(-1)[0] == 7) {
        throw new Error('Block size should not bigger than 1024')
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

function _createBlock(requestedBlock, isLastBlock) {
  var byte
  var szx = Math.log(requestedBlock.size)/Math.log(2) - 4
  var m = ((isLastBlock==true)?0:1)
  var num = requestedBlock.num
  var extraNum

  byte = 0
  byte |= szx
  byte |= m << 3
  byte |= (num&0xf) <<4

  // total num occupy up to 5 octets
  // num share the higher octet of first byte, and (may) take more 2 bytes for the rest 4 octets
  if (num <= 0xf) { 
    extraNum = null
  }
  else if (num <=0xfff) {
    extraNum = new Buffer([num/16])
  } 
  else if (num <=0xfffff) {
    extraNum = new Buffer(2)
    extraNum.writeUInt16BE(num>>4,0)
  } 
  else {
    throw new Error('too big request')
  }

  // console.log([byte, extraNum])
  return (extraNum)? Buffer.concat([extraNum, new Buffer([byte])]):new Buffer([byte])
}

// need to rewrite this function 
function _packetSetBlock2(packet, block2) {
  var hasBlock = false;
  for (i in packet.options) {
    if (packet.options[i] && packet.options[i].name == 'Block2') {
      packet.options[i].value = block2 
      hasBlock = true;
    }
  }
  if (!hasBlock) {
    packet.options.push({
      name: 'Block2',
      value: block2 
    })
  }
  return packet
}

function _packetSetOption(packet, name, value) {
  var hasOpt = false;
  for (i in packet.options) {
    if (packet.options[i] && packet.options[i].name == name) {
      packet.options[i].value = value 
      hasOpt = true;
    }
  }
  if (!hasOpt) {
    packet.options.push({
      name: name,
      value: value 
    })
  }
  return packet
}

/*
calculate id of a payload by xor each 2-byte-block from it
use to generate etag
  payload         an input buffer, represent payload need to generate id (hash)
  id              return var, is a buffer(2)
*/
function _toETag(payload) {
  var id = 0
  var i = 0
  do {
    id = payload.slice(i,i+2).readUInt16BE(0) ^ id
    i += 2
  } while (i<payload.length)

  var idBuf = new Buffer(2)
  idBuf.writeUInt16BE(id, 0)
  return idBuf
}

module.exports = CoAPServer
