/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var coap = require('../')
  , sinon = require('sinon')

describe('share-socket', function() {
  var server
    , port

  beforeEach(function(done) {
    port = nextPort()
    server = coap.createServer()
    server.listen(port, function() {
      coap.globalAgent = new coap.Agent({
        socket: server._sock
      })
      done()
    })
  })

  afterEach(function(done) {
    this.timeout(200)
    setTimeout(function() {
      server.close(done)
      server.on('error', function() {})
    }, 100)
  })

  process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err)
  })

  it('should receive a request at a path with some query', function(done) {
    coap.request('coap://localhost:'+port + '/abcd/ef/gh/?foo=bar&beep=bop').end()
    server.on('request', function(req) {
      expect(req.url).to.eql('/abcd/ef/gh?foo=bar&beep=bop')
      setImmediate(done)
    })
  })

  it('should return code 2.05 by default', function(done) {
    var req = coap.request('coap://localhost:'+port + '/abcd/ef/gh/?foo=bar&beep=bop').end()
    req.on('response', function(res) {
      expect(res.code).to.eql('2.05')
      setImmediate(done)
    })

    server.on('request', function(req, res) {
      res.end('hello')
    })
  })

  it('should return code using res.code attribute', function(done) {
    coap
      .request('coap://localhost:'+port)
      .on('response', function(res) {
        expect(res.code).to.eql('4.04')
        setImmediate(done)
      })
      .end()

    server.on('request', function(req, res) {
      res.code = '4.04'
      res.end('hello')
    })
  })

  it('should return code using res.statusCode attribute', function(done) {
    coap
      .request('coap://localhost:'+port)
      .on('response', function(res) {
        expect(res.code).to.eql('4.04')
        setImmediate(done)
      })
      .end()

    server.on('request', function(req, res) {
      res.statusCode = '4.04'
      res.end('hello')
    })
  })

  it('should support observing', function(done) {
    var req = coap.request({
        port: port
      , observe: true
    }).end()

    req.on('response', function(res) {
      res.once('data', function(data) {
        expect(data.toString()).to.eql('hello')
        res.once('data', function(data) {
          expect(data.toString()).to.eql('world')
          done()
        })
      })
    })

    server.on('request', function(req, res) {
      res.write('hello')
      res.end('world')
    })
  })

  it('should support a 4.04 observe request', function(done) {
    var req = coap.request({
        port: port
      , observe: true
    }).end()

    req.on('response', function(res) {
      expect(res.code).to.eql('4.04')
      done()
    })

    server.on('request', function(req, res) {
      res.statusCode = '4.04'
      res.end()
    })
  })

  it('should support a 4.04 observe request and emit an end event in the response', function(done) {
    var req = coap.request({
        port: port
      , observe: true
    }).end()

    req.on('response', function(res) {
      expect(res.code).to.eql('4.04')
      res.on('end', done)
      res.resume()
    })

    server.on('request', function(req, res) {
      res.statusCode = '4.04'
      res.end()
    })
  })

  describe('formats', function() {
    var formats = [ 'text/plain', 'application/link-format',
      'application/xml', 'application/octet-stream',
      'application/exi', 'application/json', 'application/cbor' ]

    ;['Accept', 'Content-Format'].forEach(function(option) {
      formats.forEach(function(format) {
        it('should pass the \'' + option + ': ' + format + '\' option to the server', function(done) {
          var req = coap.request('coap://localhost:'+port)
          req.setOption(option, format)
          req.end()

          server.on('request', function(req) {
            expect(req.options[0].name).to.eql(option)
            expect(req.options[0].value).to.eql(format)
            done()
          })
        })

        it('should pass the \'' + option + ': ' + format + '\' option to the server if passed alongside the url', function(done) {
          var req = {
            port: port,
            options: {}
          }

          req.options[option] = format

          coap.request(req).end()

          server.on('request', function(req) {
            expect(req.options[0].name).to.eql(option)
            expect(req.options[0].value).to.eql(format)
            done()
          })
        })

        it('should pass the \'' + option + ': ' + format + '\' headers to the server if passed alongside the url', function(done) {
          var req = {
            port: port,
            headers: {}
          }

          req.headers[option] = format

          coap.request(req).end()

          server.on('request', function(req) {
            expect(req.headers[option]).to.eql(format)
            done()
          })
        })

        it('should pass the \'' + option + ': ' + format + '\' header to the server', function(done) {
          var req = coap.request('coap://localhost:'+port)
          req.setOption(option, format)
          req.end()

          server.on('request', function(req) {
            expect(req.headers[option]).to.eql(format)
            done()
          })
        })
      })
    })

    formats.forEach(function(format) {
      it('should pass the \'Content-Format: ' + format + '\' option to the client', function(done) {
        var req = coap.request('coap://localhost:'+port)
        req.end()

        server.on('request', function(req, res) {
          res.setOption('Content-Format', format)
          res.end()
        })

        req.on('response', function(res) {
          expect(res.headers['Content-Format']).to.eql(format)
          done()
        })
      })
    })
  })

  it('should allow encoding with \'Content-Format\'', function(done) {
    var req = coap.request('coap://localhost:' + port)

    req.setOption('Content-Format', 'application/json; charset=utf8')
    req.end()

    server.on('request', function(req) {
      expect(req.options[0].name).to.equal('Content-Format')
      expect(req.options[0].value).to.equal('application/json')
      done()
    })
  })

  it('should allow option \'Max-Age\'', function(done) {
    var req = coap.request('coap://localhost:' + port)

    req.setOption('Max-Age', 26763)
    req.end()

    server.on('request', function(req) {
      expect(req.options[0].name).to.equal('Max-Age')
      expect(req.options[0].value).to.equal(26763)
      done()
    })
  })

  it('should provide a writeHead() method', function(done) {
    var req = coap.request('coap://localhost:' + port)
    req.end()
    req.on('response', function(res) {
      expect(res.headers['Content-Format']).to.equal('application/json')
      done()
    })

    server.on('request', function(req, res) {
      res.writeHead(200, {'Content-Format': 'application/json'})
      res.write(JSON.stringify({}))
      res.end()
    })
  })

  it('should set and parse \'Location-Path\'', function(done) {
    var req = coap.request({
        port: port
      , method: 'PUT'
    }).end()

    req.on('response', function(res) {
      expect(res.headers).to.have.property('Location-Path', '/hello')
      done()
    })

    server.on('request', function(req, res) {
      res.setOption('Location-Path', '/hello')
      res.end('hello')
    })
  })

  it('should set and parse \'Location-Query\'', function(done) {
    var req = coap.request({
        port: port
      , method: 'PUT'
    }).end()

    req.on('response', function(res) {
      expect(res.headers).to.have.property('Location-Query', 'a=b')
      done()
    })

    server.on('request', function(req, res) {
      res.setOption('Location-Query', 'a=b')
      res.end('hello')
    })
  })

  it('should support multiple observe to the same destination', function(done) {
    var req1  = coap.request({
                    port: port
                  , method: 'GET'
                  , observe: true
                  , pathname: '/a'
                }).end()
      , req2  = coap.request({
                    port: port
                  , method: 'GET'
                  , observe: true
                  , pathname: '/b'
                }).end()
      , completed = 2

    server.on('request', function(req, res) {
      res.write('hello')
      setTimeout(function() {
        res.end('world')
      }, 10)
    })

    ;[req1, req2].forEach(function(req) {
      var local = 2
      req.on('response', function(res) {
        res.on('data', function(data) {
          if (--local == 0)
            --completed

          if (completed === 0)
            done()
        })
      })
    })
  })

  it('should reuse the same socket for two concurrent requests', function(done) {
    var req1  = coap.request({
                    port: port
                  , method: 'GET'
                  , pathname: '/a'
                }).end()
      , req2  = coap.request({
                    port: port
                  , method: 'GET'
                  , pathname: '/b'
                }).end()
      , first

    server.on('request', function(req, res) {
      res.end('hello')
      if (!first)
        first = req.rsinfo
      else {
        expect(req.rsinfo).to.eql(first)
        done()
      }
    })
  })

  it('should create two sockets for two subsequent requests', function(done) {

    var agent = new coap.Agent()
      , req1  = coap.request({
                    port: port
                  , method: 'GET'
                  , pathname: '/a'
                  , agent: agent
                }).end()
      , req2
      , first


    server.on('request', function(req, res) {
      res.end('hello')
      if (!first)
        first = req.rsinfo
      else {
        expect(req.rsinfo).not.to.eql(first)
        done()
      }
    })

    req1.on('response', function() {
      setImmediate(function() {
        req2 = coap.request({
            port: port
          , method: 'GET'
          , pathname: '/b'
        }).end()
      })
    })
  })

  it("should use the port binded in the agent", function(done) {
    var agent = new coap.Agent({ port: 3636 })
        , req = coap.request({port: port
          , method: 'GET'
          , pathname: 'a'
          , agent: agent
        }).end()

    server.on('request', function(req, res) {
      res.end('hello')
      expect(req.rsinfo.port).eql(3636)
      done()
    })
  })

  it('should ignore ignored options', function() {
    var req = coap.request('coap://localhost:' + port)
    req.setOption('Cache-Control', 'private')
    req.end()

    server.on('request', function(req) {
      expect(req.headers).not.to.have.property('Cache-Control')
      done()
    })
  })

  it('should error after ~247 seconds', function(done) {
    var clock = sinon.useFakeTimers()
      , req = coap.request('coap://localhost:'+(port+1))
    req.end()

    function fastForward(increase, max) {
      clock.tick(increase)
      if (increase < max)
        setImmediate(fastForward.bind(null, increase, max - increase))
    }

    req.on('error', function (err) {
      expect(err).to.have.property('message', 'No reply in 247s')
      clock.restore()
      done()
    })

    fastForward(1000, 247 * 1000)
  })
})
