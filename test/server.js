
const coap      = require('../')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , dgram     = require('dgram')
    , bl        = require('bl')
    , request   = coap.request
    , tk        = require('timekeeper')
    , params    = require('../lib/parameters')

describe('server', function() {
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
    tk.reset()
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

  it('should listen by default to 5683', function(done) {
    server.close() // we need to change port
    server = coap.createServer()
    port = 5683
    server.listen(function() {
      send(generate())
    })
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

  it('should include the code', function(done) {
    var buf = new Buffer(25)
    send(generate({ payload: buf }))
    server.on('request', function(req, res) {
      expect(req).to.have.property('code', '0.01')
      done()
    })
  })

  ;['GET', 'POST', 'PUT', 'DELETE'].forEach(function(method) {
    it('should include the \'' + method + '\' method', function(done) {
      send(generate({ code: method }))
      server.on('request', function(req, res) {
        expect(req).to.have.property('method', method)
        done()
      })
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

  it('should have res emitting an error if the message is too big', function(done) {
    send(generate())
    server.on('request', function(req, res) {
      res.on('error', function() {
        done()
      })

      res.end(new Buffer(1280))
    })
  })

  it('should expose the options', function(done) {
    var options = [{
        name: '555'
      , value: new Buffer(45)
    }]

    send(generate({
      options: options
    }))

    server.on('request', function(req, res) {
      expect(req.options).to.eql(options)
      done()
    })
  })

  var formatsString = {
      'text/plain': new Buffer([0])
    , 'application/link-format': new Buffer([40])
    , 'application/xml': new Buffer([41])
    , 'application/octet-stream': new Buffer([42])
    , 'application/exi': new Buffer([47])
    , 'application/json': new Buffer([50])
  }

  describe('with the \'Content-Format\' header in the request', function() {
    function buildTest(option, format, value) {
      it('should parse \'' + option + ': ' + format + '\'', function(done) {
        send(generate({
          options: [{
              name: option
            , value: value
          }]
        }))

        server.on('request', function(req) {
          expect(req.options[0].value).to.eql(format)
          done()
        })
      })

      it('should include \'' + option + ': ' + format + '\' in the headers', function(done) {
        send(generate({
          options: [{
              name: option
            , value: value
          }]
        }))

        server.on('request', function(req) {
          expect(req.headers).to.have.property(option, format)
          done()
        })
      })
    }

    for (var format in formatsString) {
      buildTest('Content-Format', format, formatsString[format])
      buildTest('Accept', format, formatsString[format])
    }
  })

  describe('with a non-confirmable message', function() {
    var packet = {
        confirmable: false
      , messageId: 4242
      , token: new Buffer(5)
    }

    function sendAndRespond(status) {
      send(generate(packet))
      server.on('request', function(req, res) {
        if (status) {
          res.statusCode = status
        }

        res.end('42')
      })
    }

    it('should reply with a payload to a non-con message', function(done) {
      sendAndRespond()
      client.on('message', function(msg) {
        expect(parse(msg).payload).to.eql(new Buffer('42'))
        done()
      })
    })

    it('should include the original messageId', function(done) {
      sendAndRespond()
      client.on('message', function(msg) {
        expect(parse(msg).messageId).to.eql(4242)
        done()
      })
    })

    it('should include the token', function(done) {
      sendAndRespond()
      client.on('message', function(msg) {
        expect(parse(msg).token).to.eql(packet.token)
        done()
      })
    })

    it('should respond with a different code', function(done) {
      sendAndRespond('2.04')
      client.on('message', function(msg) {
        expect(parse(msg).code).to.eql('2.04')
        done()
      })
    })

    it('should respond with a numeric code', function(done) {
      sendAndRespond(204)
      client.on('message', function(msg) {
        expect(parse(msg).code).to.eql('2.04')
        done()
      })
    })

    it('should allow to add an option', function(done) {
      var buf = new Buffer(3)

      send(generate(packet))

      server.on('request', function(req, res) {
        res.setOption('ETag', buf)
        res.end('42')
      })

      client.on('message', function(msg) {
        expect(parse(msg).options[0].name).to.eql('ETag')
        expect(parse(msg).options[0].value).to.eql(buf)
        done()
      })
    })

    it('should overwrite the option', function(done) {
      var buf = new Buffer(3)

      send(generate(packet))

      server.on('request', function(req, res) {
        res.setOption('ETag', new Buffer(3))
        res.setOption('ETag', buf)
        res.end('42')
      })

      client.on('message', function(msg) {
        expect(parse(msg).options[0].value).to.eql(buf)
        done()
      })
    })

    it('should alias setOption to setHeader', function(done) {
      send(generate(packet))

      server.on('request', function(req, res) {
        res.setHeader('ETag', 'hello world')
        res.end('42')
      })

      client.on('message', function(msg) {
        expect(parse(msg).options[0].name).to.eql('ETag')
        expect(parse(msg).options[0].value).to.eql(new Buffer('hello world'))
        done()
      })
    })

    it('should set multiple options', function(done) {
      var buf1 = new Buffer(3)
        , buf2 = new Buffer(3)

      send(generate(packet))

      server.on('request', function(req, res) {
        res.setOption('433', [buf1, buf2])
        res.end('42')
      })

      client.on('message', function(msg) {
        expect(parse(msg).options[0].value).to.eql(buf1)
        expect(parse(msg).options[1].value).to.eql(buf2)
        done()
      })
    })

    it('should calculate the response only once', function(done) {
      send(generate(packet))
      send(generate(packet))

      server.on('request', function(req, res) {
        res.end('42')

        // this will error if called twice
        done()
      })
    })

    it('should calculate the response twice after the interval', function(done) {
      var now = Date.now()
      send(generate(packet))

      server.once('request', function(req, res) {
        res.end('42')

        tk.travel(now + params.exchangeLifetime * 1000)

        server.on('request', function(req, res) {
          res.end('24')
          done()
        })

        send(generate(packet))
      })
    })

    it('should include \'ETag\' in the response options', function(done) {
      send(generate())

      server.on('request', function(req, res) {
        res.setOption('ETag', 'abcdefgh')
        res.end('42')
      })

      client.on('message', function(msg, rsinfo) {
        expect(parse(msg).options[0].name).to.eql('ETag')
        expect(parse(msg).options[0].value).to.eql(new Buffer('abcdefgh'))
        done()
      })
    })

    it('should include \'Content-Format\' in the response options', function(done) {
      send(generate())

      server.on('request', function(req, res) {
        res.setOption('Content-Format', 'text/plain')
        res.end('42')
      })

      client.on('message', function(msg, rsinfo) {
        expect(parse(msg).options[0].name).to.eql('Content-Format')
        expect(parse(msg).options[0].value).to.eql(new Buffer([0]))
        done()
      })
    })

    it('should reply with a \'5.00\' if it cannot parse the packet', function(done) {
      send(new Buffer(3))
      client.on('message', function(msg) {
        expect(parse(msg).code).to.eql('5.00')
        done()
      })
    })
  })
})
