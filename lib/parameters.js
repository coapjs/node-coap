/*
 * Copyright (c) 2013-2015 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

// CoAP parameters
var p = {
  // seconds
  ackTimeout: 2,
  ackRandomFactor: 1.5,
  maxRetransmit: 4,
  nstart: 1,
  defaultLeisure: 5,

  // byte/seconds
  probingRate: 1,

  // MAX_LATENCY is the maximum time a datagram is expected to take
  // from the start of its transmission to the completion of its
  // reception.
  maxLatency: 100 // seconds
}
// MAX_TRANSMIT_SPAN is the maximum time from the first transmission
// of a Confirmable message to its last retransmission.
p.maxTransmitSpan = p.ackTimeout * ((Math.pow(2, p.maxRetransmit)) - 1) * p.ackRandomFactor

// MAX_TRANSMIT_WAIT is the maximum time from the first transmission
// of a Confirmable message to the time when the sender gives up on
// receiving an acknowledgement or reset.
p.maxTransmitWait = p.ackTimeout * (Math.pow(2, p.maxRetransmit + 1) - 1) * p.ackRandomFactor

// PROCESSING_DELAY is the time a node takes to turn around a
// Confirmable message into an acknowledgement.
p.processingDelay = p.ackTimeout

// MAX_RTT is the maximum round-trip time
p.maxRTT = 2 * p.maxLatency + p.processingDelay

//  EXCHANGE_LIFETIME is the time from starting to send a Confirmable
//  message to the time when an acknowledgement is no longer expected,
//  i.e.  message layer information about the message exchange can be
//  purged
p.exchangeLifetime = p.maxTransmitSpan + p.maxRTT

// default port for CoAP
p.coapPort = 5683

// default max packet size
p.maxPacketSize = 1280

module.exports = p
