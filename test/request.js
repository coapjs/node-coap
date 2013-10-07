
const coap      = require('../')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , dgram     = require('dgram')
    , bl        = require('bl')
    , request   = coap.request

describe('request', function() {
  var server
    , server2
    , port

  beforeEach(function(done) {
    port = nextPort()
    server = dgram.createSocket('udp4')
    server.bind(port, done)
  })

  afterEach(function() {
    server.close()

    if (server2)
      server2.close()

    server = server2 = null
  })

  it('should return a pipeable stream', function(done) {
    var req = request('coap://localhost:' + port)
      , stream = bl()
    
    stream.append('hello world')

    req.on('finish', done)

    stream.pipe(req)
  })

  it('should send the data to the server', function(done) {
    var req = request('coap://localhost:' + port)
    req.end(new Buffer('hello world'))

    server.on('message', function(msg) {
      expect(parse(msg).payload.toString()).to.eql('hello world')
      done()
    })
  })

  it('should emit the errors in the req', function(done) {
    var req = request('coap://aaa.eee:' + 1234)
    req.end(new Buffer('hello world'))

    req.on('error', function() {
      done()
    })
  })

  it('should imply a default port', function(done) {
    server2 = dgram.createSocket('udp4')

    server2.bind(5683, function() {
      request('coap://localhost').end()
    })

    server2.on('message', function(msg) {
      done()
    })
  })

  it('should send the path to the server', function(done) {
    var req = request('coap://localhost:' + port + '/hello')
    req.end(new Buffer('hello world'))

    server.on('message', function(msg) {
      var packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Path')
      expect(packet.options[0].value).to.eql(new Buffer('hello'))
      done()
    })
  })
  
  it('should send a longer path to the server', function(done) {
    var req = request('coap://localhost:' + port + '/hello/world')
    req.end(new Buffer('hello world'))

    server.on('message', function(msg) {
      var packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Path')
      expect(packet.options[0].value).to.eql(new Buffer('hello'))
      expect(packet.options[1].name).to.eql('Uri-Path')
      expect(packet.options[1].value).to.eql(new Buffer('world'))
      done()
    })
  })

  it('should accept an object instead of a string', function(done) {
    var req = request({
        hostname: 'localhost'
      , port: port
      , pathname: '/hello/world'
    })

    req.end(new Buffer('hello world'))

    server.on('message', function(msg) {
      var packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Path')
      expect(packet.options[0].value).to.eql(new Buffer('hello'))
      expect(packet.options[1].name).to.eql('Uri-Path')
      expect(packet.options[1].value).to.eql(new Buffer('world'))
      done()
    })
  })

  it('should send a query string to the server', function(done) {
    var req = request('coap://localhost:' + port + '?a=b&c=d')
    req.end(new Buffer('hello world'))

    server.on('message', function(msg) {
      var packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Query')
      expect(packet.options[0].value).to.eql(new Buffer('a=b'))
      expect(packet.options[1].name).to.eql('Uri-Query')
      expect(packet.options[1].value).to.eql(new Buffer('c=d'))
      done()
    })
  })

  it('should accept a method parameter', function(done) {
    request({
        port: port
      , method: 'POST'
    }).end()

    server.on('message', function(msg) {
      var packet = parse(msg)
      expect(packet.code).to.eql('0.02')
      done()
    })
  })
})
