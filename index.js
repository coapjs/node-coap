'use strict'
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

const optionsConv = require('./lib/option_converter')
const Server = require('./lib/server')
const Agent = require('./lib/agent')
const { parameters, refreshTiming, defaultTiming } = require('./lib/parameters')
const net = require('net')
const globalAgent = new Agent({ type: 'udp4' })
const globalAgentV6 = new Agent({ type: 'udp6' })

function _getHostname (url) {
    const hostname = url.hostname

    // Remove brackets from literal IPv6 addresses
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.substring(1, hostname.length - 1)
    }

    return hostname
}

function _getQueryParamsFromSearch (url) {
    if (url.search != null) {
        return url.search.substring(1)
    }
}

function _parseUrl (url) {
    const requestParams = {}

    const parsedUrl = new URL(url)

    requestParams.hostname = _getHostname(parsedUrl)
    requestParams.query = _getQueryParamsFromSearch(parsedUrl)
    requestParams.port = parsedUrl.port
    requestParams.pathname = parsedUrl.pathname

    return requestParams
}

module.exports.request = (requestParams) => {
    let agent

    if (typeof requestParams === 'string') {
        requestParams = _parseUrl(requestParams)
    }

    const ipv6 = net.isIPv6(requestParams.hostname || requestParams.host)

    if (requestParams.agent) {
        agent = requestParams.agent
    } else if (requestParams.agent === false && !ipv6) {
        agent = new Agent({ type: 'udp4' })
    } else if (requestParams.agent === false && ipv6) {
        agent = new Agent({ type: 'udp6' })
    } else if (ipv6) {
        agent = exports.globalAgentIPv6
    } else {
        agent = exports.globalAgent
    }

    return agent.request(requestParams)
}

module.exports.createServer = (options, listener) => {
    return new Server(options, listener)
}

module.exports.Agent = Agent
module.exports.globalAgent = globalAgent
module.exports.globalAgentIPv6 = globalAgentV6

module.exports.registerOption = optionsConv.registerOption
module.exports.registerFormat = optionsConv.registerFormat
module.exports.ignoreOption = optionsConv.ignoreOption

module.exports.parameters = parameters
module.exports.updateTiming = refreshTiming
module.exports.defaultTiming = defaultTiming
