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
  , sinon     = require('sinon')
  , request   = coap.request

describe('Agent', function() {
  var server
    , port
    , agent

  beforeEach(function(done) {
    port = nextPort()
    agent = new coap.Agent()
    server = dgram.createSocket('udp4')
    server.bind(port, done)
  })

  afterEach(function() {
    server.close()
  })

  function doReq(confirmable) {
    if (!confirmable)
      confirmable = false

    return request({
        port: port
      , agent: agent
      , confirmable: confirmable
    }).end()
  }

  it('should reuse the same socket for multiple requests', function(done) {
    var firstRsinfo

    doReq()
    doReq()

    server.on('message', function(msg, rsinfo) {
      if (firstRsinfo) {
        expect(rsinfo.port).to.eql(firstRsinfo.port);
        done()
      } else {
        firstRsinfo = rsinfo
      }
    })
  })

  it('should calculate the messageIds module 16 bytes', function(done) {
    var total = 2

    doReq()

    agent._lastMessageId = Math.pow(2, 16) - 1
    doReq()

    server.on('message', function(msg, rsinfo) {
      if (total === 2) {
        // nothing to do
      } else if (total === 1) {
        expect(parse(msg).messageId).to.eql(1)
        done()
      }

      total--
    })
  })

  it('should differentiate two requests with different tokens', function(done) {
    var firstToken

    doReq()
    doReq()

    server.on('message', function(msg, rsinfo) {
      var packet = parse(msg)
      if (firstToken) {
        expect(packet.token).not.to.eql(firstToken);
        done()
      } else {
        firstToken = packet.token
      }
    })
  })

  it('should differentiate two requests with different messageIds', function(done) {
    var firstMessageId

    doReq()
    doReq()

    server.on('message', function(msg, rsinfo) {
      var packet = parse(msg)
      if (firstMessageId) {
        expect(packet.messageId).not.to.eql(firstMessageId);
        done()
      } else {
        firstMessageId = packet.messageId
      }
    })
  })

  it('should forward the response to the correct request', function(done) {
    var responses = 0
      , req1 = doReq()
      , req2 = doReq()

    server.on('message', function(msg, rsinfo) {
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

    req1.once('response', function(res) {
      if (++responses == 2)
        done()
    })

    req2.once('response', function(res) {
      if (++responses == 2)
        done()
    })
  })

  it('should discard the request after receiving the payload for NON requests', function(done) {
    var req = doReq()

    // it is needed to keep the agent open
    doReq()

    server.once('message', function(msg, rsinfo) {
      var packet  = parse(msg)
        , toSend  = generate({
              messageId: packet.messageId
            , token: packet.token
            , code: '2.00'
            , confirmable: false
            , payload: new Buffer(5)
          })
      
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      // duplicate, as there was some retransmission
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function(res) {
      // fails if it emits 'response' twice
      done()
    })
  })

  it('should discard the request after receiving the payload for piggyback CON requests', function(done) {
    var req = doReq(true)

    // it is needed to keep the agent open
    doReq(true)

    server.once('message', function(msg, rsinfo) {
      var packet  = parse(msg)
        , toSend  = generate({
              messageId: packet.messageId
            , token: packet.token
            , code: '2.00'
            , confirmable: false
            , ack: true
            , payload: new Buffer(5)
          })
      
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      // duplicate, as there was some retransmission
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function(res) {
      // fails if it emits 'response' twice
      done()
    })
  })

  it('should close the socket if there are no pending requests', function(done) {
    var firstRsinfo
      , req = doReq()

    server.on('message', function(msg, rsinfo) {
      var packet  = parse(msg)
        , toSend  = generate({
              messageId: packet.messageId
            , token: packet.token
            , code: '2.00'
            , confirmable: false
            , ack: true
            , payload: new Buffer(5)
          })
      
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      if (firstRsinfo) {
        expect(rsinfo.port).not.to.eql(firstRsinfo.port);
        done()
      } else {
        firstRsinfo = rsinfo
      }
    })

    req.on('response', function(res) {
      setImmediate(doReq)
    })
  })

  it('should send only RST for unrecognized CON', function(done) {
    // In order to have a running agent, it must wait for something
    var req = doReq(true)
      , step = 0

    server.on('message', function(msg, rsinfo) {
      var packet  = parse(msg)

      switch (++step) {
        case 1:
          // Request message from the client
          // Ensure the message sent by the server does not match any
          // current request.
          var invalidMid = packet.messageId + 1
            , invalidTkn = new Buffer( packet.token )
          ++invalidTkn[0]

          var toSend  = generate({
                  messageId: invalidMid
                , token: invalidTkn
                , code: '2.00'
                , confirmable: true
                , ack: false
                , payload: new Buffer(5)
              })
          server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
          break

        case 2:
          expect(packet.reset).to.be.true
          done()
          break

        case 3:
          done(Error('Got two answers'))
          break
      }
    })
  })

  describe('observe problems', function() {

    function sendObserve(opts) {
      var toSend  = generate({
              messageId: opts.messageId
            , token: opts.token
            , code: '2.05'
            , confirmable: opts.confirmable
            , ack: opts.ack
            , payload: new Buffer(5)
            , options: [{
                  name: 'Observe'
                , value: new Buffer([opts.num])
              }]
          })
      
      server.send(toSend, 0, toSend.length, opts.rsinfo.port, opts.rsinfo.address)
    }

    it('should discard the request after receiving the payload for piggyback CON requests with observe request', function(done) {
      var req = request({
          port: port
        , agent: agent
        , observe: true
        , confirmable: true
      }).end()

      server.once('message', function(msg, rsinfo) {
        var packet  = parse(msg)

        sendObserve({
            num: 1
          , messageId: packet.messageId
          , token: packet.token
          , confirmable: false
          , ack: true
          , rsinfo: rsinfo
        })

        // duplicate, as there was some retransmission
        sendObserve({
            num: 1
          , messageId: packet.messageId
          , token: packet.token
          , confirmable: false
          , ack: true
          , rsinfo: rsinfo
        })

        // some more data
        sendObserve({
            num: 2
          , token: packet.token
          , confirmable: true
          , ack: false
          , rsinfo: rsinfo
        })
      })

      req.on('response', function(res) {
        // fails if it emits 'response' twice
        done()
      })
    })

    it('should close the socket if there are no pending requests', function(done) {
      var firstRsinfo

        , req = request({
              port: port
            , agent: agent
            , observe: true
            , confirmable: true
          }).end()

      server.once('message', function(msg, rsinfo) {
        var packet  = parse(msg)

        sendObserve({
            num: 1
          , messageId: packet.messageId
          , token: packet.token
          , confirmable: false
          , ack: true
          , rsinfo: rsinfo
        })
      })

      server.on('message', function(msg, rsinfo) {
        if (firstRsinfo) {
          expect(rsinfo.port).not.to.eql(firstRsinfo.port);
          done()
        } else {
          firstRsinfo = rsinfo
        }
      })

      req.on('response', function(res) {
        res.close()

        setImmediate(doReq)
      })
    })
  })
})
