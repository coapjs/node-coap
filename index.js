
const bl        = require('bl')
    , dgram     = require('dgram')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , URL       = require('url')
    , coapPort  = 5683

module.exports.request = function(url) {
  var req    = bl()
    , client = dgram.createSocket('udp4')
    , packet = { options: [] }
    , message

  if (typeof url === 'string') {
    url = URL.parse(url)
  }

  url.port = url.port || coapPort

  urlPropertyToPacketOption(url, packet, 'pathname', 'Uri-Path', '/')
  urlPropertyToPacketOption(url, packet, 'query', 'Uri-Query', '&')

  client.on('error', req.emit.bind(req, 'error'))

  req.on('finish', function() {
    packet.payload = req.slice()
    message = generate(packet)

    client.send(message, 0, message.length, url.port, url.hostname, function(err, bytes) {
      client.close()
    })
  })

  return req
}

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
