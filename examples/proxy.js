const coap = require('../')
const async = require('async')
const Readable = require('stream').Readable
const requestNumber = 10

let targetServer
let proxy

function formatTitle (msg) {
    return '\n\n' + msg + '\n-------------------------------------'
}

function requestHandler (req, res) {
    console.log('Target receives [%s] in port [8976] from port [%s]', req.payload, req.rsinfo.port)
    res.end('RES_' + req.payload)
}

function createTargetServer (callback) {
    console.log('Creating target server at port 8976')

    targetServer = coap.createServer(requestHandler)

    targetServer.listen(8976, '0.0.0.0', callback)
}

function proxyHandler (req, res) {
    console.log('Proxy handled [%s]', req.payload)
    res.end('RES_' + req.payload)
}

function createProxy (callback) {
    console.log('Creating proxy at port 6780')

    proxy = coap.createServer({ proxy: true }, proxyHandler)

    proxy.listen(6780, '0.0.0.0', callback)
}

function sendRequest (proxied) {
    return (n, callback) => {
        const req = {
            host: 'localhost',
            port: 8976,
            agent: false
        }
        const rs = new Readable()

        if (proxied) {
            req.port = 6780
            req.proxyUri = 'coap://localhost:8976'
        }

        const request = coap.request(req)

        request.on('response', (res) => {
            console.log('Client receives [%s] in port [%s] from [%s]', res.payload, res.outSocket.port, res.rsinfo.port)
            callback()
        })

        rs.push('MSG_' + n)
        rs.push(null)
        rs.pipe(request)
    }
}

function executeTest (proxied) {
    return (callback) => {
        if (proxied) {
            console.log(formatTitle('Executing tests with proxy'))
        } else {
            console.log(formatTitle('Executing tests without proxy'))
        }

        async.times(requestNumber, sendRequest(proxied), callback)
    }
}

function cleanUp (callback) {
    targetServer.close(() => {
        proxy.close(callback)
    })
}

function checkResults (callback) {
    console.log(formatTitle('Finish'))
}

async.series([
    createTargetServer,
    createProxy,
    executeTest(false),
    executeTest(true),
    cleanUp
], checkResults)
