"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bl_1 = __importDefault(require("bl"));
const helpers_1 = require("./helpers");
class OutgoingMessage extends bl_1.default {
    constructor(request, send) {
        super();
        this._packet = {
            messageId: request.messageId,
            token: request.token,
            options: [],
            confirmable: false,
            ack: false,
            reset: false
        };
        if (request.confirmable === true) {
            // replying in piggyback
            this._packet.ack = true;
            this._ackTimer = setTimeout(() => {
                send(this, (0, helpers_1.genAck)(request));
                // we are no more in piggyback
                this._packet.confirmable = true;
                this._packet.ack = false;
                // we need a new messageId for the CON
                // reply
                delete this._packet.messageId;
                this._ackTimer = null;
            }, request.piggybackReplyMs);
        }
        this._send = send;
        this.statusCode = '';
        this.code = '';
    }
    end(a, b) {
        super.end(a, b);
        const packet = this._packet;
        const code = this.code !== '' ? this.code : this.statusCode;
        packet.code = (0, helpers_1.toCode)(code);
        packet.payload = this;
        if (this._ackTimer != null) {
            clearTimeout(this._ackTimer);
        }
        this._send(this, packet);
        // easy clean up after generating the packet
        delete this._packet.payload;
        return this;
    }
    reset() {
        super.end();
        const packet = this._packet;
        packet.code = '0.00';
        packet.payload = Buffer.alloc(0);
        packet.reset = true;
        packet.ack = false;
        packet.token = Buffer.alloc(0);
        if (this._ackTimer != null) {
            clearTimeout(this._ackTimer);
        }
        this._send(this, packet);
        // easy clean up after generating the packet
        delete this._packet.payload;
        return this;
    }
    /**
     * @param {OptionName | number} code
     * @param {Partial<Record<OptionName, OptionValue>>} headers
     */
    writeHead(code, headers) {
        const packet = this._packet;
        packet.code = String(code).replace(/(^\d[^.])/, '$1.');
        for (const [header, value] of Object.entries(headers)) {
            this.setOption(header, value);
        }
    }
    setOption(name, values) {
        (0, helpers_1.setOption)(this._packet, name, values);
        return this;
    }
    setHeader(name, values) {
        return this.setOption(name, values);
    }
}
exports.default = OutgoingMessage;
//# sourceMappingURL=outgoing_message.js.map