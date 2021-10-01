/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

import {
    request,
    createServer,
    IncomingMessage,
    OutgoingMessage,
    globalAgent,
    Parameters,
    updateTiming,
    defaultTiming,
    CoapRequestParams,
    CoapServerOptions,
} from '../index'

const parameters: Parameters = {
    ackTimeout: 0,
    ackRandomFactor: 0,
    maxRetransmit: 0,
    maxLatency: 42,
    piggybackReplyMs: 2,
    coapPort: 3000,
    maxPacketSize: 25,
    sendAcksForNonConfirmablePackets: true,
}

updateTiming(parameters)
defaultTiming()

const requestOptions: CoapRequestParams = {
    host: 'Hostname will be used instead',
    hostname: 'localhost',
    port: 5683,
    method: 'GET',
    confirmable: true,
    observe: false,
    pathname: 'successful',
    query: '',
    options: {'Content-Format': 'application/json'},
    headers: {'Content-Format': 'options will be used instead'},
    agent: globalAgent,
    proxyUri: undefined,
    multicast: false,
    multicastTimeout: 20000,
    retrySend: 4,
}

const serverOptions: CoapServerOptions = {
    type: 'udp4',
    proxy: false,
    multicastAddress: undefined,
    multicastInterface: undefined,
    piggybackReplyMs: 50,
    sendAcksForNonConfirmablePackets: true,
    clientIdentifier: undefined,
    reuseAddr: true,
}

createServer(serverOptions, (req: IncomingMessage, res: OutgoingMessage) => {
    res.end('Test ' + req.url.split('/')[1] + '\n')
}).listen(() => {
    const req = request(requestOptions)

    // TODO: Type IncomingMessage does not work with pipe yet
    req.on('response', (res: any) => {
        res.pipe(process.stdout)
        res.on('end', () => {
            process.exit(0)
        })
    })

    req.end()
})
