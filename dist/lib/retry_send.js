"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const coap_packet_1 = require("coap-packet");
const parameters_1 = require("./parameters");
class RetrySendError extends Error {
    constructor(retransmitTimeout) {
        super(`No reply in ${retransmitTimeout} seconds.`);
        this.retransmitTimeout = retransmitTimeout;
    }
}
class RetrySend extends events_1.EventEmitter {
    constructor(sock, port, host, maxRetransmit) {
        super();
        this._sock = sock;
        this._port = port !== null && port !== void 0 ? port : parameters_1.parameters.coapPort;
        this._host = host;
        this._maxRetransmit = maxRetransmit !== null && maxRetransmit !== void 0 ? maxRetransmit : parameters_1.parameters.maxRetransmit;
        this._sendAttemp = 0;
        this._lastMessageId = -1;
        this._currentTime = parameters_1.parameters.ackTimeout * (1 + (parameters_1.parameters.ackRandomFactor - 1) * Math.random()) * 1000;
        this._bOff = () => {
            this._currentTime = this._currentTime * 2;
            this._send();
        };
    }
    _send(avoidBackoff) {
        this._sock.send(this._message, 0, this._message.length, this._port, this._host, (err, bytes) => {
            this.emit('sent', err, bytes);
            if (err != null) {
                this.emit('error', err);
            }
        });
        const messageId = (0, coap_packet_1.parse)(this._message).messageId;
        if (messageId !== this._lastMessageId) {
            this._lastMessageId = messageId;
            this._sendAttemp = 0;
        }
        if (avoidBackoff !== true && ++this._sendAttemp <= this._maxRetransmit) {
            this._bOffTimer = setTimeout(this._bOff, this._currentTime);
        }
        this.emit('sending', this._message);
    }
    send(message, avoidBackoff) {
        this._message = message;
        this._send(avoidBackoff);
        const timeout = avoidBackoff === true ? parameters_1.parameters.maxRTT : parameters_1.parameters.exchangeLifetime;
        this._timer = setTimeout(() => {
            const err = new RetrySendError(timeout);
            if (avoidBackoff === false) {
                this.emit('error', err);
            }
            this.emit('timeout', err);
        }, timeout * 1000);
    }
    reset() {
        clearTimeout(this._timer);
        clearTimeout(this._bOffTimer);
    }
}
exports.default = RetrySend;
//# sourceMappingURL=retry_send.js.map