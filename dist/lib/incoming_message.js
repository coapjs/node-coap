"use strict";
/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const readable_stream_1 = require("readable-stream");
const helpers_1 = require("./helpers");
class IncomingMessage extends readable_stream_1.Readable {
    constructor(packet, rsinfo, outSocket, options) {
        super(options);
        (0, helpers_1.packetToMessage)(this, packet);
        this.rsinfo = rsinfo;
        this.outSocket = outSocket;
        this._packet = packet;
        this._payloadIndex = 0;
    }
    _read(size) {
        const end = this._payloadIndex + size;
        const start = this._payloadIndex;
        const payload = this._packet.payload;
        let buf = null;
        if (payload != null && start < payload.length) {
            buf = payload.slice(start, end);
        }
        this._payloadIndex = end;
        this.push(buf);
    }
}
exports.default = IncomingMessage;
//# sourceMappingURL=incoming_message.js.map