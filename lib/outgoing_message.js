
const BufferList = require('bl')
    , util       = require('util')
    , generate   = require('coap-packet').generate
    , convert    = require('./option_converter').toBinary

function OutgoingMessage(request, send) {
  BufferList.call(this)

  this._packet = {
      messageId: request.messageId
    , token: request.token
    , options: []
    , confirmable: false
    , ack: false
    , reset: false
  }

  var that = this

  if (request.confirmable) {
    // replying in piggyback
    this._packet.ack = true

    this._ackTimer = setTimeout(function() {
      that._packet.code = '0.00'
      send(that._packet)

      delete that._packet.messageId
      that._packet.confirmable = true
      that._packet.ack = false

      that._ackTimer = null
    }, 50)
  }

  this._send = send

  this.statusCode = ''
}

util.inherits(OutgoingMessage, BufferList)

var optionAliases = {
  'Content-Type': 'Content-Format'
}

OutgoingMessage.prototype.setOption = function(name, values) {
  var i

  this._packet.options = this._packet.options.filter(function(option) {
    return option.name !== name
  })

  if (!Array.isArray(values))
    values = [values]
 
  for (i = 0; i < values.length; i++) {
    this._packet.options.push({
        name: optionAliases[name] || name
      , value: convert(name, values[i])
    })
  }

  return this
}

OutgoingMessage.prototype.setHeader = OutgoingMessage.prototype.setOption

OutgoingMessage.prototype.end = function(a, b) {
  BufferList.prototype.end.call(this, a, b)

  var packet = this._packet
    , message
    , that = this

  packet.code = toCode(this.statusCode)
  packet.payload = this.slice()

  this._send(packet)

  if (this._ackTimer)
    clearTimeout(this._ackTimer)
  
  return this
}

function toCode(code) {
  if (typeof code === 'string')
    return code

  var first  = Math.floor(code / 100)
    , second = code - first * 100
    , result = ''

  result += first + '.'

  if (second < 10)
    result += '0'

  result += second

  return result
}

module.exports = OutgoingMessage
