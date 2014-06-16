
const coap = require('../')

describe('blockwise2', function() {
  var server
    , port
    , payload   = new Buffer(1300)

  beforeEach(function(done) {
    // port = nextPort()
    port = 10000
    server = coap.createServer()
    server.listen(port, done)
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
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should use blockwise in response when payload bigger than max packet', function(done) {
    // var payload   = new Buffer(100)         // default max packet is 1280
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
    .setOption('Block2', new Buffer([0x02])) // reques from block 1, with size = 32
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
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  // it('should receive error when early negotation request block size higher than 1024', function(done) {
  //   var req = coap.request({
  //       port: port
  //   })
  //   .setOption('Block2', new Buffer([0x07])) // reques from block 1, with size = 32
  //   .on('response', function(res) {
  //     // expect(block2 instanceof Buffer).to.eql(true)
  //     // expect(block2[block2.length-1] & 0x07).to.eql(2)
  //     console.log(res.code)
  //     setImmediate(done)
  //   })
  //   .end()
  //   server.on('request', function(req, res) {
  //     res.end(payload)
  //   })
  // })

  it('should receive a right block', function(done) {
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x10])) // reques from block 1, with size = 16
    .on('response', function(res) {
      expect(res.payload).to.eql(payload.slice(1*16, payload.length+1))
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })

  it('should receive a full response payload', function(done) {
    var payload = new Buffer(16*0xff+1)
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x0])) // requested block size = 16, almost 10000/16 = 63 block
    .on('response', function(res) {
      expect(res.payload).to.eql(payload)
      setImmediate(done)
    })
    .end()
    server.on('request', function(req, res) {
      res.end(payload)
    })
  })
})
