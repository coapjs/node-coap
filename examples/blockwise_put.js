const coap = require('../')

const bufferSize = 25000
const testBuffer = Buffer.alloc(bufferSize)
const containedData = 'This is a test buffer with a lot of nothing and a bit of something'
testBuffer.fill('X', 'utf-8')
testBuffer.write(containedData, 'utf-8')
testBuffer.write(containedData, testBuffer.length - containedData.length, containedData.length, 'utf-8')

/**
 * Formula for chunk/block sizes is:
 * ByteSize = 2^(chunkSize+4)
 * Hence
 *   chunkSize = 0  =>  ByteSize = 16
 *   chunkSize = 6  =>  ByteSize = 1024
 *   chunkSize = 7  =>  Reserved. Don't do it.
 */

/**
 * Tests the GET Block2 method transfer. Sends data in 1024 byte chunks
*/
function TestGet () { // eslint-disable-line no-unused-vars
    coap.createServer((req, res) => {
    // Respond with the test buffer.
        res.end(testBuffer)
    }).listen(() => {
    // GET Request resources /test with block transfer with 1024 byte size
        const req = coap.request('/test')

        req.setOption('Block2', Buffer.from(0x6))

        req.on('response', (res) => {
            console.log('Client Received ' + res.payload.length + ' bytes')
            process.exit(0)
        })

        req.end()
    })
}
/**
 * Tests the PUT Block1 method transfer. Sends data in 1024 byte chunks
*/
function TestPut () {
    coap.createServer((req, res) => {
        setTimeout(() => {
            console.log('Server Received ' + req.payload.length + ' bytes')
            console.log(req.payload.slice(0, containedData.length * 2).toString('utf-8'))
            console.log(req.payload.slice(-containedData.length).toString('utf-8'))
            console.log('Sending back pleasantries')
            res.statusCode = '2.04'
            res.end('Congratulations!')
            console.log('Sent back')
        }, 500)
    }).listen(() => {
        const request = coap.request({
            hostname: this.hostname,
            port: this.port,
            pathname: '/test',
            method: 'PUT'
        })
        request.setOption('Block1', Buffer.alloc(0x6))

        request.on('response', (res) => {
            console.log('Client Received Response: ' + res.payload.toString('utf-8'))
            console.log('Client Received Response: ' + res.code)
            process.exit(0)
        })
        console.log('Sending large data from client...')
        request.end(testBuffer)
        console.log('Sent to server')
    })
}
/**
 * Creates a CoAP server which listens for connections from outside.
 * Start up an external CoAP client and try it out.
*/
function TestServer () { // eslint-disable-line no-unused-vars
    coap.createServer((req, res) => {
        console.log('Got request. Waiting 500ms')
        setTimeout(() => {
            res.setOption('Block2', Buffer.from(0x6))
            console.log('Sending Back Test Buffer')
            res.end(testBuffer)
            console.log('Sent Back')
        }, 500)
    }).listen()
}

/**
 * Connects to another end point located on this machine. Setup a coap server somewhere else and try it out.
*/
function TestClient () { // eslint-disable-line no-unused-vars
    const request = coap.request({
        hostname: 'localhost',
        port: 5683,
        pathname: '/test',
        method: 'PUT'
    })
    request.setOption('Block1', Buffer.from(0))

    request.on('response', (res) => {
        console.log('Client Received ' + res.payload.length + ' bytes in response')
        process.exit(0)
    })

    console.log('Sending ' + testBuffer.length + ' bytes from client...')
    request.end(testBuffer)
    console.log('Sent to server')
}
// Choose yer poison

TestPut()
// TestGet()
// TestServer()
// TestClient()
