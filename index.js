
const optionsConv     = require('./lib/option_converter')
    , Server          = require('./lib/server')
    , Agent           = require('./lib/agent')

module.exports.request = function(url) {
  var agent, req, closeAtEnd = !!url.agent

  if (url.agent)
    agent = url.agent
  else
    agent = new Agent()

  return agent.request(url)
}

module.exports.createServer = Server

module.exports.Agent = Agent

module.exports.registerOption = optionsConv.registerOption
module.exports.registerFormat = optionsConv.registerFormat
