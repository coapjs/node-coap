const coap = require('../') // or coap

coap.createServer(function(req, res) {
  //simulate delayed response
  setTimeout(function(){
    res.setOption('Block2', new Buffer([2]));
    res.end('Hello ' + req.url.split('/')[1] + '\nMessage payload:\n'+req.payload+'\n')
  }, 1500)
}).listen(function() {


  var coapConnection = {
    host: 'localhost',
    pathname: '/yo',
    method: 'GET',
    confirmable: true
  }
  var req = coap.request(coapConnection)
  req.write('<yo><randomnameofaxmlpayload1><value>182374238472637846278346827346827346827346827346827346782346287346872346283746283462837462873468273462873462387462387</value></randomnameofaxmlpayload1><randomnameofaxmlpayload2><value>182374238472637846278346827346827346827346827346827346782346287346872346283746283462837462873468273462873462387462387</value></randomnameofaxmlpayload2></yo>')

  req.on('response', function(res) {
    res.pipe(process.stdout)
    res.on('end', function() {
      process.exit(0)
    })
  })

  req.end()
})
