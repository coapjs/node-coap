
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

  it('should receive a right block', function(done) {
    var req = coap.request({
        port: port
    })
    .setOption('Block2', new Buffer([0x10])) // requested block 2, with size = 16
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
