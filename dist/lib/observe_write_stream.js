"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
const helpers_1 = require("./helpers");
class ObserveWriteStream extends stream_1.Writable {
    constructor(request, send) {
        super();
        this._packet = {
            token: request.token,
            messageId: request.messageId,
            options: [],
            confirmable: false,
            ack: request.confirmable,
            reset: false
        };
        this._request = request;
        this._send = send;
        this._counter = 0;
        this.on('finish', () => {
            if (this._counter === 0) { // we have sent no messages
                this._doSend();
            }
        });
    }
    _write(data, encoding, done) {
        this.setOption('Observe', ++this._counter);
        if (this._counter === 16777215) {
            this._counter = 1;
        }
        this._doSend(data);
        done();
    }
    _doSend(data) {
        const packet = this._packet;
        packet.code = this.statusCode;
        packet.payload = data;
        this._send(this, packet);
        this._packet.confirmable = this._request.confirmable;
        this._packet.ack = this._request.confirmable === false;
        delete this._packet.messageId;
        delete this._packet.payload;
    }
    reset() {
        const packet = this._packet;
        packet.code = '0.00';
        packet.payload = Buffer.alloc(0);
        packet.reset = true;
        packet.ack = false;
        packet.token = Buffer.alloc(0);
        this._send(this, packet);
        this._packet.confirmable = this._request.confirmable;
        delete this._packet.messageId;
        delete this._packet.payload;
    }
    setOption(name, values) {
        (0, helpers_1.setOption)(this._packet, name, values);
        return this;
    }
    setHeader(name, values) {
        return this.setOption(name, values);
    }
}
exports.default = ObserveWriteStream;
//# sourceMappingURL=observe_write_stream.js.map