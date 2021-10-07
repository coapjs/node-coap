const coap = require('../') // or coap
const bl = require('bl')

coap.createServer((req, res) => {
    if (req.headers.Accept !== 'application/json') {
        res.code = '4.06'
        return res.end()
    }

    res.setOption('Content-Format', 'application/json')

    res.end(JSON.stringify({ hello: 'world' }))
}).listen(() => {
    coap
        .request({
            pathname: '/Matteo',
            options: {
                Accept: 'application/json'
            }
        })
        .on('response', (res) => {
            console.log('response code', res.code)
            if (res.code !== '2.05') {
                return process.exit(1)
            }

            res.pipe(bl((err, data) => {
                if (err != null) {
                    process.exit(1)
                } else {
                    const json = JSON.parse(data)
                    console.log(json)
                    process.exit(0)
                }
            }))
        })
        .end()
})
