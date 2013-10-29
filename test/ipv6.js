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

  describe('request', function() {
    var server
      , server2
      , port

    beforeEach(function(done) {
      port = nextPort()
      server = dgram.createSocket('udp6')
      server.bind(port, done)
    })

    afterEach(function() {
      server.close()

      if (server2)
        server2.close()

      server = server2 = null
    })

    it('should send the data to the server', function(done) {
      var req = coap.request('coap://[::1]:' + port)
      req.end(new Buffer('hello world'))

      server.on('message', function(msg) {
        expect(parse(msg).payload.toString()).to.eql('hello world')
        done()
      })
    })
  })
})
