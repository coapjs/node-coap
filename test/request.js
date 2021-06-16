/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const coap = require('../')
const toBinary = require('../lib/option_converter').toBinary
const parse = require('coap-packet').parse
const generate = require('coap-packet').generate
const dgram = require('dgram')
const bl = require('bl')
const sinon = require('sinon')
const request = coap.request
const originalSetImmediate = setImmediate

describe('request', function () {
  let server,
    server2,
    port,
    clock

  beforeEach(function (done) {
    port = nextPort()
    server = dgram.createSocket('udp4')
    server.bind(port, done)
    clock = sinon.useFakeTimers()
  })

  afterEach(function () {
    server.close()

    if (server2) { server2.close() }

    server = server2 = null

    clock.restore()
  })

  function fastForward (increase, max) {
    clock.tick(increase)
    if (increase < max) { originalSetImmediate(fastForward.bind(null, increase, max - increase)) }
  }

  function ackBack (msg, rsinfo) {
    const packet = parse(msg)
    const toSend = generate({
      messageId: packet.messageId,
      ack: true,
      code: '0.00'
    })
    server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
  }

  it('should return a pipeable stream', function (done) {
    const req = request('coap://localhost:' + port)
    const stream = bl()

    stream.append('hello world')

    req.on('finish', done)

    stream.pipe(req)
  })

  it('should send the data to the server', function (done) {
    const req = request('coap://localhost:' + port)
    req.end(Buffer.from('hello world'))

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)
      expect(parse(msg).payload.toString()).to.eql('hello world')
      done()
    })
  })

  it('should send a confirmable message by default', function (done) {
    const req = request('coap://localhost:' + port)
    req.end(Buffer.from('hello world'))

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)
      expect(parse(msg).confirmable).to.be.true
      done()
    })
  })

  it('should emit the errors in the req', function (done) {
    this.timeout(20000)
    const req = request('coap://aaa.eee:' + 1234)

    req.once('error', function () {
      coap.globalAgent.abort(req)
      done()
    })

    req.end(Buffer.from('hello world'))
  })

  it('should error if the message is too big', function (done) {
    const req = request('coap://localhost:' + port)

    req.on('error', function () {
      done()
    })

    req.end(Buffer.alloc(1280))
  })

  it('should imply a default port', function (done) {
    server2 = dgram.createSocket('udp4')

    server2.bind(5683, function () {
      request('coap://localhost').end()
    })

    server2.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)
      done()
    })
  })

  it('should send the path to the server', function (done) {
    const req = request('coap://localhost:' + port + '/hello')
    req.end(Buffer.from('hello world'))

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)

      const packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Path')
      expect(packet.options[0].value).to.eql(Buffer.from('hello'))

      done()
    })
  })

  it('should send a longer path to the server', function (done) {
    const req = request('coap://localhost:' + port + '/hello/world')
    req.end(Buffer.from('hello world'))

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)

      const packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Path')
      expect(packet.options[0].value).to.eql(Buffer.from('hello'))
      expect(packet.options[1].name).to.eql('Uri-Path')
      expect(packet.options[1].value).to.eql(Buffer.from('world'))
      done()
    })
  })

  it('should accept an object instead of a string', function (done) {
    const req = request({
      hostname: 'localhost',
      port: port,
      pathname: '/hello/world'
    })

    req.end(Buffer.from('hello world'))

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)

      const packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Path')
      expect(packet.options[0].value).to.eql(Buffer.from('hello'))
      expect(packet.options[1].name).to.eql('Uri-Path')
      expect(packet.options[1].value).to.eql(Buffer.from('world'))
      done()
    })
  })

  it('should send a query string to the server', function (done) {
    const req = request('coap://localhost:' + port + '?a=b&c=d')
    req.end(Buffer.from('hello world'))

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)

      const packet = parse(msg)
      expect(packet.options[0].name).to.eql('Uri-Query')
      expect(packet.options[0].value).to.eql(Buffer.from('a=b'))
      expect(packet.options[1].name).to.eql('Uri-Query')
      expect(packet.options[1].value).to.eql(Buffer.from('c=d'))
      done()
    })
  })

  it('should accept a method parameter', function (done) {
    request({
      port: port,
      method: 'POST'
    }).end()

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)

      const packet = parse(msg)
      expect(packet.code).to.eql('0.02')
      done()
    })
  })

  it('should accept a token parameter', function (done) {
    request({
      port: port,
      token: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])
    }).end()

    server.on('message', function (msg, rsinfo) {
      try {
        ackBack(msg, rsinfo)

        const packet = parse(msg)
        expect(packet.token).to.eql(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
        done()
      } catch (err) {
        done(err)
      }
    })
  })

  it('should ignore empty token parameter', function (done) {
    request({
      port: port,
      token: Buffer.from([])
    }).end()

    server.on('message', function (msg, rsinfo) {
      try {
        ackBack(msg, rsinfo)

        const packet = parse(msg)
        expect(packet.token.length).to.be.above(0)
        done()
      } catch (err) {
        done(err)
      }
    })
  })

  it('should reject too long token', function (done) {
    const rq = request({
      port: port,
      token: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    })

    rq.on('error', function (err) {
      if (err.message === 'Token may be no longer than 8 bytes.') {
        // Success, this is what we were expecting
        done()
      } else {
        // Not our error
        done(err)
      }
    })

    rq.end()

    server.on('message', function (msg, rsinfo) {
      // We should not see this!
      ackBack(msg, rsinfo)
      done(new Error('Message should not have been sent!'))
    })
  })

  it('should emit a response with a piggyback CON message', function (done) {
    const req = request({
      port: port,
      confirmable: true
    })

    server.on('message', function (msg, rsinfo) {
      const packet = parse(msg)
      const toSend = generate({
        messageId: packet.messageId,
        token: packet.token,
        payload: Buffer.from('42'),
        ack: true,
        code: '2.00'
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      res.pipe(bl(function (err, data) {
        if (err) {
          done(err)
        } else {
          expect(data).to.eql(Buffer.from('42'))
          done()
        }
      }))
    })

    req.end()
  })

  it('should emit a response with a delayed CON message', function (done) {
    const req = request({
      port: port,
      confirmable: true
    })

    server.once('message', function (msg, rsinfo) {
      const packet = parse(msg)
      let toSend = generate({
        messageId: packet.messageId,
        token: packet.token,
        payload: Buffer.alloc(0),
        ack: true,
        code: '0.00'
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      toSend = generate({
        token: packet.token,
        payload: Buffer.from('42'),
        confirmable: true,
        code: '2.00'
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      res.pipe(bl(function (err, data) {
        if (err) {
          done(err)
        } else {
          expect(data).to.eql(Buffer.from('42'))
          done()
        }
      }))
    })

    req.end()
  })

  it('should send an ACK back after receiving a CON response', function (done) {
    const req = request({
      port: port,
      confirmable: true
    })

    server.once('message', function (msg, rsinfo) {
      let packet = parse(msg)
      let toSend = generate({
        messageId: packet.messageId,
        ack: true,
        code: '0.00'
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      toSend = generate({
        token: packet.token,
        payload: Buffer.from('42'),
        confirmable: true,
        code: '2.00'
      })

      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      server.once('message', function (msg, rsinfo) {
        packet = parse(msg)
        expect(packet.code).to.eql('0.00')
        expect(packet.ack).to.be.true
        expect(packet.messageId).to.eql(parse(toSend).messageId)
        done()
      })
    })

    req.end()
  })

  it('should not emit a response with an ack', function (done) {
    const req = request({
      port: port,
      confirmable: true
    })

    server.on('message', function (msg, rsinfo) {
      ackBack(msg, rsinfo)
      setTimeout(function () {
        done()
      }, 20)
      fastForward(5, 25)
    })

    req.on('response', function (res) {
      done(new Error('Unexpected response'))
    })

    req.end()
  })

  it('should emit a response with a NON message', function (done) {
    const req = request({
      port: port,
      confirmable: false
    })

    server.on('message', function (msg, rsinfo) {
      const packet = parse(msg)
      const toSend = generate({
        messageId: packet.messageId,
        token: packet.token,
        payload: Buffer.from('42'),
        code: '2.00'
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      res.pipe(bl(function (err, data) {
        if (err) {
          done(err)
        }
        expect(data).to.eql(Buffer.from('42'))
        done()
      }))
    })

    req.end()
  })

  it('should emit a response on reset', function (done) {
    const req = request({
      port: port
    })

    server.on('message', function (msg, rsinfo) {
      const packet = parse(msg)
      const toSend = generate({
        messageId: packet.messageId,
        code: '0.00',
        ack: false,
        reset: true
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      if (res.code === '0.00') {
        done()
      } else {
        done(new Error('Unexpected response'))
      }
    })

    req.end()
  })

  it('should stop retrying on reset', function (done) {
    const req = request({
      port: port
    })
    let messages = 0

    server.on('message', function (msg, rsinfo) {
      const packet = parse(msg)
      const toSend = generate({
        messageId: packet.messageId,
        code: '0.00',
        ack: false,
        reset: true
      })
      messages++
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      if (res.code !== '0.00') {
        done(new Error('Unexpected response'))
      }
    })
    req.end()

    setTimeout(function () {
      expect(messages).to.eql(1)
      done()
    }, 45 * 1000)

    fastForward(100, 45 * 1000)
  })

  it('should not send response to invalid packets', function (done) {
    const req = request({
      port: port
    })
    let messages = 0

    server.on('message', function (msg, rsinfo) {
      const packet = parse(msg)
      const toSend = generate({
        messageId: packet.messageId,
        code: '0.00',
        ack: true,
        payload: 'this payload invalidates empty message'
      })
      expect(packet.code).to.be.eq('0.01')
      messages++
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      done(new Error('Unexpected response'))
    })

    req.end()

    setTimeout(function () {
      expect(messages).to.eql(5)
      done()
    }, 45 * 1000)

    fastForward(100, 45 * 1000)
  })

  it('should allow to add an option', function (done) {
    const req = request({
      port: port
    })
    const buf = Buffer.alloc(3)

    req.setOption('ETag', buf)
    req.end()

    server.on('message', function (msg) {
      expect(parse(msg).options[0].name).to.eql('ETag')
      expect(parse(msg).options[0].value).to.eql(buf)
      done()
    })
  })

  it('should attempt to normalize option case', function (done) {
    const req = request({
      port: port
    })
    const buf = Buffer.alloc(3)

    req.setOption('content-type', buf)
    req.end()

    server.on('message', function (msg) {
      expect(parse(msg).options[0].name).to.eql('Content-Format')
      expect(parse(msg).options[0].value).to.eql(buf)
      done()
    })
  })

  it('should overwrite the option', function (done) {
    const req = request({
      port: port
    })
    const buf = Buffer.alloc(3)

    req.setOption('ETag', Buffer.alloc(3))
    req.setOption('ETag', buf)
    req.end()

    server.on('message', function (msg) {
      expect(parse(msg).options[0].value).to.eql(buf)
      done()
    })
  })

  it('should alias setOption to setHeader', function (done) {
    const req = request({
      port: port
    })
    const buf = Buffer.alloc(3)

    req.setHeader('ETag', buf)
    req.end()

    server.on('message', function (msg) {
      expect(parse(msg).options[0].value).to.eql(buf)
      done()
    })
  })

  it('should set multiple options', function (done) {
    const req = request({
      port: port
    })
    const buf1 = Buffer.alloc(3)
    const buf2 = Buffer.alloc(3)

    req.setOption('433', [buf1, buf2])
    req.end()

    server.on('message', function (msg) {
      expect(parse(msg).options[0].value).to.eql(buf1)
      expect(parse(msg).options[1].value).to.eql(buf2)
      done()
    })
  })

  it('should alias the \'Content-Format\' option to \'Content-Type\'', function (done) {
    const req = request({
      port: port
    })

    req.setOption('Content-Type', Buffer.of(0))
    req.end()

    server.on('message', function (msg) {
      expect(parse(msg).options[0].name).to.eql('Content-Format')
      expect(parse(msg).options[0].value).to.eql(Buffer.of(0))
      done()
    })
  })

  it('should not crash with two CON responses with the same messageId & token', function (done) {
    const req = request({
      port: port,
      confirmable: true
    })

    server.once('message', function (msg, rsinfo) {
      const packet = parse(msg)
      let toSend = generate({
        token: packet.token,
        messageId: packet.messageId,
        payload: Buffer.from('42'),
        confirmable: true,
        code: '2.00'
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)

      toSend = generate({
        token: packet.token,
        messageId: packet.messageId,
        payload: Buffer.from('42'),
        confirmable: true,
        code: '2.00'
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      res.pipe(bl(function (err, data) {
        if (err) {
          done(err)
        } else {
          expect(data).to.eql(Buffer.from('42'))
          done()
        }
      }))
    })

    req.end()
  })

  const formatsString = {
    'text/plain': Buffer.of(0),
    'application/link-format': Buffer.of(40),
    'application/xml': Buffer.of(41),
    'application/octet-stream': Buffer.of(42),
    'application/exi': Buffer.of(47),
    'application/json': Buffer.of(50),
    'application/cbor': Buffer.of(60)
  }

  describe('with the \'Content-Format\' header in the outgoing message', function () {
    function buildTest (format, value) {
      it('should parse ' + format, function (done) {
        const req = request({
          port: port
        })

        req.setOption('Content-Format', format)
        req.end()

        server.on('message', function (msg) {
          expect(parse(msg).options[0].value).to.eql(value)
          done()
        })
      })
    }

    for (const format in formatsString) {
      buildTest(format, formatsString[format])
    }
  })

  describe('with the \'Accept\' header in the outgoing message', function () {
    function buildTest (format, value) {
      it('should parse ' + format, function (done) {
        const req = request({
          port: port
        })

        req.setHeader('Accept', format)
        req.end()

        server.on('message', function (msg) {
          expect(parse(msg).options[0].value).to.eql(value)
          done()
        })
      })
    }

    for (const format in formatsString) {
      buildTest(format, formatsString[format])
    }
  })

  describe('with the \'Content-Format\' in the response', function () {
    function buildResponse (value) {
      return function (msg, rsinfo) {
        const packet = parse(msg)
        const toSend = generate({
          messageId: packet.messageId,
          code: '2.05',
          token: packet.token,
          options: [{
            name: 'Content-Format',
            value: value
          }]
        })
        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      }
    }

    function buildTest (format, value) {
      it('should parse ' + format, function (done) {
        const req = request({
          port: port
        })

        server.on('message', buildResponse(value))

        req.on('response', function (res) {
          expect(res.options[0].value).to.eql(format)
          done()
        })

        req.end()
      })

      it('should include ' + format + ' in the headers', function (done) {
        const req = request({
          port: port
        })

        server.on('message', buildResponse(value))

        req.on('response', function (res) {
          expect(res.headers['Content-Format']).to.eql(format)
          expect(res.headers['Content-Type']).to.eql(format)
          done()
        })

        req.end()
      })
    }

    for (const format in formatsString) {
      buildTest(format, formatsString[format])
    }
  })

  it('should include \'ETag\' in the response headers', function (done) {
    const req = request({
      port: port
    })

    server.on('message', function (msg, rsinfo) {
      const packet = parse(msg)
      const toSend = generate({
        messageId: packet.messageId,
        code: '2.05',
        token: packet.token,
        options: [{
          name: 'ETag',
          value: Buffer.from('abcdefgh')
        }]
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      expect(res.headers).to.have.property('ETag', 'abcdefgh')
      done()
    })

    req.end()
  })

  it('should include original and destination socket information in the response', function (done) {
    const req = request({
      port: port
    })

    server.on('message', function (msg, rsinfo) {
      const packet = parse(msg)
      const toSend = generate({
        messageId: packet.messageId,
        code: '2.05',
        token: packet.token,
        options: []
      })
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    })

    req.on('response', function (res) {
      expect(res).to.have.property('rsinfo')
      expect(res).to.have.property('outSocket')
      expect(res.outSocket).to.have.property('address')
      expect(res.outSocket).to.have.property('port')
      done()
    })

    req.end()
  })

  describe('non-confirmable retries', function () {
    let clock

    beforeEach(function () {
      clock = sinon.useFakeTimers()
    })

    afterEach(function () {
      clock.restore()
    })

    function doReq () {
      return request({
        port: port,
        confirmable: false
      }).end()
    }

    function fastForward (increase, max) {
      clock.tick(increase)
      if (increase < max) { originalSetImmediate(fastForward.bind(null, increase, max - increase)) }
    }

    it('should timeout after ~202 seconds', function (done) {
      const req = doReq()

      req.on('error', function () {
      })

      req.on('timeout', function (err) {
        expect(err).to.have.property('message', 'No reply in 202s')
        expect(err).to.have.property('retransmitTimeout', 202)
        done()
      })

      fastForward(1000, 202 * 1000)
    })

    it('should not retry before timeout', function (done) {
      const req = doReq()
      let messages = 0

      server.on('message', function (msg) {
        messages++
      })

      req.on('timeout', function () {
        expect(messages).to.eql(1)
        done()
      })

      fastForward(100, 247 * 1000)
    })

    it('should not retry before 45s', function (done) {
      doReq()
      let messages = 0

      server.on('message', function (msg) {
        messages++
      })

      setTimeout(function () {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(20, 45 * 1000)
    })

    it('should stop retrying if it receives a message', function (done) {
      doReq()
      let messages = 0

      server.on('message', function (msg, rsinfo) {
        messages++
        const packet = parse(msg)
        const toSend = generate({
          messageId: packet.messageId,
          token: packet.token,
          code: '2.00',
          ack: true,
          payload: Buffer.alloc(5)
        })

        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      })

      setTimeout(function () {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })
  })

  describe('confirmable retries', function () {
    let clock

    beforeEach(function () {
      clock = sinon.useFakeTimers()
    })

    afterEach(function () {
      clock.restore()
    })

    function doReq () {
      return request({
        port: port,
        confirmable: true
      }).end()
    }

    function fastForward (increase, max) {
      clock.tick(increase)
      if (increase < max) { originalSetImmediate(fastForward.bind(null, increase, max - increase)) }
    }

    it('should error after ~247 seconds', function (done) {
      const req = doReq()

      req.on('error', function (err) {
        expect(err).to.have.property('message', 'No reply in 247s')
        done()
      })

      fastForward(1000, 247 * 1000)
    })

    it('should retry four times before erroring', function (done) {
      const req = doReq()
      let messages = 0

      server.on('message', function (msg) {
        messages++
      })

      req.on('error', function () {
        // original one plus 4 retries
        expect(messages).to.eql(5)
        done()
      })

      fastForward(100, 247 * 1000)
    })

    it('should retry with the same message id', function (done) {
      const req = doReq()
      let messageId

      server.on('message', function (msg) {
        const packet = parse(msg)

        if (!messageId) { messageId = packet.messageId }

        expect(packet.messageId).to.eql(messageId)
      })

      req.on('error', function () {
        done()
      })

      fastForward(100, 247 * 1000)
    })

    it('should retry four times before 45s', function (done) {
      doReq()
      let messages = 0

      server.on('message', function (msg) {
        messages++
      })

      setTimeout(function () {
        // original one plus 4 retries
        expect(messages).to.eql(5)
        done()
      }, 45 * 1000)

      fastForward(20, 45 * 1000)
    })

    it('should stop retrying if it receives an ack', function (done) {
      doReq()
      let messages = 0

      server.on('message', function (msg, rsinfo) {
        messages++
        const packet = parse(msg)
        const toSend = generate({
          messageId: packet.messageId,
          code: '0.00',
          ack: true
        })

        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      })

      setTimeout(function () {
        expect(messages).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })
  })

  describe('observe', function () {
    function doObserve () {
      server.on('message', function (msg, rsinfo) {
        const packet = parse(msg)

        if (packet.ack) { return }

        ssend(rsinfo, {
          messageId: packet.messageId,
          token: packet.token,
          payload: Buffer.from('42'),
          ack: true,
          options: [{
            name: 'Observe',
            value: Buffer.of(1)
          }],
          code: '2.05'
        })

        ssend(rsinfo, {
          token: packet.token,
          payload: Buffer.from('24'),
          confirmable: true,
          options: [{
            name: 'Observe',
            value: Buffer.of(2)
          }],
          code: '2.05'
        })
      })

      return request({
        port: port,
        observe: true
      }).end()
    }

    function ssend (rsinfo, packet) {
      const toSend = generate(packet)
      server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
    }

    function sendNotification (rsinfo, req, opts) {
      ssend(rsinfo, {
        messageId: req.messageId,
        token: req.token,
        payload: Buffer.from(opts.payload),
        ack: false,
        options: [{
          name: 'Observe',
          value: toBinary('Observe', opts.num)
        }],
        code: '2.05'
      })
    }

    it('should ack the update', function (done) {
      doObserve()

      server.on('message', function (msg) {
        if (parse(msg).ack) { done() }
      })
    })

    it('should emit any more data after close', function (done) {
      const req = doObserve()

      req.on('response', function (res) {
        res.once('data', function (data) {
          expect(data.toString()).to.eql('42')
          res.close()
          done()

          res.on('data', function (data) {
            done(new Error('this should never happen'))
          })
        })
      })
    })

    it('should send origin and destination socket data along with the response', function (done) {
      const req = doObserve()

      req.on('response', function (res) {
        res.once('data', function (data) {
          expect(res).to.have.property('rsinfo')
          expect(res).to.have.property('outSocket')
          expect(res.outSocket).to.have.property('address')
          expect(res.outSocket).to.have.property('port')
          res.close()
          done()
        })
      })
    })

    it('should emit any more data after close', function (done) {
      const req = doObserve()

      req.on('response', function (res) {
        res.once('data', function (data) {
          expect(data.toString()).to.eql('42')
          res.close()
          done()

          res.on('data', function (data) {
            done(new Error('this should never happen'))
          })
        })
      })
    })

    it('should send deregister request if close(eager=true)', function (done) {
      const req = doObserve()

      req.on('response', function (res) {
        res.once('data', function (data) {
          expect(data.toString()).to.eql('42')
          res.close(true)

          server.on('message', function (msg, rsinfo) {
            const packet = parse(msg)
            if (packet.ack && (packet.code === '0.00')) { return }

            try {
              expect(packet.options.length).to.be.least(1)
              expect(packet.options[0].name).to.eql('Observe')
              expect(packet.options[0].value).to.eql(Buffer.from([1]))
            } catch (err) {
              return done(err)
            }
            done()
          })
        })
      })
    })

    it('should send an empty Observe option', function (done) {
      request({
        port: port,
        observe: true
      }).end()

      server.on('message', function (msg, rsinfo) {
        const packet = parse(msg)
        expect(packet.options[0].name).to.eql('Observe')
        expect(packet.options[0].value).to.eql(Buffer.alloc(0))
        done()
      })
    })

    it('should allow user to send Observe=1', function (done) {
      request({
        port: port,
        observe: 1
      }).end()

      server.on('message', function (msg, rsinfo) {
        const packet = parse(msg)
        try {
          expect(packet.options[0].name).to.eql('Observe')
          expect(packet.options[0].value).to.eql(Buffer.from([1]))
        } catch (err) {
          return done(err)
        }

        done()
      })
    })

    it('should allow multiple notifications', function (done) {
      server.once('message', function (msg, rsinfo) {
        const req = parse(msg)

        sendNotification(rsinfo, req, { num: 0, payload: 'zero' })
        sendNotification(rsinfo, req, { num: 1, payload: 'one' })
      })

      const req = request({
        port: port,
        observe: true,
        confirmable: false
      }).end()

      req.on('response', function (res) {
        let ndata = 0

        res.on('data', function (data) {
          ndata++
          if (ndata === 1) {
            expect(res.headers.Observe).to.equal(0)
            expect(data.toString()).to.equal('zero')
          } else if (ndata === 2) {
            expect(res.headers.Observe).to.equal(1)
            expect(data.toString()).to.equal('one')
            done()
          } else {
            done(new Error('Unexpected data'))
          }
        })
      })
    })

    it('should drop out of order notifications', function (done) {
      server.once('message', function (msg, rsinfo) {
        const req = parse(msg)

        sendNotification(rsinfo, req, { num: 1, payload: 'one' })
        sendNotification(rsinfo, req, { num: 0, payload: 'zero' })
        sendNotification(rsinfo, req, { num: 2, payload: 'two' })
      })

      const req = request({
        port: port,
        observe: true,
        confirmable: false
      }).end()

      req.on('response', function (res) {
        let ndata = 0

        res.on('data', function (data) {
          ndata++
          if (ndata === 1) {
            expect(res.headers.Observe).to.equal(1)
            expect(data.toString()).to.equal('one')
          } else if (ndata === 2) {
            expect(res.headers.Observe).to.equal(2)
            expect(data.toString()).to.equal('two')
            done()
          } else {
            done(new Error('Unexpected data'))
          }
        })
      })
    })

    it('should allow repeating order after 128 seconds', function (done) {
      server.once('message', function (msg, rsinfo) {
        const req = parse(msg)

        sendNotification(rsinfo, req, { num: 1, payload: 'one' })
        setTimeout(function () {
          sendNotification(rsinfo, req, { num: 1, payload: 'two' })
        }, 128 * 1000 + 200)
      })

      const req = request({
        port: port,
        observe: true,
        confirmable: false
      }).end()

      req.on('response', function (res) {
        let ndata = 0

        res.on('data', function (data) {
          ndata++
          if (ndata === 1) {
            expect(res.headers.Observe).to.equal(1)
            expect(data.toString()).to.equal('one')
          } else if (ndata === 2) {
            expect(res.headers.Observe).to.equal(1)
            expect(data.toString()).to.equal('two')
            done()
          } else {
            done(new Error('Unexpected data'))
          }
        })
      })

      fastForward(100, 129 * 1000)
    })

    it('should allow Observe option 24bit overflow', function (done) {
      server.once('message', function (msg, rsinfo) {
        const req = parse(msg)

        sendNotification(rsinfo, req, { num: 0xffffff, payload: 'max' })
        sendNotification(rsinfo, req, { num: 0, payload: 'zero' })
      })

      const req = request({
        port: port,
        observe: true,
        confirmable: false
      }).end()

      req.on('response', function (res) {
        let ndata = 0

        res.on('data', function (data) {
          ndata++
          if (ndata === 1) {
            expect(res.headers.Observe).to.equal(0xffffff)
            expect(data.toString()).to.equal('max')
          } else if (ndata === 2) {
            expect(res.headers.Observe).to.equal(0)
            expect(data.toString()).to.equal('zero')
            done()
          } else {
            done(new Error('Unexpected data'))
          }
        })
      })
    })
  })

  describe('token', function () {
    let clock

    beforeEach(function () {
      clock = sinon.useFakeTimers()
    })

    afterEach(function () {
      clock.restore()
    })

    function fastForward (increase, max) {
      clock.tick(increase)
      if (increase < max) { originalSetImmediate(fastForward.bind(null, increase, max - increase)) }
    }

    it('should timeout if the response token size doesn\'t match the request\'s', function (done) {
      const req = request({
        port: port
      })

      server.on('message', function (msg, rsinfo) {
        const packet = parse(msg)
        const toSend = generate({
          messageId: packet.messageId,
          token: Buffer.alloc(2),
          options: []
        })
        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      })

      req.on('error', function () {})

      req.on('timeout', function () {
        done()
      })

      req.end()

      fastForward(1000, 247 * 1000)
    })

    it('should timeout if the response token content doesn\'t match the request\'s', function (done) {
      const req = request({
        port: port
      })

      server.on('message', function (msg, rsinfo) {
        const packet = parse(msg)
        const toSend = generate({
          messageId: packet.messageId,
          token: Buffer.alloc(4),
          options: []
        })
        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      })

      req.on('error', function () {})

      req.on('timeout', function () {
        done()
      })

      req.end()

      fastForward(1000, 247 * 1000)
    })
  })

  describe('multicast', function () {
    const MULTICAST_ADDR = '224.0.0.1'
    const port2 = nextPort()
    let sock = null

    function doReq () {
      return request({
        host: MULTICAST_ADDR,
        port: port,
        multicast: true
      }).end()
    }

    beforeEach(function (done) {
      sock = dgram.createSocket('udp4')
      sock.bind(port2, function () {
        server.addMembership(MULTICAST_ADDR)
        sock.addMembership(MULTICAST_ADDR)
        done()
      })
    })

    afterEach(function () {
      sock.close()
    })

    it('should be non-confirmable', function (done) {
      doReq()

      server.on('message', function (msg, rsinfo) {
        const packet = parse(msg)
        expect(packet).to.have.property('confirmable', false)
        done()
      })
    })

    it('should be responsed with the same token', function (done) {
      const req = doReq()
      let token

      server.on('message', function (msg, rsinfo) {
        const packet = parse(msg)
        token = packet.token

        const toSend = generate({
          messageId: packet.messageId,
          token: packet.token,
          payload: Buffer.from('42'),
          ack: true,
          code: '2.00'
        })

        server.send(toSend, 0, toSend.length, rsinfo.port, rsinfo.address)
      })

      req.on('response', function (res) {
        const packet = res._packet
        expect(packet).to.have.property('confirmable', false)
        expect(packet).to.have.property('reset', false)
        expect(packet.token).to.eql(token)
        done()
      })
    })

    it('should allow for differing MIDs for non-confirmable requests', function (done) {
      let _req = null
      let counter = 0
      const servers = [undefined, undefined]
      const mids = [0, 0]

      servers.forEach(function (_, i) {
        servers[i] = coap.createServer(function (req, res) {
          const mid = _req._packet.messageId + i + 1
          res._packet.messageId = mid
          mids[i] = mid
          res.end()
        })
        servers[i].listen(sock)
      })

      _req = request({
        host: MULTICAST_ADDR,
        port: port2,
        confirmable: false,
        multicast: true
      }).on('response', function (res) {
        if (++counter === servers.length) {
          mids.forEach(function (mid, i) {
            expect(mid).to.eql(_req._packet.messageId + i + 1)
          })
          done()
        }
      }).end()
    })

    it('should allow for block-wise transfer when using multicast', function (done) {
      const payload = Buffer.alloc(1536)

      server = coap.createServer((req, res) => {
        expect(req.url).to.eql('/hello')
        res.end(payload)
      })
      server.listen(sock)

      request({
        host: MULTICAST_ADDR,
        port: port2,
        pathname: '/hello',
        confirmable: false,
        multicast: true
      }).on('response', function (res) {
        expect(res.payload.toString()).to.eql(payload.toString())
        done()
      }).end()
    })

    it('should preserve all listeners when using block-wise transfer and multicast', function (done) {
      const payload = Buffer.alloc(1536)

      server = coap.createServer((req, res) => {
        res.end(payload)
      })
      server.listen(sock)

      const _req = request({
        host: MULTICAST_ADDR,
        port: port2,
        confirmable: false,
        multicast: true
      })

      _req.on('bestEventEver', function () {
        done()
      })

      _req.on('response', function (res) {
        expect(res.payload.toString()).to.eql(payload.toString())
        _req.emit('bestEventEver')
      }).end()
    })

    it('should ignore multiple responses from the same hostname when using block2 multicast', function (done) {
      const payload = Buffer.alloc(1536)

      let counter = 0

      server = coap.createServer((req, res) => {
        res.end(payload)
      })
      server.listen(sock)

      const server2 = coap.createServer((req, res) => {
        res.end(payload)
      })
      server2.listen(sock)

      request({
        host: MULTICAST_ADDR,
        port: port2,
        confirmable: false,
        multicast: true
      }).on('response', function (res) {
        counter++
      }).end()

      setTimeout(function () {
        expect(counter).to.eql(1)
        done()
      }, 45 * 1000)

      fastForward(100, 45 * 1000)
    })
  })
})
