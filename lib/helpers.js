
const convert    = require('./option_converter').toBinary

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
      , value: convert(name, values[i])
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
