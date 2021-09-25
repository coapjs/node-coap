const coap = require('../') // or coap
const req = coap.request('coap://localhost/Matteo')

req.on('response', (res) => {
    res.pipe(process.stdout)
})

req.end()
