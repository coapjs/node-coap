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
  res.end(payload)
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


