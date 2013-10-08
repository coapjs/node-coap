
const bl              = require('bl')
    , dgram           = require('dgram')
    , backoff         = require('backoff')
    , parse           = require('coap-packet').parse
    , generate        = require('coap-packet').generate
    , URL             = require('url')
    , Server          = require('./lib/server')
    , IncomingMessage = require('./lib/incoming_message')
    , parameters      = require('./lib/parameters')

module.exports.request = function(url) {
  var req     = bl()

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

    , packet  = { options: [] }

    , send    = function() {
                  try {
                    packet.payload = req.slice()
                    var message = generate(packet)

                    client.send(message, 0, message.length,
                                url.port, url.hostname || url.host)

                    bOff.backoff()
                  } catch(error) {
                    req.emit('error', error)
                  }
                }

  if (typeof url === 'string')
    url = URL.parse(url)

  packet.code = url.method || 'GET'
  url.port = url.port || parameters.coapPort

  urlPropertyToPacketOption(url, packet, 'pathname', 'Uri-Path', '/')
  urlPropertyToPacketOption(url, packet, 'query', 'Uri-Query', '&')

  client.on('error', req.emit.bind(req, 'error'))

  req.on('finish', send)
  req.on('error', cleanUp)
  req.on('response', cleanUp)

  bOff.failAfter(parameters.maxRetransmit - 1)
  bOff.on('ready', send)

  timer = setTimeout(function() {
    var err  = new Error('No reply in ' + parameters.exchangeLifetime + 's')
    req.emit('error', err)
  }, parameters.exchangeLifetime * 1000)

  return req
}

module.exports.createServer = Server

function urlPropertyToPacketOption(url, packet, property, option, separator) {
  if (url[property])
    url[property].split(separator)
       .filter(function(part) { return part !== '' })
       .forEach(function(part) {

      var buf = new Buffer(Buffer.byteLength(part))
      buf.write(part)
      packet.options.push({
          name: option
        , value: buf
      })
    })
}
