var LRU = require('lru-cache')
var parameters = require('./parameters')

var cache;
var init = false;

module.exports.init = function(options) {
  // We use an LRU cache for the responses to avoid
  // DDOS problems.
  // max packet size is 1280
  // 32 MB / 1280 = 26214
  // The max lifetime is roughly 200s per packet.
  // Which gave us 131 packets/second guarantee
  var customCacheSize = 32768 * 1024;
  if (options && options.cacheSize) {
    customCacheSize = options.cacheSize
  }

  cache = LRU({
      max: customCacheSize
    , length: function(n) { return n.length }
    , maxAge: parameters.exchangeLifetime
    , dispose:  function(key, value) {
                  if (value.sender)
                    value.sender.reset()
                }
  })
  init = true;
}

module.exports.reset = function() {
  if (!init) return
  return cache.reset();
}

module.exports.get = function(key) {
  if (!init) return
  return cache.get(key);
}

module.exports.set = function(key, value) {
  if (!init) return
  return cache.set(key, value);
}

module.exports.peek = function(key) {
  if (!init) return
  return cache.peek(key);
}

module.exports.del = function(key) {
  if (!init) return
  return cache.del(key);
}

module.exports.itemCount = function() {
  if (!init) return
  return cache.itemCount;
}
