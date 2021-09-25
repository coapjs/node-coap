const coap = require('../') // or coap
const server = coap.createServer({
    multicastAddress: '224.0.1.186'
})
const server2 = coap.createServer({
    multicastAddress: '224.0.1.186'
})

// Create servers
server.listen(5683, () => {
    console.log('Server 1 is listening')
})

server2.listen(5683, () => {
    console.log('Server 2 is listening')
})

server.on('request', (msg, res) => {
    console.log('Server 1 has received message')
    res.end('Ok')

    server.close()
})

server2.on('request', (msg, res) => {
    console.log('Server 2 has received message')
    res.end('Ok')

    server2.close()
})

// Send multicast message
coap.request({
    host: '224.0.1.186',
    multicast: true,
    multicastTimeout: 2000
}).end()
