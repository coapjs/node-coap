
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
      done()
    })
  })

  it('should return code 2.05 by default', function(done) {
    var req = coap.request('coap://localhost:'+port + '/abcd/ef/gh/?foo=bar&beep=bop').end()
    req.on('response', function(res) {
      expect(res.code).to.eql('2.05')
      done()
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
})
