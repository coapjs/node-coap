
const bl              = require('bl')
    , dgram           = require('dgram')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , URL             = require('url')
    , Server          = require('./lib/server')
    , IncomingMessage = require('./lib/incoming_message')
    , OutgoingMessage = require('./lib/outgoing_message')
    , parameters      = require('./lib/parameters')
    , optionsConv     = require('./lib/option_converter')
    , RetrySend       = require('./lib/retry_send')

module.exports.request = function(url) {
  var req, sender

    , cleanUp = function() {
                  client.close()
                  sender.reset()
                }

    , client  = dgram.createSocket('udp4', function(msg, rsinfo) {
                  req.emit('response', new IncomingMessage(parse(msg), rsinfo))
                })

  if (typeof url === 'string')
    url = URL.parse(url)

  sender = new RetrySend(client, url.port, url.hostname || url.host)

  req = new OutgoingMessage({}, function(buf) {
    sender.send(buf)
  })

  req.statusCode = url.method || 'GET'

  urlPropertyToPacketOption(url, req, 'pathname', 'Uri-Path', '/')
  urlPropertyToPacketOption(url, req, 'query', 'Uri-Query', '&')

  client.on('error', req.emit.bind(req, 'error'))
  sender.on('error', req.emit.bind(req, 'error'))

  req.on('error', cleanUp)

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
