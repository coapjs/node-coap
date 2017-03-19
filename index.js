/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

var optionsConv     = require('./lib/option_converter')
  , Server          = require('./lib/server')
  , Agent           = require('./lib/agent')
  , parameters      = require('./lib/parameters')
  , net             = require('net')
  , URL             = require('url')
  , globalAgent     = new Agent({ type: 'udp4' })
  , globalAgentV6   = new Agent({ type: 'udp6' })

module.exports.request = function(url) {
  var agent, req, ipv6

  if (typeof url === 'string')
    url = URL.parse(url)

  ipv6 = net.isIPv6(url.hostname || url.host)

  if (url.agent)
    agent = url.agent
  else if (url.agent === false && !ipv6)
    agent = new Agent({ type: 'udp4' })
  else if (url.agent === false && ipv6)
    agent = new Agent({ type: 'udp6' })
  else if (ipv6)
    agent = exports.globalAgentIPv6
  else
    agent = exports.globalAgent

  return agent.request(url)
}

module.exports.createServer = Server

module.exports.Agent = Agent
module.exports.globalAgent = globalAgent
module.exports.globalAgentIPv6 = globalAgentV6

module.exports.registerOption = optionsConv.registerOption
module.exports.registerFormat = optionsConv.registerFormat
module.exports.ignoreOption = optionsConv.ignoreOption

module.exports.parameters = parameters
module.exports.updateTiming = parameters.refreshTiming
module.exports.defaultTiming = parameters.defaultTiming
