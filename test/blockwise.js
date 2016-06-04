/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var coap        = require('../')
  , parse       = require('coap-packet').parse
  , generate    = require('coap-packet').generate
  , getOption   = require('../lib/helpers').getOption
  , parseBlock2 = require('../lib/helpers').parseBlock2
  , dgram       = require('dgram')

describe('blockwise2', function() {
  var server
    , port
    , clientPort
    , client
    , bufferVal
    , payload   = new Buffer(1300)

  beforeEach(function(done) {
    bufferVal = 0
    port = nextPort()
    server = coap.createServer()
    server.listen(port, done)
  })

  beforeEach(function(done) {
    clientPort = nextPort()
    client = dgram.createSocket('udp4')
    client.bind(clientPort, done)
  })

  afterEach(function() {
    server.close()
    client.close()
  })

  function send(message) {
    client.send(message, 0, message.length, port, '127.0.0.1')
  }

  function nextBufferVal() {
    if (bufferVal > 255)
      bufferVal = 0
    return bufferVal++
  }

  function fillPayloadBuffer(buffer) {
    for (var i = 0; i < buffer.length; i++) {
      buffer[i] = nextBufferVal()
    }
    return buffer
  }

  it('should server not use blockwise in response when payload fit in one packet', function(done) {
    var payload   = new Buffer(100)         // default max packet is 1280

    var req = coap.request({
        port: port
    })
    .on('response', function(res) {
      var blockwiseResponse = false
      for (var i in res.options) {
        if (res.options[i].name == 'Block2') {
          blockwiseResponse = true
          break
        }
      }
      expect(blockwiseResponse).to.eql(false)
      //expect(cache.get(res._packet.token.toString())).to.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should use blockwise in response when payload bigger than max packet', function(done) {
    var req = coap.request({
        port: port
    })
    .on('response', function(res) {
      var blockwiseResponse = false
      for (var i in res.options) {
        if (res.options[i].name == 'Block2') {
          blockwiseResponse = true
          break
        }
      }
      expect(blockwiseResponse).to.eql(true)
      //expect(cache.get(res._packet.token.toString())).to.not.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should blockwise response have etag', function(done) {
    var req = coap.request({
        port: port
    })
    .on('response', function(res) {
      expect(typeof res.headers.ETag).to.eql('string')
      //expect(cache.get(res._packet.token.toString())).to.not.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should accept early negotation', function(done) {
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x02]))
    .on('response', function(res) {
      var block2
      for (var i in res.options) {
        if (res.options[i].name == 'Block2') {
          block2 = res.options[i].value
          break
        }
      }
      expect(block2 instanceof Buffer).to.eql(true)
      expect(block2[block2.length-1] & 0x07).to.eql(2)
      //expect(cache.get(res._packet.token.toString())).to.not.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should receive error when early negotation request block size higher than 1024', function(done) {
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x07])) // request for block 0, with overload size of 2**(7+4)
    .on('response', function(res) {
      expect(res.code).to.eql('4.02')
      //expect(cache.get(res._packet.token.toString())).to.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should receive error request for out of range block number', function(done) {
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x55])) // request for block 5, size = 512 from 1300B msg (total 1300/512=3 blocks)
    .on('response', function(res) {
      expect(res.code).to.eql('4.02')
      //expect(cache.get(res._packet.token.toString())).to.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should be able to receive part of message', function(done) {
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x10])) // request from block 1, with size = 16
    .on('response', function(res) {
      expect(res.payload).to.eql(payload.slice(1*16, payload.length+1))
      //expect(cache.get(res._packet.token.toString())).to.not.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should receive full response payload', function(done) {
    var payload = new Buffer(16*0xff+1)
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x0])) // early negotation with block size = 16, almost 10000/16 = 63 blocks
    .on('response', function(res) {
      expect(res.payload).to.eql(payload)
      //expect(cache.get(res._packet.token.toString())).to.not.be.undefined
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  function sendNextBlock2(req_token, req_block2_num) {
    var packet = {
        messageId: 1100 + req_block2_num
      , token: req_token
      , options: [{
            name: 'Block2'
          , value: new Buffer([req_block2_num << 4])
        }]
    }
    send(generate(packet))
  }

  function parallelBlock2Test(done, checkNReq, checkBlock2Message, checkNormalReq) {
    var payload_len = 32+16+1
    var payload_req1 = new Buffer(payload_len)
    var payload_req2 = new Buffer(payload_len)
    var req1_token = new Buffer(4)
    var req1_done = false
    var req2_done = false
    var req1_block2_num = 0
    var req_client2 = coap.request({
        port: port
    })

    fillPayloadBuffer(payload_req1)
    fillPayloadBuffer(payload_req2)
    fillPayloadBuffer(req1_token)

    var nreq = 1;
    server.on('request', function(req, res) {
      // only two request to upper level, blockwise transfer completed from cache
      if (nreq == 1)
        res.end(payload_req1)
      else if (nreq == 2)
        res.end(payload_req2)

      checkNReq(nreq)

      nreq++
    })

    // Send first request, initiate blockwise transfer from server
    sendNextBlock2(req1_token, req1_block2_num)

    client.on('message', function(msg, rinfo) {
      checkBlock2Message(msg, payload_req1, req1_block2_num, payload_len)

      var expectMore = (req1_block2_num + 1) * 16 <= payload_len
      if (expectMore) {
        // Request next block after 50 msec delay
        req1_block2_num++

        setTimeout(function() {
          // Send next request, fetch next block of blockwise transfer from server
          sendNextBlock2(req1_token, req1_block2_num)
        }, 50)
      } else {
        // No more blocks, transfer completed.
        req1_done = true
        if (req1_done && req2_done)
          setImmediate(done)
        }
    })

    req_client2.setOption('Block2', new Buffer([0x10])) // request from block 1, with size = 16

    // Delay second request so that first request gets first packet
    setTimeout(function() {
      req_client2.end()
    }, 1)

    req_client2.on('response', function(res) {
      checkNormalReq(res, payload_req2)

      req2_done = true
      if (req1_done && req2_done)
        setImmediate(done)
    })
  }

  function checkNothing() {
  }

  it('should two parallel block2 requests should result only two requests to upper level', function(done) {
    var checkNreq = function(nreq) {
      expect(nreq).to.within(1,2)
    }

    parallelBlock2Test(done, checkNreq, checkNothing, checkNothing)
  })

  it('should have code 2.05 for all block2 messages of successful parallel requests', function(done) {
    var checkBlock2Code = function(msg) {
      var res = parse(msg)

      // Have correct code?
      expect(res.code).to.eql('2.05')
    }

    var checkNormalRespCode = function(res) {
      // Have correct code?
      expect(res.code).to.eql('2.05')
    }

    parallelBlock2Test(done, checkNothing, checkBlock2Code, checkNormalRespCode)
  })

  it('should have correct block2 option for parallel requests', function(done) {
    var checkBlock2Option = function(msg, payload_req1, req1_block2_num, payload_len) {
      var res = parse(msg)

      // Have block2 option?
      var block2Buff = getOption(res.options, 'Block2')
      expect(block2Buff instanceof Buffer).to.eql(true)

      var block2 = parseBlock2(block2Buff)
      expect(block2).to.not.eql(null)

      var expectMore = (req1_block2_num + 1) * 16 <= payload_len

      // Have correct num / moreBlock2 fields?
      expect(block2.num).to.eql(req1_block2_num)
      expect(block2.moreBlock2).to.eql(expectMore)
    }

    parallelBlock2Test(done, checkNothing, checkBlock2Option, checkNothing)
  })

  it('should have correct payload in block2 messages for parallel requests', function(done) {
    var checkBlock2Payload = function(msg, payload_req1, req1_block2_num) {
      var res = parse(msg)

      // Have correct payload?
      expect(res.payload).to.eql(payload_req1.slice(req1_block2_num*16, req1_block2_num*16 + 16))
    }

    var checkNormalRespPayload = function(res, payload_req2) {
      // Have correct payload?
      expect(res.payload).to.eql(payload_req2.slice(1*16, payload.length+1))
    }

    parallelBlock2Test(done, checkNothing, checkBlock2Payload, checkNormalRespPayload)
  })
})
