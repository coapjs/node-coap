
const coap      = require('../')
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

  function doReq() {
    return request({
        port: port
      , agent: agent
      , confirmable: false
    }).end()
  }

  it('should reuse the same socket for multiple requests', function(done) {
    var firstRsinfo

    doReq()
    doReq()

    server.on('message', function(msg, rsinfo) {
      if (firstRsinfo) {
        expect(rsinfo).to.eql(firstRsinfo);
        done()
      } else {
        firstRsinfo = rsinfo
      }
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

  it('should discard the request after receiving the payload', function(done) {
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
})
