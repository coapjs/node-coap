// const dgram       = require('dgram')
//     , packet      = require('coap-packet')
//     , parse       = packet.parse
//     , generate    = packet.generate
//     , payload     = new Buffer(1000)
//     , message     = generate({ payload: payload })
//     , port        = 41234
//     , clientUDP      = dgram.createSocket("udp4")
//     , serverUDP      = dgram.createSocket("udp4")


const coap        = require('./..')
    , server      = coap.createServer()
    , payload     = new Buffer(10000)

var maxBlock2   = 1024    //16, 32, 64, must <= 2**(6+4)
var totalBlock
var isLastBlock

// server
// plays split up for blockwise 
server.on('request', function(req, res) {
  var requestedBlockOption = _parseBlock2(req.options) 

  // for the first request, block2 option may be missed
  if (!requestedBlockOption) 
    requestedBlockOption = {
      size: maxBlock2,
      num: 0
    }

  // block2 size should not bigger maxBlock2
  if (requestedBlockOption.size > maxBlock2) 
    requestedBlockOption.size = maxBlock2

  // block number should have limit 
  totalBlock = Math.ceil(payload.length/requestedBlockOption.size)
  if (requestedBlockOption.num < totalBlock)
    isLastBlock = false
  else if (requestedBlockOption.num = totalBlock) 
    isLastBlock = true
  else
    return res.end(500)

  console.log('--------------------------')
  console.log('req block2 ', requestedBlockOption)
  // console.log(requestedBlockOption)

  var block2 = _createBlock(requestedBlockOption, isLastBlock)
  console.log('return block2 = ', block2)
  res.setOption('Block2', block2)
  res.setOption('ETag', '123456')
  res.setOption('Content-Format', 'application/json')
  res.end(payload.slice((requestedBlockOption.num)*requestedBlockOption.size, (requestedBlockOption.num+1)*requestedBlockOption.size))
})

// the default CoAP port is 5683
server.listen(function() {
  var req = coap.request('coap://localhost/Matteo')
  // test early negotiation
  req.setOption('Block2', new Buffer([0x06])) // block size of 1024
  // test later negotiation (?)
  req.on('response', function(res) {
    // console.log(res)
    // console.log('receive')
    // res.pipe(process.stdout)
    // console.log('--------------')
    // console.log(payload.toString())
    // console.log('--------------')
    console.log('result: ', res.payload.toString() == payload.toString())
    res.on('end', function() {
      process.exit(0)
    })
  })

  req.end()
})

function _createBlock(requestedBlock, isLastBlock) {
  var byte
  var szx = Math.log(requestedBlock.size)/Math.log(2) - 4
  console.log(isLastBlock)
  var m = ((isLastBlock==true)?0:1)
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
    throw new Error('too big request')
  }

  // console.log([byte, extraNum])
  return (extraNum)? Buffer.concat([extraNum, new Buffer([byte])]):new Buffer([byte])
}

function _parseBlock2(options) {
  for (var i in options) {
    if (options[i].name == 'Block2') {
      var block2Value = options[i].value
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
        throw new Error('Too long block2 option size: '+block2Value.length)
      }
      // limit value of size is 1024 (2**(6+4))
      if (block2Value.slice(-1)[0] == 7) {
        throw new Error('Block size should not bigger than 1024')
      }
      return {
        moreBlock2: (block2Value.slice(-1)[0] & (0x01<<3))? true:false,
        num: num,
        size: Math.pow(2, (block2Value.slice(-1)[0] & 0x07)+4)
      }
    }
  }
  return null;
}
