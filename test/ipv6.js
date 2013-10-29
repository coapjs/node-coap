const coap      = require('../')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , dgram     = require('dgram')

describe('IPv6', function() {

  describe('server', function() {

    var server
      , port
      , clientPort
      , client

    beforeEach(function(done) {
      port = nextPort()
      server = coap.createServer({ type: 'udp6' })
      server.listen(port, done)
    })

    beforeEach(function(done) {
      clientPort = nextPort()
      client = dgram.createSocket('udp6')
      client.bind(clientPort, done)
    })

    afterEach(function() {
      client.close()
      server.close()
    })

    function send(message) {
      client.send(message, 0, message.length, port, '::1')
    }

    it('should receive a CoAP message', function(done) {
      send(generate())
      server.on('request', function(req, res) {
        done()
      })
    })
  })

})
