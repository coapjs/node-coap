const coap        = require('../') // or coap

coap.createServer(function(req, res) {
  res.end('Hello ' + req.url.split('/')[1] + '\nMessage payload:\n'+req.payload+'\n')
}).listen(function() {

  var req = coap.request('coap://localhost/Matteo')
  
  var payload = {
    title: 'this is a test payload',
    body: 'containing nothing useful'
  }
  
  req.write(JSON.stringify(payload));
  
  req.on('response', function(res) {
    res.pipe(process.stdout)
    res.on('end', function() {
      process.exit(0)
    })
  })

  req.end()
})
