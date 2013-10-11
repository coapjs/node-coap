
// Generic toBinary and fromBinary definitions
var optionToBinaryFunctions = {}
var optionFromBinaryFunctions = {}

module.exports.toBinary = function(name, value) {
  if (Buffer.isBuffer(value))
    return value

  if (!optionToBinaryFunctions[name])
    throw new Error('Unknown string to Buffer converter for option: ' + name)

  return optionToBinaryFunctions[name](value)
}

module.exports.fromBinary = function(name, value) {
  var convert = optionFromBinaryFunctions[name]

  if (!convert)
    return value

  return convert(value)
}

var registerOption = function(name, toBinary, fromBinary) {
  optionFromBinaryFunctions[name] = fromBinary
  optionToBinaryFunctions[name] = toBinary
}

module.exports.registerOption = registerOption

// ETag option registration
var fromString = function(result) {
  return new Buffer(result)
}

var toString = function(value) {
  return value.toString()
}

registerOption('ETag', fromString, toString)

// Content-Format and Accept options registration
var formatsString = {}
var formatsBinaries = {}

var registerFormat = function(name, value) {
  formatsString[name] = new Buffer([value])
  formatsBinaries[value] = name
}
module.exports.registerFormat = registerFormat

registerFormat('text/plain', 0)
registerFormat('application/link-format', 40)
registerFormat('application/xml', 41)
registerFormat('application/octet-stream', 42)
registerFormat('application/exi', 47)
registerFormat('application/json', 50)

var contentFormatToBinary = function(result) {
  result = formatsString[result]
  if (!result)
    throw new Error('Unknown Content-Format: ' + value)

  return result
}

var contentFormatToString = function(value) {
  if (value.length === 0)
    return formatsBinaries[0]
  
  if (value.length === 1)
    value = value.readUInt8(0)
  else if (value.length === 2)
    value = value.readUInt16BE(0)
  else
    throw new Error('Content-Format option is too big')

  var result = formatsBinaries[value]

  if (!result)
    throw new Error('No matching format found')

  return result
}

registerOption('Content-Format', contentFormatToBinary, contentFormatToString)
registerOption('Accept', contentFormatToBinary, contentFormatToString)
registerOption('Observe', function(sequence) {
  var buf

  if (!sequence) {
    buf = new Buffer(0)
  } else if (sequence < 256) {
    buf = new Buffer(1)
    buf.writeUInt8(sequence, 0)
  } else if (sequence >= 256 & sequence < 65.535) {
    buf = new Buffer(2)
    buf.writeUInt16BE(sequence, 0)
  } else {
    // it is three bytes long
    buf = new Buffer(3)
    buf.writeUInt8(sequence / 65535, 0)
    buf.writeUInt16BE(sequence % 65535, 1)
  }

  return buf
}, function(buf) {
  var result = 0

  if (buf.length === 1) {
    result = buf.readUInt8(0)
  } else if (buf.length === 2) {
    result = buf.readUInt16BE(0)
  } else if (buf.length === 3) {
    result += buf.readUInt8(0) * 65353
    result += buf.readUInt16BE(1)
  }

  return result
})

