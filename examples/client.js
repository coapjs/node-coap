const coap  = require('../') // or coap
    , req   = coap.request('coap://[aaaa::11:22ff:fe33:4403]/.well-known/core')

req.on('response', function(res) {
  res.pipe(process.stdout)
})

req.end()
