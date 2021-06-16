const coap = require('../') // or coap
const url = require('url')

coap.createServer(function (req, res) {
  const path = url.parse(req.url) // eslint-disable-line node/no-deprecated-api
  const time = parseInt(path.search.split('=')[1])
  const pathname = path.pathname.split('/')[1]

  res.end(new Array(time + 1).join(pathname + ' '))
}).listen(function () {
  const req = coap.request('coap://localhost/repeat-me?t=400')

  // edit this to adjust max packet
  req.setOption('Block2', Buffer.of(0x2))

  req.on('response', function (res) {
    res.pipe(process.stdout)
    res.on('end', function () {
      process.exit(0)
    })
  })

  req.end()
})
