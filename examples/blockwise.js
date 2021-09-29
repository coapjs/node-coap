const coap = require('../') // or coap

coap.createServer((req, res) => {
    // FIXME: This has became a bit ugly due to the
    //        replacement of the depracated url.parse
    //        with the URL constructor.
    //        This part of the exmample should be replaced
    //        once a nicer solution has been found.

    const splitURL = req.url.split('?')
    const time = parseInt(splitURL[1].split('=')[1])
    const pathname = splitURL[0].split('/')[1]

    res.end(new Array(time + 1).join(pathname + ' '))
}).listen(() => {
    const req = coap.request('coap://localhost/repeat-me?t=400')

    // edit this to adjust max packet
    req.setOption('Block2', Buffer.of(0x2))

    req.on('response', (res) => {
        res.pipe(process.stdout)
        res.on('end', () => {
            process.exit(0)
        })
    })

    req.end()
})
