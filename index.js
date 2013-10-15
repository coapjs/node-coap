
const optionsConv     = require('./lib/option_converter')
    , Server          = require('./lib/server')
    , Agent           = require('./lib/agent')
    , globalAgent     = new Agent()

module.exports.request = function(url) {
  var agent, req

  if (url.agent)
    agent = url.agent
  else if (url.agent === false)
    agent = new Agent()
  else
    agent = globalAgent

  return agent.request(url)
}

module.exports.createServer = Server

module.exports.Agent = Agent
module.exports.globalAgent = globalAgent

module.exports.registerOption = optionsConv.registerOption
module.exports.registerFormat = optionsConv.registerFormat
