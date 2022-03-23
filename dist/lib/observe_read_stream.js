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
const incoming_message_1 = __importDefault(require("./incoming_message"));
const helpers_1 = require("./helpers");
class ObserveReadStream extends incoming_message_1.default {
    constructor(packet, rsinfo, outSocket) {
        super(packet, rsinfo, outSocket, { objectMode: true });
        this._lastId = undefined;
        this._lastTime = 0;
        this._disableFiltering = false;
        this.append(packet, true);
    }
    append(packet, firstPacket) {
        if (!this.readable) {
            return;
        }
        if (!firstPacket) {
            (0, helpers_1.packetToMessage)(this, packet);
        }
        /*
        if (typeof this.headers.Observe === 'string') {
            this.headers.Observe = parseInt(this.headers.Observe, 10);
        }
        if (typeof this.headers.Observe !== 'number') {
            return
        }
        */
        // First notification
        if (this._lastId === undefined) {
            // @ts-expect-error
            this._lastId = this.headers.Observe - 1;
        }
        // @ts-expect-error
        const dseq = (this.headers.Observe - this._lastId) & 0xffffff;
        const dtime = Date.now() - this._lastTime;
        if (this._disableFiltering || (dseq > 0 && dseq < (1 << 23)) || dtime > 128 * 1000) {
            // @ts-expect-error
            this._lastId = this.headers.Observe;
            this._lastTime = Date.now();
            this.push(packet.payload);
        }
    }
    close(eagerDeregister) {
        this.push(null);
        this.emit('close');
        if (eagerDeregister === true) {
            this.emit('deregister');
        }
    }
    // nothing to do, data will be pushed from the server
    _read() { }
}
exports.default = ObserveReadStream;
//# sourceMappingURL=observe_read_stream.js.map