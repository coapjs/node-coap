var coap      = require('../')
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

    it('should receive a CoAP message specifying the type', function(done) {
      server = coap.createServer({ type: 'udp6' })
      server.listen(port, function() {
        send(generate())
        server.on('request', function(req, res) {
          done()
        })
      })
    })

    it('should automatically discover the type based on the host', function(done) {
      server = coap.createServer()
      server.listen(port, '::1', function() {
        send(generate())
        server.on('request', function(req, res) {
          done()
        })
      })
    })
  })

  describe('request', function() {
    var server
      , port

    beforeEach(function(done) {
      port = nextPort()
      server = dgram.createSocket('udp6')
      server.bind(port, done)
    })

    afterEach(function() {
      server.close()

      server = null
    })

    function createTest(createUrl) {
      return function (done) {
        var req = coap.request(createUrl())
        req.end(new Buffer('hello world'))

        server.on('message', function(msg, rsinfo) {
          var packet = parse(msg)
            , toSend = generate({
                           messageId: packet.messageId
                         , token: packet.token
                         , payload: new Buffer('42')
                         , ack: true
                         , code: '2.00'
                       })
          server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

          expect(parse(msg).payload.toString()).to.eql('hello world')
          done()
        })
      }
    }

    it('should send the data to the server (URL param)', createTest(function() {
      return 'coap://[::1]:' + port
    }))

    it('should send the data to the server (hostname + port in object)', createTest(function() {
      return  { hostname: '::1', port: port }
    }))

    it('should send the data to the server (host + port in object)', createTest(function() {
      return  { host: '::1', port: port }
    }))
  })

  describe('end-to-end', function() {
    var server
      , port

    beforeEach(function(done) {
      port = nextPort()
      server = coap.createServer({ type: 'udp6' })
      server.listen(port, done)
    })

    it('should receive a request at a path with some query', function(done) {
      coap.request('coap://[::1]:'+port + '/abcd/ef/gh/?foo=bar&beep=bop').end()
      server.on('request', function(req) {
        expect(req.url).to.eql('/abcd/ef/gh?foo=bar&beep=bop')
        done()
      })
    })
  })
})
