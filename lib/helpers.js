/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var toBinary    = require('./option_converter').toBinary
  , fromBinary  = require('./option_converter').fromBinary
  , codes       = {
        '0.01': 'GET'
      , '0.02': 'POST'
      , '0.03': 'PUT'
      , '0.04': 'DELETE'
    }
  , capitalize  = require('capitalize')
  , isIgnored   = require('./option_converter').isIgnored

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
  'Content-Type': 'Content-Format',
  'Etag': 'ETag'
}

function setOption(name, values) {
  var i

  name = capitalize.words(name)
  name = optionAliases[name] || name

  if (isIgnored(name)) {
    return this
  }

  this._packet.options = this._packet.options.filter(function(option) {
    return option.name !== name
  })

  if (!Array.isArray(values))
    values = [values]

  for (i = 0; i < values.length; i++) {
    this._packet.options.push({
        name: name
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

/*
get an option value from options
  options     array of object, in form {name: , value}
  name        name of the object wanted to retrive
  return      value, or null
*/
module.exports.getOption = function getOption(options, name) {
  for (var i in options)
    if (options[i].name == name)
      return options[i].value
  return null
}
/*
parse block2
  value       block2 value buffer
  return      object describes block2, {moreBlock2: , num: , size: }

with invalid block2 value, the function return null
*/
module.exports.parseBlock2 = function parseBlock2(block2Value) {
  var num
  switch (block2Value.length) {
    case 1:
    num = block2Value[0] >> 4
    break
    case 2:
    num = (block2Value[0]*256 + block2Value[1]) >> 4
    break
    case 3:
    num = (block2Value[0]*256*256 + block2Value[1]*256 + block2Value[2]) >>4
    break
    default:
    // Block2 is more than 3 bytes
    return null
  }
  // limit value of size is 1024 (2**(6+4))
  if (block2Value.slice(-1)[0] == 7) {
    // Block size is bigger than 1024
    return null
  }
  return {
    moreBlock2: (block2Value.slice(-1)[0] & (0x01<<3))? true:false,
    num: num,
    size: Math.pow(2, (block2Value.slice(-1)[0] & 0x07)+4)
  }
}

/*
create buffer for block2 option
  requestedBlock      object contain block2 infor, e.g. {moreBlock2: true, num: 100, size: 32}
  return              new Buffer, carry block2 value
*/
module.exports.createBlock2 = function createBlock2(requestedBlock) {
  var byte
  var szx = Math.log(requestedBlock.size)/Math.log(2) - 4
  var m = ((requestedBlock.moreBlock2==true)?0:1)
  var num = requestedBlock.num
  var extraNum

  byte = 0
  byte |= szx
  byte |= m << 3
  byte |= (num&0xf) <<4

  // total num occupy up to 5 octets
  // num share the higher octet of first byte, and (may) take more 2 bytes for the rest 4 octets
  if (num <= 0xf) {
    extraNum = null
  }
  else if (num <=0xfff) {
    extraNum = new Buffer([num/16])
  }
  else if (num <=0xfffff) {
    extraNum = new Buffer(2)
    extraNum.writeUInt16BE(num>>4,0)
  }
  else {
    // too big block2 number
    return null
  }
  return (extraNum)? Buffer.concat([extraNum, new Buffer([byte])]):new Buffer([byte])
}

/**
 * Provide a or function to use with the reduce() Array method
 */
module.exports.or = function or(previous, current) {
    return previous || current;
}

/**
 * Provide a function to detect whether an option has a particular name (for its use with filter or map).
 */
module.exports.isOption = function isOption(optionName) {
  return function(option) {
    return option.name === optionName;
  }
}

module.exports.isNumeric = function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

module.exports.isBoolean = function isBoolean(n) {
  return typeof(n) === 'boolean';
}
