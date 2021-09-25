const coap = require('../') // or coap

coap.createServer((req, res) => {
    res.end('Hello ' + req.url.split('/')[1] + '\n')
}).listen(() => {
    const req = coap.request('coap://localhost/Matteo')

    req.on('response', (res) => {
        res.pipe(process.stdout)
        res.on('end', () => {
            process.exit(0)
        })
    })

    req.end()
})
