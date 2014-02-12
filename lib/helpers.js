/*
 * Copyright (c) 2013-2014 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const toBinary    = require('./option_converter').toBinary
    , fromBinary  = require('./option_converter').fromBinary
    , codes       = {
          '0.01': 'GET'
        , '0.02': 'POST'
        , '0.03': 'PUT'
        , '0.04': 'DELETE'
      }

module.exports.genAck = function(request) {
  return {
      messageId: request.messageId
    , code: '0.00'
    , options: []
    , confirmable: false
    , ack: true
    , reset: false
  }
}

var optionAliases = {
  'Content-Type': 'Content-Format'
}

function setOption(name, values) {
  var i

  this._packet.options = this._packet.options.filter(function(option) {
    return option.name !== name
  })

  if (!Array.isArray(values))
    values = [values]

  for (i = 0; i < values.length; i++) {
    this._packet.options.push({
        name: optionAliases[name] || name
      , value: toBinary(name, values[i])
    })
  }

  return this
}

module.exports.addSetOption = function(klass) {
  var proto = klass.prototype
  proto.setOption = setOption
  proto.setHeader = setOption
}

module.exports.toCode = function toCode(code) {
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

module.exports.packetToMessage = function packetToMessage(dest, packet) {

  var i
    , options = packet.options
    , option
    , paths   = []
    , queries = []
    , query   = ''

  dest.payload = packet.payload
  dest.options = packet.options
  dest.code    = packet.code
  dest.method  = codes[packet.code]
  dest.headers = {}

  for (i=0; i < options.length; i++) {
    option = options[i]

    if (option.name === 'Uri-Path') {
      paths.push(option.value)
    }

    if (option.name === 'Uri-Query') {
      queries.push(option.value)
    }

    option.value = fromBinary(option.name, option.value)

    if (!Buffer.isBuffer(option.value))
      dest.headers[option.name] = option.value
  }

  if (dest.headers['Content-Format'])
    dest.headers['Content-Type'] = dest.headers['Content-Format']

  query = queries.join('&')
  dest.url = '/' + paths.join('/')
  if (query) {
    dest.url += '?' + query
  }
}
