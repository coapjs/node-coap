"use strict";
/*
* Copyright (c) 2013-2021 node-coap contributors.
*
* node-coap is licensed under an MIT +no-false-attribs license.
* All rights not explicitly granted in the MIT license are reserved.
* See the included LICENSE file for more details.
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTiming = exports.refreshTiming = exports.parameters = void 0;
/**
 * Timeout in seconds for a response to a confirmable request.
 */
const ACK_TIMEOUT = 2;
/**
  * Used to calculate upper bound for timeout.
  */
const ACK_RANDOM_FACTOR = 1.5;
/**
  * Maximum number of retransmissions for a confirmable request.
  * Defaults to 4.
  */
const MAX_RETRANSMIT = 4;
/**
  * Allowed number of simultaneous outstanding interactions.
  * Defaults to 1.
  *
  */
const NSTART = 1;
/**
  * Maximum timespan (in seconds) that is waited by default before
  * responding to a multicast request. Defaults to 5 seconds.
  *
  * The exact point of time for responding is chosen randomly.
  */
const DEFAULT_LEISURE = 5;
/**
  * Indicates the average data rate (in bytes) that must not be exceeded
  * by a CoAP endpoint in sending to a peer endpoint that does not respond.
  *
  * Defaults to 1 byte / second.
  */
const PROBING_RATE = 1;
/**
  * Maximum time from the first transmission of a Confirmable message
  * to its last retransmission.
  *
  * It is calculated as follows:
  *
  * ```
  * ACK_TIMEOUT * ((2 ** MAX_RETRANSMIT) - 1) * ACK_RANDOM_FACTOR
  * ```
  */
const MAX_TRANSMIT_SPAN = 45;
/**
  * MAX_TRANSMIT_WAIT is the maximum time (in seconds) from the first
  * transmission of a Confirmable message to the time when the sender
  * gives up on receiving an acknowledgement or reset.
  *
  * It is calculated as follows:
  *
  * ```
  * ACK_TIMEOUT * ((2 ** (MAX_RETRANSMIT + 1)) - 1) * ACK_RANDOM_FACTOR
  * ```
  */
const MAX_TRANSMIT_WAIT = 93;
/**
 * Maximum time (in seconds) a datagram is expected to
 * take from the start of its transmission to the
 * completion of its reception.
 *
 * Arbitrarily set to 100 seconds as the default value.
 */
const MAX_LATENCY = 100;
/**
 * The time a node takes to turn around a Confirmable message
 * into an acknowledgement. Uses `ACK_TIMEOUT` (two seconds) as
 * the default value.
 */
const PROCESSING_DELAY = 2;
/**
 * Maximum round-trip time. Defaults to 202 seconds.
 *
 * It is calculated as follows:
 *
 * ```
 * (2 * MAX_LATENCY) + PROCESSING_DELAY
 * ```
 */
const MAX_RTT = 202;
/**
 * Time from starting to send a confirmable message to the time when an
 * acknowledgement is no longer expected, i.e. message layer information
 * about the message exchange can be purged. Defaults to 247 seconds.
 *
 * It is calculated as follows:
 *
 * ```
 * MAX_TRANSMIT_SPAN + (2 * MAX_LATENCY) + PROCESSING_DELAY
 * ```
 */
const EXCHANGE_LIFETIME = 247;
/**
 * Time from sending a Non-confirmable message to
 * the time its Message ID can be safely reused.
 * Defaults to 145 seconds.
 *
 * It is calculated as follows:
 *
 * ```
 * MAX_TRANSMIT_SPAN + MAX_LATENCY
 * ```
 */
const NON_LIFETIME = 145;
/**
 * Default UDP port used by CoAP.
 */
const COAP_PORT = 5683;
/**
 * Default max packet size based on IP MTU.
 */
const IP_MTU = 1280;
/* Custom default parameters */
/**
 * Indicates if ACK messages should be sent for non-confirmable packages.
 *
 * `true`: always send CoAP ACK messages, even for non confirmabe packets.
 * `false`: only send CoAP ACK messages for confirmabe packets.
 */
const sendAcksForNonConfirmablePackets = true;
/**
 * Number of milliseconds to wait for a piggyback response.
 */
const piggybackReplyMs = 50;
/**
 * LRU prune timer period.
 *
 * In order to reduce unnecessary heap usage on low-traffic servers the
 * LRU cache is periodically pruned to remove old, expired packets. This
 * is a fairly low-intensity task, but the period can be altered here
 * or the timer disabled by setting the value to zero.
 * By default the value is set to `0.5 * EXCHANGE_LIFETIME` (~120s).
 */
const pruneTimerPeriod = 0.5 * EXCHANGE_LIFETIME;
const p = {
    ackTimeout: ACK_TIMEOUT,
    ackRandomFactor: ACK_RANDOM_FACTOR,
    maxRetransmit: MAX_RETRANSMIT,
    nstart: NSTART,
    defaultLeisure: DEFAULT_LEISURE,
    probingRate: PROBING_RATE,
    exchangeLifetime: EXCHANGE_LIFETIME,
    maxRTT: MAX_RTT,
    maxTransmitSpan: MAX_TRANSMIT_SPAN,
    maxTransmitWait: MAX_TRANSMIT_WAIT,
    processingDelay: PROCESSING_DELAY,
    maxLatency: MAX_LATENCY,
    nonLifetime: NON_LIFETIME,
    coapPort: COAP_PORT,
    maxPacketSize: IP_MTU,
    sendAcksForNonConfirmablePackets,
    piggybackReplyMs,
    pruneTimerPeriod
};
exports.parameters = p;
const defaultParameters = JSON.parse(JSON.stringify(p));
function refreshTiming(values) {
    for (const key in values) {
        if (p[key] != null) {
            p[key] = values[key];
        }
    }
    p.maxTransmitSpan = p.ackTimeout * ((Math.pow(2, p.maxRetransmit)) - 1) * p.ackRandomFactor;
    p.maxTransmitWait = p.ackTimeout * (Math.pow(2, p.maxRetransmit + 1) - 1) * p.ackRandomFactor;
    p.processingDelay = p.ackTimeout;
    p.maxRTT = 2 * p.maxLatency + p.processingDelay;
    p.exchangeLifetime = p.maxTransmitSpan + p.maxRTT;
    if (values != null && typeof values.pruneTimerPeriod === 'number') {
        p.pruneTimerPeriod = values.pruneTimerPeriod;
    }
    else {
        p.pruneTimerPeriod = (0.5 * p.exchangeLifetime);
    }
}
exports.refreshTiming = refreshTiming;
function defaultTiming() {
    refreshTiming(defaultParameters);
}
exports.defaultTiming = defaultTiming;
p.defaultTiming = defaultTiming;
p.refreshTiming = refreshTiming;
//# sourceMappingURL=parameters.js.map