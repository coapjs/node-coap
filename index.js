
const bl              = require('bl')
    , dgram           = require('dgram')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , URL             = require('url')
    , Server          = require('./lib/server')
    , IncomingMessage = require('./lib/incoming_message')
    , OutgoingMessage = require('./lib/outgoing_message')
    , ObserveStream   = require('./lib/observe_read_stream')
    , parameters      = require('./lib/parameters')
    , optionsConv     = require('./lib/option_converter')
    , RetrySend       = require('./lib/retry_send')

module.exports.request = function(url) {
  var req, sender, response

    , closing = false
    , acking  = false

    , cleanUp = function() {
                  closing = true
                  sender.reset()
                  if (!acking)
                    client.close()
                }

    , client  = dgram.createSocket('udp4', function(msg, rsinfo) {
                  var packet = parse(msg)
                    , buf

                  if (packet.confirmable) {
                    buf = generate({
                        code: '0.00'
                      , ack: true
                      , messageId: packet.messageId
                      , token: packet.token
                    })
                    acking = true

                    client.send(buf, 0, buf.length, rsinfo.port, rsinfo.address, function() {
                      if (closing)
                        client.close()
                    })
                  }

                  sender.reset()

                  if (packet.code == '0.00')
                    return

                  if (url.observe && response)
                    return response.append(packet)

                  if (url.observe) {
                    response = new ObserveStream(packet, rsinfo)
                    response.on('close', cleanUp)
                  } else
                    response = new IncomingMessage(packet, rsinfo)

                  req.emit('response', response)

                })

  if (typeof url === 'string')
    url = URL.parse(url)

  sender = new RetrySend(client, url.port, url.hostname || url.host)

  req = new OutgoingMessage({}, function(req, packet) {
    var buf

    if (url.confirmable !== false) {
      packet.confirmable = true
    }

    try {
      buf = generate(packet)
    } catch(err) {
      return req.emit('error', err)
    }

    sender.send(buf)
  })

  req.statusCode = url.method || 'GET'


  urlPropertyToPacketOption(url, req, 'pathname', 'Uri-Path', '/')
  urlPropertyToPacketOption(url, req, 'query', 'Uri-Query', '&')

  client.on('error', req.emit.bind(req, 'error'))
  sender.on('error', req.emit.bind(req, 'error'))

  req.on('error', cleanUp)

  if (url.observe)
    req.setOption('Observe', null)
  else
    req.on('response', cleanUp)

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
