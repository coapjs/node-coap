
global.expect = require("chai").expect

var portCounter = 9042
global.nextPort = function() {
  return ++portCounter
}

