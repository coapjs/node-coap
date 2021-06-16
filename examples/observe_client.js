const coap = require('../') // or coap
const req = coap.request({
  observe: true
})

req.on('response', function (res) {
  res.pipe(process.stdout)
})

req.end()
