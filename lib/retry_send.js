
const backoff         = require('backoff')
    , parameters      = require('./parameters')
    , util            = require('util')
    , EventEmitter    = require('events').EventEmitter

function RetrySend(sock, port, host) {
  if (!(this instanceof RetrySend))
    return new RetrySend(port, host)

  var that    = this

  this._sock  = sock

  this._port  = port || parameters.coapPort

  this._host  = host

  this._bOff  = backoff.exponential({
                    randomisationFactor: 0.2
                  , initialDelay: 1222
                  , maxDelay: parameters.maxTransmitSpan * 1000
                })

  this._bOff.failAfter(parameters.maxRetransmit - 1)

  this._bOff.on('ready', function() {
    that._send()
  })
}

util.inherits(RetrySend, EventEmitter)

RetrySend.prototype._send = function() {
  this._sock.send(this._message, 0, this._message.length,
                  this._port, this._host)

  this._bOff.backoff()
  this.emit('sent', this._message)
}

RetrySend.prototype.send = function(message) {
  var that = this

  this._message = message
  this._send()

  this._timer = setTimeout(function() {
    var err  = new Error('No reply in ' + parameters.exchangeLifetime + 's')
    that.emit('error', err)
  }, parameters.exchangeLifetime * 1000)
}

RetrySend.prototype.reset = function() {
  this._bOff.reset()
  clearTimeout(this._timer)
}

module.exports = RetrySend
