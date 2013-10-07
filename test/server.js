
const coap      = require('../')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , dgram     = require('dgram')
    , bl        = require('bl')
    , request   = coap.request

describe('request', function() {
  var server
    , port
    , clientPort
    , client

  beforeEach(function(done) {
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
  })

  function send(message) {
    client.send(message, 0, message.length, port, '127.0.0.1')
  }

  it('should receive a CoAP message', function(done) {
    send(generate())
    server.on('request', function(req, res) {
      done()
    })
  })

  it('should receive a request that can be piped', function(done) {
    var buf = new Buffer(25)
    send(generate({ payload: buf }))
    server.on('request', function(req, res) {
      req.pipe(bl(function(err, data) {
        expect(data).to.eql(buf)
        done()
      }))
    })
  })

  it('should expose the payload', function(done) {
    var buf = new Buffer(25)
    send(generate({ payload: buf }))
    server.on('request', function(req, res) {
      expect(req.payload).to.eql(buf)
      done()
    })
  })

  it('should include an URL in the request', function(done) {
    var buf = new Buffer(25)
    send(generate({ payload: buf }))
    server.on('request', function(req, res) {
      expect(req).to.have.property('url', '/')
      done()
    })
  })

  it('should include the path in the URL', function(done) {
    send(generate({
        options: [{
            name: 'Uri-Path'
          , value: new Buffer('hello')
        }, {
            name: 'Uri-Path'
          , value: new Buffer('world')
        }]
    }))

    server.on('request', function(req, res) {
      expect(req).to.have.property('url', '/hello/world')
      done()
    })
  })

  it('should include the query in the URL', function(done) {
    send(generate({
        options: [{
            name: 'Uri-Query'
          , value: new Buffer('a=b')
        }, {
            name: 'Uri-Query'
          , value: new Buffer('b=c')
        }]
    }))

    server.on('request', function(req, res) {
      expect(req).to.have.property('url', '/?a=b&b=c')
      done()
    })
  })

  it('should include the path and the query in the URL', function(done) {
    send(generate({
        options: [{
            name: 'Uri-Query'
          , value: new Buffer('a=b')
        }, {
            name: 'Uri-Query'
          , value: new Buffer('b=c')
        }, {
            name: 'Uri-Path'
          , value: new Buffer('hello')
        }, {
            name: 'Uri-Path'
          , value: new Buffer('world')
        }]
    }))

    server.on('request', function(req, res) {
      expect(req).to.have.property('url', '/hello/world?a=b&b=c')
      done()
    })
  })

  describe('with a non-confirmable message', function() {
    var packet = {
        confirmable: false
      , messageId: 4242
      , token: new Buffer(5)
    }

    beforeEach(function() {
      send(generate(packet))
      server.on('request', function(req, res) {
        res.end('42')
      })
    })

    it('should reply with a payload to a non-con message', function(done) {
      client.on('message', function(msg) {
        expect(parse(msg).payload).to.eql(new Buffer('42'))
        done()
      })
    })

    it('should include the original messageId', function(done) {
      client.on('message', function(msg) {
        expect(parse(msg).messageId).to.eql(4242)
        done()
      })
    })

    it('should include the token', function(done) {
      client.on('message', function(msg) {
        expect(parse(msg).token).to.eql(packet.token)
        done()
      })
    })
  })
})
