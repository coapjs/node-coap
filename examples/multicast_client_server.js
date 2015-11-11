const coap  = require('../') // or coap
	, server = coap.createServer({
		multicastAddress: '224.0.1.186'
	})
	, server2 = coap.createServer({
		multicastAddress: '224.0.1.186'
	})
    , port = 5683

// Create servers
server.listen(5683, function() {
	console.log('Server 1 is listening')
})

server2.listen(5683, function() {
	console.log('Server 2 is listening')
})

server.on('request', function(msg, res) {
	console.log('Server 1 has received message')
	res.end('Ok')

	server.close();
})

server2.on('request', function(msg, res) {
	console.log('Server 2 has received message')
	res.end('Ok')

	server2.close();
})

// Send multicast message
var req = coap.request({
	host: '224.0.1.186'
	, multicast: true
	, multicastTimeout: 2000
}).end()
