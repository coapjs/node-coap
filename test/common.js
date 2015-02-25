/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

global.expect = require("chai").expect

var portCounter = 9042
global.nextPort = function() {
  return ++portCounter
}

