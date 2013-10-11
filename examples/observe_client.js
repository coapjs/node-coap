const coap  = require('../') // or coap
    , req   = coap.request({
                observe: true
              })

req.on('response', function(res) {
  res.pipe(process.stdout)
})

req.end()
