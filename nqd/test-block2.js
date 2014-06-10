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
    , payload     = new Buffer(100000)
    // , payload     = new Buffer("Centre-right leaders from Sweden, Germany, Britain and the Netherlands are meeting near Stockholm to try to reach a consensus on European reform. The controversial question of who is to head the European Commission is likely to be discussed, but not officially. UK PM David Cameron is expected to try to get leaders on-side to block Jean-Claude Juncker taking the job. Continue reading the main story “ Start Quote We dislike the idea of presenting front-runners from the different parties because we think that twists the balance between the institutions and the Lisbon treaty” Fredrik Reinfeldt Swedish Prime Minister It sets him against German Chancellor Angela Merkel, who publicly supports the ex-Luxembourg leaders appointment. EU leaders have traditionally named the Commission head on their own, but new rules mean they now have to take into account the results of the European Parliament elections. The European People's Party (EPP) - the largest centre-right grouping in the parliament, of which Mr Juncker is a member - won the highest number of seats in May's polls, and he has argued that gives him the mandate. But observers say neither he nor any other candidate has managed to obtain a majority so far. Some EU leaders, including Mr Cameron, insist that the Commission's priorities need to be re-defined first before an appropriate candidate is chosen. Commission president is the most powerful job in Brussels, shaping EU policy in key areas such as economic reform, immigration and ties with other global powers. 'Stitch-up'Few details from the mini-summit in Harpsund have emerged. However, job creation, institutional changes in the EU and structural reforms to boost EU competitiveness were said to be high on the agenda. The UK, Sweden and the Netherlands are leading a campaign to block Mr Juncker's candidacy, which has the support of the EPP.")

const maxBlock2   = 16
var totalBlock    = Math.ceil(payload.length/maxBlock2)
var numberBlock   = 0 
var isLastBlock   = false


server.on('request', function(req, res) {
  if (++numberBlock == totalBlock) 
    isLastBlock = true

  var requestedBlockOption = _parseBlock2(req.options) 
  if (!requestedBlockOption) requestedBlockOption = {
      size: maxBlock2,
      moreBlock2: 1,
      num: 0
    }
  console.log('--------------------------')
  console.log('req block2 ', requestedBlockOption)
  // console.log(requestedBlockOption)

  var block2 = _createBlock(requestedBlockOption, isLastBlock)
  console.log('return block2 = ', block2)
  res.setOption('Block2', block2)
  res.end(payload.slice((requestedBlockOption.num)*maxBlock2, (requestedBlockOption.num+1)*maxBlock2))
})

// the default CoAP port is 5683
server.listen(function() {
  var req = coap.request('coap://localhost/Matteo')
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
  var m = (isLastBlock)?0:1
  var num = requestedBlock.num
  var extraNum

  byte = 0
  byte |= szx
  byte |= m << 3
  byte |= (num&0xf) <<4

  // total num occupy up to 5 octets
  // num share the higher octet of first byte, and (may) take more 2 bytes for the rest 4 octets
  if (num <=0xfff && num > 0xf) {
    extraNum = new Buffer([num/16])
  } else if (num <=0xfffff) {
    extraNum = new Buffer(2)
    extraNum.writeUInt16BE(num>>4,0)
  } else {
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
      return {
        moreBlock2: (block2Value.slice(-1)[0] & (0x01<<3))? true:false,
        num: num,
        size: Math.pow(2, (block2Value.slice(-1)[0] & 0x07)+4)
      }
    }
  }
  return null;
}
