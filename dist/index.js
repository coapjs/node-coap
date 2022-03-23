"use strict";
/*
 * Copyright (c) 2013 - 2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = exports.Agent = exports.ObserveWriteStream = exports.ObserveReadStream = exports.OutgoingMessage = exports.IncomingMessage = exports.ignoreOption = exports.registerFormat = exports.registerOption = exports.defaultTiming = exports.updateTiming = exports.parameters = exports.request = exports.createServer = exports.setGlobalAgentV6 = exports.setGlobalAgent = exports.globalAgentIPv6 = exports.globalAgent = void 0;
const agent_1 = __importDefault(require("./lib/agent"));
exports.Agent = agent_1.default;
const server_1 = __importDefault(require("./lib/server"));
exports.Server = server_1.default;
const incoming_message_1 = __importDefault(require("./lib/incoming_message"));
exports.IncomingMessage = incoming_message_1.default;
const outgoing_message_1 = __importDefault(require("./lib/outgoing_message"));
exports.OutgoingMessage = outgoing_message_1.default;
const observe_read_stream_1 = __importDefault(require("./lib/observe_read_stream"));
exports.ObserveReadStream = observe_read_stream_1.default;
const observe_write_stream_1 = __importDefault(require("./lib/observe_write_stream"));
exports.ObserveWriteStream = observe_write_stream_1.default;
const parameters_1 = require("./lib/parameters");
Object.defineProperty(exports, "parameters", { enumerable: true, get: function () { return parameters_1.parameters; } });
Object.defineProperty(exports, "updateTiming", { enumerable: true, get: function () { return parameters_1.refreshTiming; } });
Object.defineProperty(exports, "defaultTiming", { enumerable: true, get: function () { return parameters_1.defaultTiming; } });
const net_1 = require("net");
const option_converter_1 = require("./lib/option_converter");
Object.defineProperty(exports, "registerOption", { enumerable: true, get: function () { return option_converter_1.registerOption; } });
Object.defineProperty(exports, "registerFormat", { enumerable: true, get: function () { return option_converter_1.registerFormat; } });
Object.defineProperty(exports, "ignoreOption", { enumerable: true, get: function () { return option_converter_1.ignoreOption; } });
exports.globalAgent = new agent_1.default({ type: 'udp4' });
exports.globalAgentIPv6 = new agent_1.default({ type: 'udp6' });
function setGlobalAgent(agent) {
    exports.globalAgent = agent;
}
exports.setGlobalAgent = setGlobalAgent;
function setGlobalAgentV6(agent) {
    exports.globalAgentIPv6 = agent;
}
exports.setGlobalAgentV6 = setGlobalAgentV6;
function createServer(options, listener) {
    return new server_1.default(options, listener);
}
exports.createServer = createServer;
function _getHostname(url) {
    const hostname = url.hostname;
    // Remove brackets from literal IPv6 addresses
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.substring(1, hostname.length - 1);
    }
    return hostname;
}
function _getQueryParamsFromSearch(url) {
    if (url.search != null) {
        return url.search.substring(1);
    }
}
function _getPort(url) {
    if (url.port !== '') {
        return parseInt(url.port);
    }
    else {
        return parameters_1.parameters.coapPort;
    }
}
function _parseUrl(url) {
    const requestParams = {};
    const parsedUrl = new URL(url);
    requestParams.hostname = _getHostname(parsedUrl);
    requestParams.query = _getQueryParamsFromSearch(parsedUrl);
    requestParams.port = _getPort(parsedUrl);
    requestParams.pathname = parsedUrl.pathname;
    return requestParams;
}
function request(requestParams) {
    var _a, _b;
    let agent;
    if (typeof requestParams === 'string') {
        requestParams = _parseUrl(requestParams);
    }
    const ipv6 = (0, net_1.isIPv6)((_b = (_a = requestParams.hostname) !== null && _a !== void 0 ? _a : requestParams.host) !== null && _b !== void 0 ? _b : '');
    if (requestParams.agent != null && requestParams.agent !== false) {
        agent = requestParams.agent;
    }
    else if (requestParams.agent === false && !ipv6) {
        agent = new agent_1.default({ type: 'udp4' });
    }
    else if (requestParams.agent === false && ipv6) {
        agent = new agent_1.default({ type: 'udp6' });
    }
    else if (ipv6) {
        agent = exports.globalAgentIPv6;
    }
    else {
        agent = exports.globalAgent;
    }
    return agent.request(requestParams);
}
exports.request = request;
//# sourceMappingURL=index.js.map