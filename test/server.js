
const coap      = require('../')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , dgram     = require('dgram')
    , bl        = require('bl')
    , request   = coap.request
    , tk        = require('timekeeper')
    , sinon     = require('sinon')
    , params    = require('../lib/parameters')

describe('server', function() {
  var server
    , port
    , clientPort
    , client
    , clock

  beforeEach(function(done) {
    clock = sinon.useFakeTimers()
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
    clock.restore()
    client.close()
    server.close()
    tk.reset()
  })

  function send(message) {
    client.send(message, 0, message.length, port, '127.0.0.1')
  }

  function fastForward(increase, max) {
    clock.tick(increase)
    if (increase < max)
      setImmediate(fastForward.bind(null, increase, max - increase))
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

  it('should include a rsinfo', function(done) {
    send(generate())
    server.on('request', function(req, res) {
      expect(req).to.have.property('rsinfo')
      expect(req.rsinfo).to.have.property('address')
      expect(req.rsinfo).to.have.property('port')
      res.end('hello')
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

    it('should reply with a payload to a NON message', function(done) {
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

        clock.restore()
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

    it('should not retry sending the response', function(done) {
      var messages = 0

      send(generate(packet))
      server.on('request', function(req, res) {
        res.end('42')
      })

      client.on('message', function(msg) {
        messages++
      })

      setTimeout(function() {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })
  })

  describe('with a confirmable message', function() {
    var packet = {
        confirmable: true
      , messageId: 4242
      , token: new Buffer(5)
    }

    it('should reply in piggyback', function(done) {
      send(generate(packet))
      server.on('request', function(req, res) {
        res.end('42')
      })

      client.on('message', function(msg) {
        var response = parse(msg)
        expect(response.ack).to.be.true
        expect(response.messageId).to.eql(packet.messageId)
        expect(response.payload).to.eql(new Buffer('42'))
        done()
      })
    })

    it('should ack the message if it does not reply in 50ms', function(done) {
      send(generate(packet))

      client.once('message', function(msg) {
        var response = parse(msg)
        expect(response.ack).to.be.true
        expect(response.code).to.eql('0.00')
        expect(response.messageId).to.eql(packet.messageId)
        expect(response.payload).to.eql(new Buffer(0))
        done()
      })

      fastForward(10, 1000)
    })

    it('should reply with a confirmable after an ack', function(done) {
      send(generate(packet))
      server.on('request', function(req, res) {
        setTimeout(function() {
          res.end('42')
        }, 200)
      })

      client.once('message', function(msg) {
        var response = parse(msg)
        expect(response.ack).to.be.true

        client.once('message', function(msg) {

          var response = parse(msg)

          expect(response.confirmable).to.be.true
          expect(response.messageId).not.to.eql(packet.messageId)
          done()
        })
      })

      fastForward(100, 1000)
    })

    it('should retry sending the response if it does not receive an ack four times before 45s', function(done) {
      var messages = 0

      send(generate(packet))
      server.on('request', function(req, res) {
        setTimeout(function() {
          res.end('42')
        }, 200)
      })

      client.once('message', function(msg) {
        client.on('message', function(msg) {
          messages++
        })
      })

      setTimeout(function() {
        // original one plus 4 retries
        expect(messages).to.eql(5)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })

    it('should stop resending after it receives an ack', function(done) {
      var messages = 0

      send(generate(packet))
      server.on('request', function(req, res) {
        setTimeout(function() {
          res.end('42')
        }, 200)
      })

      client.once('message', function(msg) {
        client.on('message', function(msg) {
          var res = parse(msg)
          send(generate({
              code: '0.00'
            , messageId: res.messageId
            , ack: true }))
          messages++
        })
      })

      setTimeout(function() {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })

    it('should not resend with a piggyback response', function(done) {
      var messages = 0

      send(generate(packet))
      server.on('request', function(req, res) {
        res.end('42')
      })

      client.on('message', function(msg) {
        messages++
      })

      setTimeout(function() {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })

    it('should error if it does not receive an ack four times before ~247s', function(done) {
      var messages = 0

      send(generate(packet))
      server.on('request', function(req, res) {

        // needed to avoid sending a piggyback response
        setTimeout(function() {
          res.end('42')
        }, 200)

        res.on('error', function(err) {
          expect(err).to.have.property('retransmitTimeout', 247)
          done()
        })
      })

      fastForward(100, 250 * 1000)
    })
  })

  describe('observe', function() {
    var token = new Buffer(3)

    function doObserve(method) {
      if (!method)
        method = 'GET'
      
      send(generate({ 
          code: method
        , confirmable: true
        , token: token
        , options: [{ 
              name: 'Observe'
            , value: new Buffer(0)
          }]
      }))
    }

    ['PUT', 'POST', 'DELETE'].forEach(function(method) {
      it('should return an error when try to observe in a ' + method, function(done) {
        doObserve(method)
        server.on('request', function() {
          done(new Error('A request should not be emitted'))
        })

        client.on('message', function(msg) {
          expect(parse(msg).code).to.eql('5.00')
          done()
        })
      })
    })

    it('should include a rsinfo', function(done) {
      doObserve()
      server.on('request', function(req, res) {
        expect(req).to.have.property('rsinfo')
        expect(req.rsinfo).to.have.property('address')
        expect(req.rsinfo).to.have.property('port')
        res.end('hello')
        done()
      })
    })

    it('should emit a request with \'Observe\' in the headers', function(done) {
      doObserve()
      server.on('request', function(req, res) {
        expect(req.headers).to.have.property('Observe')
        res.end('hello')
        done()
      })
    })

    it('should send multiple messages for multiple writes', function(done) {
      var now = Date.now()
      doObserve()

      server.on('request', function(req, res) {
        res.write('hello')
        setImmediate(function() {
          res.end('world')
        })
      })

      // the first one is an ack
      client.once('message', function(msg) {
        expect(parse(msg).payload.toString()).to.eql('hello')
        expect(parse(msg).options[0].name).to.eql('Observe')
        expect(parse(msg).options[0].value).to.eql(new Buffer([1]))
        expect(parse(msg).token).to.eql(token)
        expect(parse(msg).code).to.eql('2.05')
        expect(parse(msg).ack).to.be.true

        client.once('message', function(msg) {
          expect(parse(msg).payload.toString()).to.eql('world')
          expect(parse(msg).options[0].name).to.eql('Observe')
          expect(parse(msg).options[0].value).to.eql(new Buffer([2]))
          expect(parse(msg).token).to.eql(token)
          expect(parse(msg).code).to.eql('2.05')
          expect(parse(msg).ack).to.be.false
          expect(parse(msg).confirmable).to.be.true

          done()
        })
      })
    })

    it('should emit a \'finish\' if the client do not ack for ~247s', function(done) {
      var now = Date.now()
      doObserve()

      server.on('request', function(req, res) {
        // the first is the current status
        // it's in piggyback on the ack
        res.write('hello')

        // the second status is on the observe
        res.write('hello2')

        res.on('finish', function() {
          done()
        })
      })
      
      fastForward(100, 248 * 1000)
    })

    it('should emit a \'finish\' if the client do a reset', function(done) {
      var now = Date.now()
      doObserve()

      server.on('request', function(req, res) {
        res.write('hello')
        res.write('world')
        res.on('finish', function() {
          done()
        })
      })
      
      client.on('message', function(msg) {
        var packet = parse(msg)
        send(generate({
            reset: true
          , messageId: packet.messageId
          , code: '0.00'
        }))
      })
    })

    it('should correctly generate two-byte long sequence numbers', function(done) {
      var now = Date.now()
        , buf = new Buffer(2)
      doObserve()

      server.on('request', function(req, res) {
        // hack to override the message counter
        res._counter = 4242

        res.write('hello')
        setImmediate(function() {
          res.end('world')
        })
      })

      // the first one is an ack
      client.once('message', function(msg) {
        buf.writeUInt16BE(4243, 0)
        expect(parse(msg).options[0].value).to.eql(buf)

        client.once('message', function(msg) {
          buf.writeUInt16BE(4244, 0)
          expect(parse(msg).options[0].value).to.eql(buf)

          done()
        })
      })
    })

    it('should correctly generate three-byte long sequence numbers', function(done) {
      var now = Date.now()
        , buf = new Buffer(3)

      buf.writeUInt8(1, 0)

      doObserve()

      server.on('request', function(req, res) {
        // hack to override the message counter
        res._counter = 65535

        res.write('hello')
        setImmediate(function() {
          res.end('world')
        })
      })

      // the first one is an ack
      client.once('message', function(msg) {
        buf.writeUInt16BE(1, 1)
        expect(parse(msg).options[0].value).to.eql(buf)

        client.once('message', function(msg) {
          buf.writeUInt16BE(2, 1)
          expect(parse(msg).options[0].value).to.eql(buf)

          done()
        })
      })
    })
  })
})
