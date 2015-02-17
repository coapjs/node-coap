/*
 * Copyright (c) 2013-2014 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var coap      = require('../')
    , parse     = require('coap-packet').parse
    , generate  = require('coap-packet').generate
    , dgram     = require('dgram')
    , bl        = require('bl')
    , sinon     = require('sinon')
    , request   = coap.request

describe('Agent errors', function() {
    var server
        , port
        , agent

    beforeEach(function(done) {
        port = nextPort()
        agent = new coap.Agent()
        server = dgram.createSocket('udp4')
        server.bind(port, done)
    })

    afterEach(function() {
        server.close()
    })

    it('should close the agent on request error', function(done) {
        var req = request({
            host: 'www.unexistent.com'
            , port: port
            , agent: agent
        });

        req.on('error', function() {
            expect(req.sender._sock._receiving).to.eql(false)
            done()
        })

        req.end();
    })
})
