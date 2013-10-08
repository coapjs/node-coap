
const coap      = require('../')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , dgram     = require('dgram')
    , bl        = require('bl')
    , sinon     = require('sinon')
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

  it('should error if the message is too big', function(done) {
    var req = request('coap://localhost:' + port)

    req.on('error', function() {
      done()
    })

    req.end(new Buffer(1280))
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

  it('should emit a response', function(done) {
    var req = request({
      port: port
    })

    server.on('message', function(msg, rsinfo) {
      var packet = parse(msg)
        , toSend = generate({
                       messageId: packet.messageId
                     , token: packet.token
                     , payload: new Buffer('42')
                   })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function(res) {
      res.pipe(bl(function(err, data) {
        expect(data).to.eql(new Buffer('42'))
        done()
      }))
    })

    req.end()
  })

  describe('retries', function() {
    var clock

    beforeEach(function() {
      clock = sinon.useFakeTimers()
    })

    afterEach(function() {
      clock.restore()
    })

    function fastForward(increase, max) {
      clock.tick(increase)
      if (increase < max)
        setImmediate(fastForward.bind(null, increase, max - increase))
    }

    it('should error after ~247 seconds', function(done) {
      var req = request('coap://localhost:' + port)
      req.end()

      req.on('error', function(err) {
        expect(err).to.have.property('message', 'No reply in 247s')
        done()
      })

      clock.tick(247 * 1000)
    })

    it('should retry four times before erroring', function(done) {
      var req = request('coap://localhost:' + port)
        , messages = 0

      req.end()
      server.on('message', function(msg) {
        messages++
      })

      req.on('error', function(err) {
        // original one plus 4 retries
        expect(messages).to.eql(5)
        done()
      })

      fastForward(100, 247 * 1000)
    })

    it('should retry four times before 45s', function(done) {
      var req = request('coap://localhost:' + port)
        , messages = 0

      req.end()
      server.on('message', function(msg) {
        messages++
      })

      setTimeout(function() {
        // original one plus 4 retries
        expect(messages).to.eql(5)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })
  })
})
