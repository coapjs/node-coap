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

  function ackBack(msg, rsinfo) {
    var packet = parse(msg)
      , toSend = generate({
                     messageId: packet.messageId
                   , ack: true
                   , code: '0.00'
                 })
    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
  }

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

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)
      expect(parse(msg).payload.toString()).to.eql('hello world')
      done()
    })
  })

  it('should send a confirmable message by default', function(done) {
    var req = request('coap://localhost:' + port)
    req.end(new Buffer('hello world'))

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)
      expect(parse(msg).confirmable).to.be.true
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

    server2.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)
      done()
    })
  })

  it('should send the path to the server', function(done) {
    var req = request('coap://localhost:' + port + '/hello')
    req.end(new Buffer('hello world'))

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)

      var packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Path')
      expect(packet.options[0].value).to.eql(new Buffer('hello'))

      done()
    })
  })
  
  it('should send a longer path to the server', function(done) {
    var req = request('coap://localhost:' + port + '/hello/world')
    req.end(new Buffer('hello world'))

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)

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

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)

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

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)

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

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)

      var packet = parse(msg)
      expect(packet.code).to.eql('0.02')
      done()
    })
  })

  it('should emit a response with a piggyback CON message', function(done) {
    var req = request({
        port: port
      , confirmable: true
    })

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
    })

    req.on('response', function(res) {
      res.pipe(bl(function(err, data) {
        expect(data).to.eql(new Buffer('42'))
        done()
      }))
    })

    req.end()
  })

  it('should emit a response with a delayed CON message', function(done) {
    var req = request({
        port: port
      , confirmable: true
    })

    server.once('message', function(msg, rsinfo) {
      var packet = parse(msg)
        , toSend = generate({
                       messageId: packet.messageId
                     , token: packet.token
                     , payload: new Buffer('')
                     , ack: true
                     , code: '0.00'
                   })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      toSend = generate({
          token: packet.token
        , payload: new Buffer('42')
        , confirmable: true
        , code: '2.00'
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


  it('should send an ACK back after receiving a CON response', function(done) {
    var req = request({
        port: port
      , confirmable: true
    })

    server.once('message', function(msg, rsinfo) {
      var packet = parse(msg)
        , toSend = generate({
                       messageId: packet.messageId
                     , ack: true
                     , code: '0.00'
                   })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      toSend = generate({
          token: packet.token
        , payload: new Buffer('42')
        , confirmable: true
        , code: '2.00'
      })

      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      server.once('message', function(msg, rsinfo) {
        packet = parse(msg)
        expect(packet.code).to.eql('0.00')
        expect(packet.ack).to.be.true
        expect(packet.messageId).to.eql(parse(toSend).messageId)
        done()
      })
    })

    req.end()
  })

  it('should not emit a response with an ack', function(done) {
    var req = request({
        port: port
      , confirmable: true
    })

    server.on('message', function(msg, rsinfo) {
      ackBack(msg, rsinfo)
      setTimeout(function() {
        done()
      }, 20)
    })

    req.on('response', function(res) {
      done(new Error('Unexpected response'))
    })

    req.end()
  })

  it('should emit a response with a NON message', function(done) {
    var req = request({
        port: port
      , confirmable: false
    })

    server.on('message', function(msg, rsinfo) {
      var packet = parse(msg)
        , toSend = generate({
                       messageId: packet.messageId
                     , token: packet.token
                     , payload: new Buffer('42')
                     , code: '2.00'
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

  it('should allow to add an option', function(done) {
    var req = request({
                port: port
              })
      , buf = new Buffer(3)
    
    req.setOption('ETag', buf)
    req.end()

    server.on('message', function(msg) {
      expect(parse(msg).options[0].name).to.eql('ETag')
      expect(parse(msg).options[0].value).to.eql(buf)
      done()
    })
  })

  it('should overwrite the option', function(done) {
    var req = request({
                port: port
              })
      , buf = new Buffer(3)
    
    req.setOption('ETag', new Buffer(3))
    req.setOption('ETag', buf)
    req.end()

    server.on('message', function(msg) {
      expect(parse(msg).options[0].value).to.eql(buf)
      done()
    })
  })

  it('should alias setOption to setHeader', function(done) {
    var req = request({
                port: port
              })
      , buf = new Buffer(3)
    
    req.setHeader('ETag', buf)
    req.end()

    server.on('message', function(msg) {
      expect(parse(msg).options[0].value).to.eql(buf)
      done()
    })
  })

  it('should set multiple options', function(done) {
    var req = request({
                port: port
              })
      , buf1 = new Buffer(3)
      , buf2 = new Buffer(3)
    
    req.setOption('433', [buf1, buf2])
    req.end()

    server.on('message', function(msg) {
      expect(parse(msg).options[0].value).to.eql(buf1)
      expect(parse(msg).options[1].value).to.eql(buf2)
      done()
    })
  })

  it('should alias the \'Content-Format\' option to \'Content-Type\'', function(done) {
    var req = request({
                port: port
              })
    
    req.setOption('Content-Type', new Buffer([0]))
    req.end()

    server.on('message', function(msg) {
      expect(parse(msg).options[0].name).to.eql('Content-Format')
      expect(parse(msg).options[0].value).to.eql(new Buffer([0]))
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

  describe('with the \'Content-Format\' header in the outgoing message', function() {
    function buildTest(format, value) {
      it('should parse ' + format, function(done) {
        var req = request({
                    port: port
                  })
        
        req.setOption('Content-Format', format)
        req.end()

        server.on('message', function(msg) {
          expect(parse(msg).options[0].value).to.eql(value)
          done()
        })
      })
    }

    for (var format in formatsString) {
      buildTest(format, formatsString[format])
    }
  })

  describe('with the \'Accept\' header in the outgoing message', function() {
    function buildTest(format, value) {
      it('should parse ' + format, function(done) {
        var req = request({
                    port: port
                  })
        
        req.setHeader('Accept', format)
        req.end()

        server.on('message', function(msg) {
          expect(parse(msg).options[0].value).to.eql(value)
          done()
        })
      })
    }

    for (var format in formatsString) {
      buildTest(format, formatsString[format])
    }
  })

  describe('with the \'Content-Format\' in the response', function() {
    function buildResponse(value) {
      return function(msg, rsinfo) {
        var packet  = parse(msg)
          , toSend  = generate({
                          messageId: packet.messageId
                        , token: packet.token
                        , options: [{
                              name: 'Content-Format'
                            , value: value
                          }]
                     })
        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      }
    }

    function buildTest(format, value) {
      it('should parse ' + format, function(done) {
        var req = request({
          port: port
        })

        server.on('message', buildResponse(value))

        req.on('response', function(res) {
          expect(res.options[0].value).to.eql(format)
          done()
        })

        req.end()
      })

      it('should include ' + format + ' in the headers', function(done) {
        var req = request({
          port: port
        })

        server.on('message', buildResponse(value))

        req.on('response', function(res) {
          expect(res.headers['Content-Format']).to.eql(format)
          expect(res.headers['Content-Type']).to.eql(format)
          done()
        })

        req.end()
      })
    }

    for (var format in formatsString) {
      buildTest(format, formatsString[format])
    }
  })

  it('should include \'ETag\' in the response headers', function(done) {
    var req = request({
      port: port
    })

    server.on('message', function(msg, rsinfo) {
      var packet  = parse(msg)
        , toSend  = generate({
                        messageId: packet.messageId
                      , token: packet.token
                      , options: [{
                            name: 'ETag'
                          , value: new Buffer('abcdefgh')
                        }]
                    })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function(res) {
      expect(res.headers).to.have.property('ETag', 'abcdefgh')
      done()
    })

    req.end()
  })

  describe('non-confirmable retries', function() {
    var clock

    beforeEach(function() {
      clock = sinon.useFakeTimers()
    })

    afterEach(function() {
      clock.restore()
    })

    function doReq() {
      return request({
          port: port
        , confirmable: false
      }).end()
    }

    function fastForward(increase, max) {
      clock.tick(increase)
      if (increase < max)
        setImmediate(fastForward.bind(null, increase, max - increase))
    }

    it('should error after ~247 seconds', function(done) {
      var req = doReq()

      req.on('error', function(err) {
        expect(err).to.have.property('message', 'No reply in 247s')
        expect(err).to.have.property('retransmitTimeout', 247)
        done()
      })

      fastForward(1000, 247 * 1000)
    })

    it('should retry four times before erroring', function(done) {
      var req = doReq()
        , messages = 0

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
      var req = doReq()
        , messages = 0

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

    it('should stop retrying if it receives a message', function(done) {
      var req = doReq()
        , messages = 0

      server.on('message', function(msg, rsinfo) {
        messages++
        var packet  = parse(msg)
          , toSend  = generate({
                          messageId: packet.messageId
                        , token: packet.token
                        , code: '2.00'
                        , ack: true
                        , payload: new Buffer(5)
                      })
        
        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      })

      setTimeout(function() {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })
  })

  describe('confirmable retries', function() {
    var clock

    beforeEach(function() {
      clock = sinon.useFakeTimers()
    })

    afterEach(function() {
      clock.restore()
    })

    function doReq() {
      return request({
          port: port
        , confirmable: true
      }).end()
    }

    function fastForward(increase, max) {
      clock.tick(increase)
      if (increase < max)
        setImmediate(fastForward.bind(null, increase, max - increase))
    }

    it('should error after ~247 seconds', function(done) {
      var req = doReq()

      req.on('error', function(err) {
        expect(err).to.have.property('message', 'No reply in 247s')
        done()
      })

      fastForward(1000, 247 * 1000)
    })

    it('should retry four times before erroring', function(done) {
      var req = doReq()
        , messages = 0

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

    it('should retry with the same message id', function(done) {
      var req = doReq()
        , messageId

      server.on('message', function(msg) {
        var packet = parse(msg)

        if (!messageId)
          messageId = packet.messageId

        expect(packet.messageId).to.eql(messageId)
      })

      req.on('error', function(err) {
        done()
      })

      fastForward(100, 247 * 1000)
    })

    it('should retry four times before 45s', function(done) {
      var req = doReq()
        , messages = 0

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

    it('should stop retrying if it receives an ack', function(done) {
      var req = doReq()
        , messages = 0

      server.on('message', function(msg, rsinfo) {
        messages++
        var packet  = parse(msg)
          , toSend  = generate({
                          messageId: packet.messageId
                        , code: '0.00'
                        , ack: true
                      })
        
        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      })

      setTimeout(function() {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })
  })

  describe('observe', function() {

    function doObserve() {
      server.on('message', function(msg, rsinfo) {
        var packet = parse(msg)

        if (packet.ack)
          return
        
        ssend(rsinfo, {
            messageId: packet.messageId
          , token: packet.token
          , payload: new Buffer('42')
          , ack: true
          , options: [{
                name: 'Observe'
              , value: new Buffer([1])
            }]
          , code: '2.05'
        })

        ssend(rsinfo, {
            token: packet.token
          , payload: new Buffer('24')
          , confirmable: true
          , options: [{
                name: 'Observe'
              , value: new Buffer([2])
            }]
          , code: '2.05'
        })
      })

      return request({
          port: port
        , observe: true
      }).end()
    }

    function ssend(rsinfo, packet) {
      var toSend = generate(packet)
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    }

    it('should ack the update', function(done) {

      var req = doObserve()

      server.on('message', function(msg) {
        if (parse(msg).ack)
          done()
      })
    })

    it('should emit any more data after close', function(done) {

      var req = doObserve()

      req.on('response', function(res) {
        res.once('data', function(data) {
          expect(data.toString()).to.eql('42')
          res.close()
          done()

          res.on('data', function(data) {
            done(new Error('this should never happen'))
          })
        })
      })
    })

    it('should emit any more data after close', function(done) {

      var req = doObserve()

      req.on('response', function(res) {
        res.once('data', function(data) {
          expect(data.toString()).to.eql('42')
          res.close()
          done()

          res.on('data', function(data) {
            done(new Error('this should never happen'))
          })
        })
      })
    })

    it('should send an empty Observe option', function(done) {
      var req = request({
          port: port
        , observe: true
      }).end()

      server.on('message', function(msg, rsinfo) {
        var packet = parse(msg)
        expect(packet.options[0].name).to.eql('Observe')
        expect(packet.options[0].value).to.eql(new Buffer(0))
        done()
      })
    })
  })
})
