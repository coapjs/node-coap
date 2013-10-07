
const coap      = require('../')

describe('end-to-end', function() {
  var server
    , port

  beforeEach(function(done) {
    port = nextPort()
    server = coap.createServer()
    server.listen(port, done)
  })

  it('should receive a request at a path with some query', function(done) {
    coap.request('coap://localhost:'+port + '/abcd/ef/gh/?foo=bar&beep=bop').end()
    server.on('request', function(req) {
      expect(req.url).to.eql('/abcd/ef/gh?foo=bar&beep=bop')
      done()
    })
  })
})
