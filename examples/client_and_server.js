const coap        = require('../') // or coap

coap.createServer(function(req, res) {
  res.end('Hello ' + req.url.split('/')[1] + '\n')
}).listen(function() {

  var req = coap.request('coap://localhost/Matteo')

  req.on('response', function(res) {
    res.pipe(process.stdout)
    res.on('end', function() {
      process.exit(0)
    })
  })

  req.end()
})
