
const coap      = require('../')

describe('end-to-end', function() {
  var server
    , port

  beforeEach(function(done) {
    port = nextPort()
    server = coap.createServer()
    server.listen(port, done)
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

  describe('formats', function() {
    var formats = [ 'text/plain', 'application/link-format',
      'application/xml', 'application/octet-stream',
      'application/exi', 'application/json' ]

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
})
