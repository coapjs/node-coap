
const bl              = require('bl')
    , dgram           = require('dgram')
    , backoff         = require('backoff')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , URL             = require('url')
    , Server          = require('./lib/server')
    , IncomingMessage = require('./lib/incoming_message')
    , OutgoingMessage = require('./lib/outgoing_message')
    , parameters      = require('./lib/parameters')
    , optionsConv     = require('./lib/option_converter')

module.exports.request = function(url) {
  var req

    , bOff    = backoff.exponential({
                  randomisationFactor: 0.2,
                  initialDelay: 1222,
                  maxDelay: parameters.maxTransmitSpan * 1000
                })

    , timer

    , cleanUp = function() {
                  client.close()
                  bOff.reset()
                  clearTimeout(timer)
                }

    , client  = dgram.createSocket('udp4', function(msg, rsinfo) {
                  req.emit('response', new IncomingMessage(parse(msg), rsinfo))
                })

    , message

    , send

  send = function(buf) {
    if (Buffer.isBuffer(buf))
      message = buf

    client.send(message, 0, message.length,
                url.port, url.hostname || url.host)

    bOff.backoff()
  }

  req = new OutgoingMessage({}, send)

  if (typeof url === 'string')
    url = URL.parse(url)

  req.statusCode = url.method || 'GET'
  url.port = url.port || parameters.coapPort

  urlPropertyToPacketOption(url, req, 'pathname', 'Uri-Path', '/')
  urlPropertyToPacketOption(url, req, 'query', 'Uri-Query', '&')

  client.on('error', req.emit.bind(req, 'error'))

  req.on('error', cleanUp)

  bOff.failAfter(parameters.maxRetransmit - 1)
  bOff.on('ready', send)

  timer = setTimeout(function() {
    var err  = new Error('No reply in ' + parameters.exchangeLifetime + 's')
    req.emit('error', err)
  }, parameters.exchangeLifetime * 1000)

  return req
}

module.exports.createServer = Server

function urlPropertyToPacketOption(url, req, property, option, separator) {
  if (url[property])
    req.setOption(option, url[property].split(separator)
         .filter(function(part) { return part !== '' })
         .map(function(part) {

      var buf = new Buffer(Buffer.byteLength(part))
      buf.write(part)
      return buf
    }))
}

module.exports.registerOption = optionsConv.registerOption
module.exports.registerFormat = optionsConv.registerFormat
