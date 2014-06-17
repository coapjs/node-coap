const coap        = require('../') // or coap
		, url 				= require('url')

coap.createServer(function(req, res) {
	var path = url.parse(req.url)
	var time = parseInt(path.search.split('=')[1])
	var pathname = path.pathname.split('/')[1]

  res.end(new Array(time+1).join(pathname+' '))

}).listen(function() {
  var req = coap.request('coap://localhost/repeat-me?t=400')

  // edit this to adjust max packet
  req.setOption('Block2', new Buffer([0x2]))

  req.on('response', function(res) {
    res.pipe(process.stdout)
    res.on('end', function() {
      process.exit(0)
    })
  })

  req.end()
})
