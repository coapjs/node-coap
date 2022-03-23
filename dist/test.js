"use strict";
/*
 * Copyright (c) 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var index_1 = require("../index");
var parameters = {
    ackTimeout: 0,
    ackRandomFactor: 0,
    maxRetransmit: 0,
    maxLatency: 42,
    nstart: 9001,
    defaultLeisure: 20,
    probingRate: 3,
    piggybackReplyMs: 2,
    maxPacketSize: 25,
    sendAcksForNonConfirmablePackets: true,
};
(0, index_1.updateTiming)(parameters);
(0, index_1.defaultTiming)();
var requestOptions = {
    host: 'Hostname will be used instead',
    hostname: 'localhost',
    port: 5683,
    method: 'GET',
    confirmable: true,
    observe: false,
    pathname: 'successful',
    query: '',
    options: { 'Content-Format': 'application/json' },
    headers: { 'Content-Format': 'options will be used instead' },
    agent: index_1.globalAgent,
    proxyUri: undefined,
    multicast: false,
    multicastTimeout: 20000,
    retrySend: 4,
};
var serverOptions = {
    type: 'udp4',
    proxy: false,
    multicastAddress: undefined,
    multicastInterface: undefined,
    piggybackReplyMs: 50,
    sendAcksForNonConfirmablePackets: true,
    clientIdentifier: undefined,
    reuseAddr: true,
};
(0, index_1.createServer)(serverOptions, function (req, res) {
    res.end('Test ' + req.url.split('/')[1] + '\n');
}).listen(function () {
    var req = (0, index_1.request)(requestOptions);
    req.on('response', function (res) {
        res.pipe(process.stdout);
        res.on('end', function () {
            process.exit(0);
        });
    });
    req.end();
});
