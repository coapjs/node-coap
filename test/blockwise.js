/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var coap = require('../')

describe('blockwise2', function() {
  var server
    , port
    , payload   = new Buffer(1300)

  beforeEach(function(done) {
    port = nextPort()
    server = coap.createServer()
    server.listen(port, done)
  })

  afterEach(function() {
    server.close()
  })

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
})
