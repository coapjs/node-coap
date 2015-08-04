/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var coap      = require('../')
  , parse     = require('coap-packet').parse
  , generate  = require('coap-packet').generate
  , dgram     = require('dgram')
  , bl        = require('bl')
  , request   = coap.request
  , tk        = require('timekeeper')
  , sinon     = require('sinon')
  , params    = require('../lib/parameters')

describe('proxy', function() {
  var server
    , port
    , clientPort
    , client
    , target
    , targetPort
    , clock

  beforeEach(function(done) {
    clock = sinon.useFakeTimers()
    port = nextPort()
    server = coap.createServer({
      proxy: true
    })
    server.listen(port, function() {
      clientPort = nextPort()
      client = dgram.createSocket('udp4')
      targetPort = nextPort()
      target = coap.createServer()

      client.bind(clientPort, function() {
        target.listen(targetPort, done)
      })
    })
  })

  afterEach(function() {
    clock.restore()
    try {
      client.close()
    } catch (ignored) {
      // ignored
    }
    try {
      server.close()
    } catch (ignored) {
      // ignored
    }
    try {
      target.close()
    } catch (ignored) {
      // ignored
    }
    tk.reset()
  })

  function send(message) {
    client.send(message, 0, message.length, port, '127.0.0.1')
  }

  function ssend(rsinfo, packet) {
    var toSend = generate(packet)
    target.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
  }

  function sendObservation(message) {
    target.on('request', function(req, res) {
      res.setOption('Observe', 1);
      res.write('Pruebas');

      setTimeout(function() {
        res.write('Pruebas2');
        res.end('Last msg');
      }, 500)
    })

    return request({
      port: port
      , observe: true
      ,  proxyUri: 'coap://localhost:' + targetPort + '/the/path'
    }).end()
  }

  function fastForward(increase, max) {
    clock.tick(increase)
    if (increase < max)
      setImmediate(fastForward.bind(null, increase, max - increase))
  }

  it('should resend the message to its destination specified in the Proxy-Uri option', function(done) {
    send(generate({
      options: [{
        name: 'Proxy-Uri'
        , value: new Buffer('coap://localhost:' + targetPort + '/the/path')
      }]
    }))

    target.on('request', function(req, res) {
      done()
    })
  })

  it('should resend notifications in an observe connection', function(done) {
    var counter = 0,
        req;

    req = sendObservation()

    req.on('response', function(res) {
      res.on('data', function(msg) {
        if (counter === 2)
          done()
        else
          counter++;

        clock.tick(600);
      })
    })
  })

  it('should not process the request as a standard server request', function(done) {
    target.on('request', function(req, res) {
      done()
    })

    server.on('request', function(req, res) {
    })

    send(generate({
      options: [{
        name: 'Proxy-Uri'
        , value: new Buffer('coap://localhost:' + targetPort + '/the/path')
      }]
    }))
  })

  it('should return the target response to the original requestor', function(done) {
    send(generate({
      options: [{
        name: 'Proxy-Uri'
        , value: new Buffer('coap://localhost:' + targetPort + '/the/path')
      }]
    }))

    target.on('request', function(req, res) {
      res.end('The response')
    })

    client.on('message', function(msg) {
      var package = parse(msg)
      expect(package.payload.toString()).to.eql('The response')
      done()
    })
  })

  describe('with a proxied request initiated by an agent', function() {
    it('should forward the request to the URI specified in proxyUri ', function(done) {
      var request = coap.request({
        host: 'localhost',
        port: port,
        proxyUri: 'coap://localhost:' + targetPort,
        query: 'a=b'
      })

      target.on('request', function(req, res) {
        done()
      })

      request.end()
    })
    it('should forward the response to the request back to the agent', function(done) {
      var request = coap.request({
        host: 'localhost',
        port: port,
        proxyUri: 'coap://localhost:' + targetPort,
        query: 'a=b'
      })

      target.on('request', function(req, res) {
        res.end('This is the response')
      })

      request.on('response', function(res) {
        expect(res.payload.toString()).to.eql('This is the response');
        done()
      })

      request.end()
    })
  })

  describe('with a proxied request with a wrong destination', function() {
    it('should return an error to the caller', function(done) {
      var request = coap.request({
        host: 'localhost',
        port: port,
        proxyUri: 'coap://unexistentCOAPUri:7968',
        query: 'a=b'
      })

      target.on('request', function(req, res) {
        console.log('should not get here')
      })

      server.on('error', function(req, res) {
      })

      request
          .on('response', function(res) {
            expect(res.code).to.eql('5.00');
            expect(res.payload.toString()).to.contain('ENOTFOUND');
            done()
          })
          .end()
    })
  })

  describe('with a non-proxied request', function() {
    it('should call the handler as usual', function(done) {
      var request = coap.request({
        host: 'localhost',
        port: port,
        query: 'a=b'
      })

      target.on('request', function(req, res) {
        console.log('should not get here')
      })

      server.on('request', function(req, res) {
        res.end('Standard response')
      })

      request
          .on('response', function(res) {
            expect(res.payload.toString()).to.contain('Standard response');
            done()
          })
          .end()
    })
  })

  describe('with an observe request to a proxied server', function() {
    it('should call the handler as usual', function(done) {
      var request = coap.request({
        host: 'localhost',
        port: port,
        observe: true,
        query: 'a=b'
      })

      target.on('request', function(req, res) {
        console.log('should not get here')
      })

      server.on('request', function(req, res) {
        res.end('Standard response')
      })

      request
        .on('response', function(res) {
          expect(res.payload.toString()).to.contain('Standard response');
          done()
        })
        .end()
    })
    it('should allow all the responses', function(done) {
      var request = coap.request({
          host: 'localhost',
          port: port,
          observe: true,
          query: 'a=b'
        }),
        count = 0;

      target.on('request', function(req, res) {
        console.log('should not get here')
      })

      server.on('request', function(req, res) {
        res.setOption('Observe', 1);
        res.write('This is the first response');

        setTimeout(function() {
          res.setOption('Observe', 1);
          res.write('And this is the second');
        }, 200);
      })

      request
        .on('response', function(res) {
          res.on('data', function(chunk) {
            count++;

            if (count === 1) {
              expect(chunk.toString('utf8')).to.contain('This is the first response');
              clock.tick(300);
            } else if (count === 2) {
              expect(chunk.toString('utf8')).to.contain('And this is the second');
              done()
            }
          })
        })
        .end()
    })
  })
})
