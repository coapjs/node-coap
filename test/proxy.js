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
  , async     = require('async')

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
    server = coap.createServer()
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
    client.close()
    server.close()
    target.close()
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
})
