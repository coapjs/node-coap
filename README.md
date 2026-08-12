node-coap
=====

[![Build Status](https://github.com/coapjs/node-coap/actions/workflows/npm-test.yml/badge.svg)](https://github.com/coapjs/node-coap/actions/workflows/npm-test.yml)
[![Coverage Status](https://coveralls.io/repos/github/mcollina/node-coap/badge.svg?branch=master)](https://coveralls.io/github/mcollina/node-coap?branch=master)
[![gitter](https://badges.gitter.im/mcollina/node-coap.png)](https://gitter.im/mcollina/node-coap)

__node-coap__ is a client and server library for CoAP modeled after the `http` module.

  * <a href="#intro">Introduction</a>
  * <a href="#install">Installation</a>
  * <a href="#basic">Basic Example</a>
  * <a href="#proxy">Proxy features</a>
  * <a href="#oscore">OSCORE (Object Security)</a>
  * <a href="#api">API</a>
  * <a href="#contributing">Contributing</a>
  * <a href="#license">License &amp; copyright</a>

[![NPM](https://nodei.co/npm/coap.png)](https://nodei.co/npm/coap/)

[![NPM](https://nodei.co/npm-dl/coap.png)](https://nodei.co/npm/coap/)

<a name="intro"></a>
## Introduction

What is CoAP?
> Constrained Application Protocol (CoAP) is a software protocol
intended to be used in very simple electronics devices that allows them
to communicate interactively over the Internet. -  Wikipedia

This library follows:
* [RFC 7252](https://datatracker.ietf.org/doc/html/rfc7252) for CoAP,
* [RFC 7641](https://datatracker.ietf.org/doc/html/rfc7641)
  for the observe specification,
* [RFC 7959](https://datatracker.ietf.org/doc/html/rfc7959) for
  the blockwise specification,
* [RFC 8132](https://datatracker.ietf.org/doc/html/rfc8132) for the PATCH, FETCH, and iPATCH methods,
* [RFC 8613](https://datatracker.ietf.org/doc/html/rfc8613) for OSCORE (Object Security for Constrained RESTful Environments) via the [coap-oscore](https://github.com/stoprocent/node-coap-oscore) package.

It does not parse the protocol but it use
[CoAP-packet](http://github.com/mcollina/coap-packet) instead.

If you need a command line interface for CoAP, check out
[coap-cli](http://github.com/mcollina/coap-cli).

**node-coap** is an **OPEN Open Source Project**, see the <a href="#contributing">Contributing</a> section to find out what this means.

The library is tested with LTS versions (currently 12, 14, 16 and 18).

<a name="install"></a>
## Installation

```
$ npm install coap --save
```

<a name="basic"></a>
## Basic Example

The following example opens a UDP server and sends a
CoAP message to it:

```js
const coap = require('coap')
const server = coap.createServer()

server.on('request', (req, res) => {
  res.end('Hello ' + req.url.split('/')[1] + '\n')
})

// the default CoAP port is 5683
server.listen(() => {
  const req = coap.request('coap://localhost/Matteo')

  req.on('response', (res) => {
    res.pipe(process.stdout)
    res.on('end', () => {
      process.exit(0)
    })
  })

  req.end()
})
```

or on IPv6:

```js
const coap = require('coap')
const server = coap.createServer({ type: 'udp6' })

server.on('request', (req, res) => {
  res.end('Hello ' + req.url.split('/')[1] + '\n')
})

// the default CoAP port is 5683
server.listen(() => {
  const req = coap.request('coap://[::1]/Matteo')

  req.on('response', (res) => {
    res.pipe(process.stdout)
    res.on('end', () => {
      process.exit(0)
    })
  })

  req.end()
})
```
<a name="proxy"></a>
## Proxy features
The library now comes with the ability to behave as a COAP proxy for other COAP endpoints. In order to activate the
proxy features, create the server with the `proxy` option activated.

A proxy-enabled service behaves as usual for all requests, except for those coming with the `Proxy-Uri` option. This
requests will be redirected to the URL specified in the option, and the response from this option will, in turn,  be
redirected to the caller. In this case, the proxy server handler is not called at all (redirection is automatic).

You can find an example of how this mechanism works in `examples/proxy.js`. This example features one target server
that writes all the information it receives along with the origin port and a proxy server. Once the servers are up:

- Ten requests are sent directly to the server (without reusing ports)
- Ten requests are sent through the proxy (without reusing ports)

The example shows that the target server sees the last ten requests as coming from the same port (the proxy), while the
first ten come from different ports.

<a name="oscore"></a>
## OSCORE (Object Security)

node-coap has built-in support for [OSCORE (RFC 8613)](https://datatracker.ietf.org/doc/html/rfc8613),
providing end-to-end encryption for CoAP messages using the
[coap-oscore](https://github.com/stoprocent/node-coap-oscore) package. OSCORE operates at the CoAP
message level, encrypting after serialization and decrypting before parsing, so all existing CoAP
features (block transfers, observe, caching) work transparently over OSCORE.

### Client Example

```js
const coap = require('coap')
const { OSCORE, OscoreContextStatus } = require('coap-oscore')

// Create an OSCORE security context
const oscore = new OSCORE({
    masterSecret: Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex'),
    masterSalt: Buffer.from('9e7ca92223786340', 'hex'),
    senderId: Buffer.from('01', 'hex'),
    recipientId: Buffer.from('02', 'hex'),
    idContext: Buffer.alloc(0),
    status: OscoreContextStatus.Fresh
})

// Persist Sender Sequence Number across restarts
oscore.on('ssn', (ssn) => {
    saveToStorage('client-ssn', ssn.toString())
})

// Create an agent and register the OSCORE context for the target peer
const agent = new coap.Agent({ type: 'udp4' })
agent.addOscoreContext('192.168.1.100', 5683, oscore)

// All requests to this peer are now automatically OSCORE-protected
const req = coap.request({
    hostname: '192.168.1.100',
    port: 5683,
    pathname: '/temperature',
    agent
})

req.on('response', (res) => {
    console.log(res.payload.toString())
})

req.end()
```

### Server Example

```js
const coap = require('coap')
const { OSCORE, SecurityContextManager } = require('coap')
const { OscoreContextStatus } = require('coap-oscore')

const contexts = new SecurityContextManager()

// Register a context for client "01"
const oscoreClient1 = new OSCORE({
    masterSecret: Buffer.from('0102030405060708090a0b0c0d0e0f10', 'hex'),
    masterSalt: Buffer.from('9e7ca92223786340', 'hex'),
    senderId: Buffer.from('02', 'hex'),      // server's sender ID
    recipientId: Buffer.from('01', 'hex'),    // client's sender ID
    idContext: Buffer.alloc(0),
    status: OscoreContextStatus.Fresh
})
contexts.addContext(oscoreClient1, Buffer.from('01', 'hex'))

// Persist SSN across restarts
contexts.on('ssn', (recipientId, idContext, ssn) => {
    saveToStorage(`server-ssn-${recipientId.toString('hex')}`, ssn.toString())
})

// Pass contexts to the server — it accepts both OSCORE and plaintext requests
const server = coap.createServer({ oscoreContexts: contexts })

server.on('request', (req, res) => {
    if (req.isOscore) {
        console.log('Secure request from:', req.oscoreContext.senderId.toString('hex'))
    } else {
        console.log('Unprotected request')
    }
    // Response is automatically OSCORE-encrypted if the request was protected
    res.end('Hello World')
})

server.listen(5683)
```

### OSCORE-Only Mode

Both client and server can enforce that all traffic must be OSCORE-protected:

```js
// Server: reject unprotected requests with 4.01
const server = coap.createServer({
    oscoreContexts: contexts,
    oscoreOnly: true
})

// Agent: throw if no OSCORE context exists for the target peer
const agent = new coap.Agent({ type: 'udp4', oscoreOnly: true })
```

### Observe over OSCORE

Observe works transparently. Each notification is independently encrypted:

```js
const req = coap.request({
    hostname: '192.168.1.100',
    pathname: '/temperature',
    observe: true,
    agent  // agent with OSCORE context
})

req.on('response', (res) => {
    res.on('data', (payload) => {
        console.log('Update:', payload.toString())
    })
})

req.end()
```

### Dynamic Context Registration

Contexts can be added or removed at runtime on both agent and server,
which is useful after an EDHOC key exchange completes:

```js
// Agent
agent.addOscoreContext('192.168.1.100', 5683, oscoreInstance)
agent.removeOscoreContext('192.168.1.100', 5683)

// Server
server.addOscoreContext(oscoreInstance, recipientId, idContext)
server.removeOscoreContext(recipientId, idContext)
```

<a name="api"></a>
## API

  * <a href="#request"><code>coap.<b>request()</b></code></a>
  * <a href="#createServer"><code>coap.<b>createServer()</b></code></a>
  * <a href="#incoming"><code>IncomingMessage</b></code></a>
  * <a href="#outgoing"><code>OutgoingMessage</b></code></a>
  * <a href="#observeread"><code>ObserveReadStream</b></code></a>
  * <a href="#observewrite"><code>ObserveWriteStream</b></code></a>
  * <a href="#registerOption"><code>coap.<b>registerOption()</b></code></a>
  * <a href="#ignoreOption"><code>coap.<b>ignoreOption()</b></code></a>
  * <a href="#registerFormat"><code>coap.<b>registerFormat()</b></code></a>
  * <a href="#agent"><code>coap.<b>Agent</b></code></a>
  * <a href="#securitycontextmanager"><code>coap.<b>SecurityContextManager</b></code></a>
  * <a href="#globalAgent"><code>coap.<b>globalAgent</b></code></a>
  * <a href="#globalAgentIPv6"><code>coap.<b>globalAgentIPv6</b></code></a>
  * <a href="#updateTiming"><code>coap.<b>updateTiming</b></code></a>
  * <a href="#defaultTiming"><code>coap.<b>defaultTiming</b></code></a>

-------------------------------------------------------
<a name="request"></a>
### request(requestParams)

Execute a CoAP request. `requestParams` can be a string or an object.
If it is a string, it is parsed using `new URL(requestParams)`.
If it is an object:

- `host`: A domain name or IP address of the server to issue the request
  to.
  Defaults to `'localhost'`.
- `hostname`: To support `URL` `hostname` is preferred over
  `host`
- `port`: Port of remote server. Defaults to 5683.
- `method`: A string specifying the CoAP request method. Defaults to
  `'GET'`.
- `confirmable`: send a CoAP confirmable message (CON), defaults to
  `true`.
- `observe`: send a CoAP observe message, allowing the streaming of
  updates from the server.
- `pathname`: Request path. Defaults to `'/'`. Should not include query string
- `query`: Query string. Defaults to `''`. Should not include the path,
  e.g. 'a=b&c=d'
- `options`: object that includes the CoAP options, for each key-value
  pair the [setOption()](#setOption) will be called.
- `headers`: alias for `options`, but it works only if `options` is
  missing.
- `agent`: Controls [`Agent`](#agent) behavior. Possible values:
  * `undefined` (default): use [`globalAgent`](#globalAgent), a single socket for all
    concurrent requests.
  * [`Agent`](#agent) object: explicitly use the passed in [`Agent`](#agent).
  * `false`: opts out of socket reuse with an [`Agent`](#agent), each request uses a
    new UDP socket.
- `proxyUri`: adds the Proxy-Uri option to the request, so if the request is sent to a
  proxy (or a server with proxy features) the request will be forwarded to the selected URI.
  The expected value is the URI of the target. E.g.: 'coap://192.168.5.13:6793'
- `multicast`: If set to `true`, it forces request to be multicast. Several `response` events
  will be emitted for each received response. It's user's responsibility to set proper multicast `host` parameter
  in request configuration. Default `false`.
- `multicastTimeout`: time to wait for multicast reponses in milliseconds. It is only applicable in case if `multicast` is `true`. Default `20000 ms`.
- `retrySend`: overwrite the default maxRetransmit, useful when you want to use a custom retry count for a request


`coap.request()` returns an instance of <a
href='#outgoing'><code>OutgoingMessage</code></a>.
If you need
to add a payload, just `pipe` into it.
Otherwise, you __must__ call `end` to submit the request.

If `hostname` is a IPv6 address then the payload is sent through a
IPv6 UDP socket, dubbed in node.js as `'udp6'`.

#### Event: 'response'

`function (response) { }`

Emitted when a response is received.
`response` is
an instance of <a
href='#incoming'><code>IncomingMessage</code></a>.

If the `observe` flag is specified, the `'response'` event
will return an instance of
 <a href='#observeread'><code>ObserveReadStream</code></a>.
Which represent the updates coming from the server, according to the
[observe spec](http://tools.ietf.org/html/draft-ietf-core-observe-11).

-------------------------------------------------------
<a name="createServer"></a>
### createServer([options], [requestListener])

Returns a new CoAP Server object.

The `requestListener` is a function which is automatically
added to the `'request'` event.

The constructor can be given an optional options object, containing one of the following options:
* `type`: indicates if the server should create IPv4 connections (`udp4`) or IPv6 connections (`udp6`). Defaults
  to `udp4`.
* `proxy`: indicates that the server should behave like a proxy for incoming requests containing the `Proxy-Uri` header.
  An example of how the proxy feature works, refer to the example in the `/examples` folder. Defaults to `false`.
* `multicastAddress`: Optional. Use this in order to force server to listen on multicast address
* `multicastInterface`: Optional. Use this in order to force server to listen on multicast interface. This is only applicable
  if `multicastAddress` is set. If absent, server will try to listen `multicastAddress` on all available interfaces
* `piggybackReplyMs`: set the number of milliseconds to wait for a
  piggyback response. Default 50.
* `sendAcksForNonConfirmablePackets`: Optional. Use this to suppress sending ACK messages for non-confirmable packages
* `clientIdentifier`: Optional. If specified, it should be a callback function with a signature like `clientIdentifier(request)`, where request is an `IncomingMessage`. The function should return a string that the caches can assume will uniquely identify the client.
* `reuseAddr`: Optional. Use this to specify whether it should be possible to have multiple server instances listening to the same port. Default `true`.
* `oscoreContexts`: Optional. A [`SecurityContextManager`](#securitycontextmanager) instance containing pre-registered OSCORE contexts. When set, the server will automatically decrypt incoming OSCORE-protected requests and encrypt responses. See <a href="#oscore">OSCORE</a>.
* `oscoreOnly`: Optional. If `true`, the server will reject unprotected (non-OSCORE) requests with a `4.01` response. Only meaningful when `oscoreContexts` is also set. Default `false`.

#### Event: 'request'

`function (request, response) { }`

Emitted each time there is a request.
`request` is an instance of <a
href='#incoming'><code>IncomingMessage</code></a> and `response` is
an instance of <a
href='#outgoing'><code>OutgoingMessage</code></a>.

If the `observe` flag is specified, the `response` variable
will return an instance of <a href='#observewrite'><code>ObserveWriteStream</code></a>.
Each `write(data)` to the stream will cause a new observe message sent
to the client.

#### server.listen(port, [address], [callback])

Begin accepting connections on the specified port and hostname.  If the
hostname is omitted, the server will accept connections directed to any
IPv4 or IPv6 address by passing `null` as the address to the underlining socket.

To listen
 to a unix socket, supply a filename instead of port and hostname.

A custom socket object can be passed as a `port` parameter. This custom socket
must be an instance of `EventEmitter` which emits `message`, `error` and
`close` events and implements `send(msg, offset, length, port, address, callback)`
function, just like `dgram.Socket`.
In such case, the custom socket must be pre-configured manually, i.e. CoAP server
will not bind, add multicast groups or do any other configuration.

This function is asynchronous.

#### server.addOscoreContext(oscoreInstance, recipientId[, idContext])

Register an OSCORE security context at runtime. If the server was created without `oscoreContexts`, this will
lazily initialize the OSCORE middleware. `oscoreInstance` is an `OSCORE` instance from the `coap-oscore` package.
`recipientId` is the client's Sender ID (a `Buffer`). `idContext` is an optional `Buffer` for disambiguation when
multiple contexts share the same Recipient ID.

#### server.removeOscoreContext(recipientId[, idContext])

Remove a previously registered OSCORE context.

#### server.close([callback])

Closes the server.

This function is synchronous, but it provides an asynchronous callback
for convenience.

-------------------------------------------------------
<a name="outgoing"></a>
### OutgoingMessage

An `OutgoingMessage` object is returned by `coap.request` or
emitted by the `coap.createServer` `'response'` event.
It may be used to access response status, headers and data.

It implements the [Writable
Stream](http://nodejs.org/api/stream.html#stream_class_stream_writable) interface, as well as the
following additional properties, methods and events.

#### message.code

The CoAP code of the message.
It is HTTP-compatible, as it can be passed `404`.

#### message.statusCode

(same as message.code)

<a name="setOption"></a>
#### message.setOption(name, value)

Sets a single option value.
All the options are in binary format, except for
`'Content-Format'`, `'Accept'`, `'Max-Age'` and `'ETag'`.
See <a href='#registerOption'><code>registerOption</code></a>
 to know how to register more.

Use an array of buffers
if you need to send multiple options with the same name.

If you need to pass a custom option, pass a string containing a
a number as key and a `Buffer` as value.

Example:

```js
message.setOption('Content-Format', 'application/json')
```

or

```js
message.setOption('555', [Buffer.from('abcde'), Buffer.from('ghi')])
```

`setOption` is also aliased as `setHeader` for HTTP API
compatibility.

Also, `'Content-Type'` is aliased to `'Content-Format'` for HTTP
compatibility.

Since v0.7.0, this library supports blockwise transfers, you can trigger
them by adding a `req.setOption('Block2', Buffer.of(0x2))` to the
output of [request](#request).

And since v0.25.0, this library supports rudimentry type 1 blockwise transfers, you can trigger
them by adding a `req.setOption('Block1', Buffer.of(0x2))` to the
options of [request](#request).

(The hex value 0x2 specifies the size of the blocks to transfer with.
Use values 0 to 6 for 16 to 1024 byte block sizes respectively.)

See the
[spec](http://tools.ietf.org/html/draft-ietf-core-coap-18#section-5.4)
for all the possible options.

#### message.reset()
Returns a Reset COAP Message to the sender. The RST message will appear as an empty message with code `0.00` and the
reset flag set to `true` to the caller. This action ends the interaction with the caller.

#### message.writeHead(code, headers)
Functions somewhat like `http`'s `writeHead()` function.  If `code` is does not match the CoAP code mask of `#.##`, it is coerced into this mask.  `headers` is an object with keys being the header names, and values being the header values.

#### message.on('timeout', function(err) { })
Emitted when the request does not receive a response or acknowledgement within a transaction lifetime.
`Error` object with message `No reply in XXXs` and `retransmitTimeout` property is provided as a parameter.

#### message.on('error', function(err) { })
Emitted when an error occurs. This can be due to socket error, confirmable message timeout or any other generic error.
`Error` object is provided, that describes the error.

#### message.on('block', function(info) { })
Emitted once per block during a blockwise transfer — Block1 (upload) or Block2 (download). Useful for progress bars on large payloads.

```js
const req = coap.request({ hostname: 'localhost', method: 'PUT' })

req.on('block', (info) => {
  // info = {
  //   direction: 'sent' | 'received',
  //   num,                // 0-indexed block
  //   more,               // true while more blocks are expected
  //   blockSize,          // bytes per block (16, 32, … 1024)
  //   bytesTransferred,   // cumulative bytes through this block
  //   totalBytes          // known for Block1; for Block2 only set on the last block
  // }
  const total = info.totalBytes ?? '?'
  console.log(`${info.direction} ${info.bytesTransferred}/${total}`)
})

req.on('response', () => {})
req.end(Buffer.alloc(4096))
```

-------------------------------------------------------
<a name="incoming"></a>
### IncomingMessage

An `IncomingMessage` object is created by `coap.createServer` or
`coap.request`
and passed as the first argument to the `'request'` and `'response'` event
respectively. It may be used to access response status, headers and data.

It implements the [Readable
Stream](http://nodejs.org/api/stream.html#stream_class_stream_readable) interface, as well as the
following additional methods and properties.

#### message.payload

The full payload of the message, as a Buffer.

#### message.options

All the CoAP options, as parsed by
[CoAP-packet](http://github.com/mcollina/coap-packet).

All the options are in binary format, except for
`'Content-Format'`, `'Accept'` and `'ETag'`.
See <a href='#registerOption'><code>registerOption()</code></a> to know how to register more.

See the
[spec](http://tools.ietf.org/html/draft-ietf-core-coap-18#section-5.4)
for all the possible options.

#### message.headers

All the CoAP options that can be represented in a human-readable format.
Currently they are only `'Content-Format'`, `'Accept'` and
`'ETag'`.
See <a href='#registerOption'> to know how to register more.

Also, `'Content-Type'` is aliased to `'Content-Format'` for HTTP
compatibility.

#### message.code

The CoAP code of the message.

#### message.method

The method of the message, it might be
`'GET'`, `'POST'`, `'PUT'`, `'DELETE'` or `null`.
It is null if the CoAP code cannot be parsed into a method, i.e. it is
not in the '0.' range.

#### message.url

The URL of the request, e.g.
`'coap://localhost:12345/hello/world?a=b&b=c'`.

#### message.rsinfo

The sender informations, as emitted by the socket.
See [the `dgram` docs](http://nodejs.org/api/dgram.html#dgram_event_message) for details

#### message.outSocket

Information about the socket used for the communication (address and port).

#### message.isOscore

`true` if this request was received with OSCORE protection, `false` otherwise.
Only meaningful on the server side (in the `'request'` event handler).

#### message.oscoreContext

Present when `isOscore` is `true`. An object with the following properties:

- `senderId`: `Buffer` — the client's Sender ID (which is the server's Recipient ID).
- `idContext`: `Buffer | undefined` — the ID Context, if present in the OSCORE option.

This can be used to identify which OSCORE client sent the request.

-------------------------------------------------------
<a name="observeread"></a>
### ObserveReadStream

An `ObserveReadStream` object is created by `coap.request` to handle
_observe_ requests.
It is passed as the first argument to the `'response'` event.
It may be used to access response status, headers and data as they are
sent by the server.
__Each new observe message from the server is a new `'data'` event__.

It implements the [Readable
Stream](http://nodejs.org/api/stream.html#stream_class_stream_readable)
and [IncomingMessage](#incoming) interfaces, as well as the
following additional methods, events and properties.

#### close()

Closes the stream.

#### message.rsinfo

The sender's information, as emitted by the socket.
See [the `dgram` docs](http://nodejs.org/api/dgram.html#dgram_event_message) for details

#### message.outSocket

Information about the socket used for the communication (address and port).

-------------------------------------------------------
<a name="observewrite"></a>
### ObserveWriteStream

An `ObserveWriteStream` object is
emitted by the `coap.createServer` `'response'` event as a response
object.
It may be used to set response status, headers and stream changing data
to the client.

Each new `write()` call is a __new message__ being sent to the client.

It implements the [Writable
Stream](http://nodejs.org/api/stream.html#stream_class_stream_writable)
interface, as well as the
following additional methods and properties.

#### Event: 'finish'

Emitted when the client is not sending 'acks' anymore for the sent
messages.

#### reset()
Returns a Reset COAP Message to the sender. The RST message will appear as an empty message with code `0.00` and the
reset flag set to `true` to the caller. This action ends the interaction with the caller.

-------------------------------------------------------
<a name="registerOption"></a>
### coap.registerOption(name, toBinary, toString)

Register a new option to be converted to string and added to the
`message.headers`.
`toBinary` is a function that accept a string and returns a `Buffer`.
`toString` is a function that accept a `Buffer` and returns a `String`.

-------------------------------------------------------
<a name="ignoreOption"></a>
### coap.ignoreOption(name)

Explicitly ignore an option; useful for compatibility with `http`-based
modules.

-------------------------------------------------------
<a name="registerFormat"></a>
### coap.registerFormat(name, value)

Register a new format to be interpreted and sent in CoAP
`Content-Format` option.
Each format is identified by a number, see the [Content-Format
registry](https://www.iana.org/assignments/core-parameters/core-parameters.xhtml#content-formats).

These are the defaults formats:
|                        Media Type                         |  ID   |
| :-------------------------------------------------------: | :---: |
|                       `text/plain`                        |   0   |
|       `application/cose; cose-type="cose-encrypt0"`       |  16   |
|         `application/cose; cose-type="cose-mac0"`         |  17   |
|        `application/cose; cose-type="cose-sign1"`         |  18   |
|                 `application/link-format`                 |  40   |
|                     `application/xml`                     |  41   |
|                `application/octet-stream`                 |  42   |
|                     `application/exi`                     |  47   |
|                    `application/json`                     |  50   |
|               `application/json-patch+json`               |  51   |
|              `application/merge-patch+json`               |  52   |
|                    `application/cbor`                     |  60   |
|                     `application/cwt`                     |  61   |
|               `application/multipart-core`                |  62   |
|                  `application/cbor-seq`                   |  63   |
|                  `application/cose-key`                   |  101  |
|                `application/cose-key-set`                 |  102  |
|                 `application/senml+json`                  |  110  |
|                 `application/sensml+json`                 |  111  |
|                 `application/senml+cbor`                  |  112  |
|                 `application/sensml+cbor`                 |  113  |
|                  `application/senml-exi`                  |  114  |
|                 `application/sensml-exi`                  |  115  |
|               `application/coap-group+json`               |  256  |
|                  `application/dots+cbor`                  |  271  |
|           `application/missing-blocks+cbor-seq`           |  272  |
| `application/pkcs7-mime; smime-type=server-generated-key` |  280  |
|      `application/pkcs7-mime; smime-type=certs-only`      |  281  |
|                    `application/pkcs8`                    |  284  |
|                  `application/csrattrs`                   |  285  |
|                   `application/pkcs10`                    |  286  |
|                  `application/pkix-cert`                  |  287  |
|                  `application/senml+xml`                  |  310  |
|                 `application/sensml+xml`                  |  311  |
|               `application/senml-etch+json`               |  320  |
|               `application/senml-etch+cbor`               |  322  |
|                   `application/td+json`                   |  432  |
|                `application/vnd.ocf+cbor`                 | 10000 |
|                   `application/oscore`                    | 10001 |
|                 `application/javascript`                  | 10002 |
|              `application/vnd.oma.lwm2m+tlv`              | 11542 |
|             `application/vnd.oma.lwm2m+json`              | 11543 |
|             `application/vnd.oma.lwm2m+cbor`              | 11544 |
|                        `text/css`                         | 20000 |
|                      `image/svg+xml`                      | 30000 |

-------------------------------------------------------
<a name="agent"></a>
### coap.Agent([opts])

An Agent encapsulate an UDP Socket. It uses a combination of `messageId`
and `token` to distinguish between the different exchanges.
The socket will auto-close itself when no more exchange are in place.

By default, no UDP socket are open, and it is opened on demand to send
the messages.

Opts is an optional object with the following optional properties:

* `type`: `'udp4'` or `'udp6'` if we want an Agent on an IPv4 or IPv6
  UDP socket.

* `socket`: use existing socket instead of creating a new one.

* `oscoreOnly`: if `true`, the agent will throw an error when sending a request
  to a peer that has no registered OSCORE context. Default `false`.

#### agent.addOscoreContext(host, port, oscoreInstance)

Register an OSCORE security context for a remote peer. `host` is the peer's IP address or hostname (string),
`port` is the peer's port number, and `oscoreInstance` is an `OSCORE` instance from the `coap-oscore` package.
Once registered, all requests to this `host:port` will be automatically OSCORE-encrypted, and all responses
from this peer will be automatically decrypted.

#### agent.removeOscoreContext(host, port)

Remove a previously registered OSCORE context for a remote peer.

-------------------------------------------------------
<a name="securitycontextmanager"></a>
### coap.SecurityContextManager

A manager for server-side OSCORE security contexts. Contexts are keyed by
`recipientId` and optional `idContext`, matching the KID and KID Context
fields from the OSCORE option in incoming requests.

```js
const { SecurityContextManager } = require('coap')
const contexts = new SecurityContextManager()
```

#### contexts.addContext(oscoreInstance, recipientId[, idContext])

Register an OSCORE context. `oscoreInstance` is an `OSCORE` instance, `recipientId` is the client's Sender ID
(`Buffer`), and `idContext` is an optional `Buffer` for disambiguation.

#### contexts.removeContext(recipientId[, idContext])

Remove a previously registered context. Returns `true` if found and removed.

#### Event: 'ssn'

Emitted when a Sender Sequence Number changes on any managed context. The listener
receives `(recipientId: Buffer, idContext: Buffer | undefined, ssn: bigint)`. Use this
to persist SSN values for context recovery after restarts.

```js
contexts.on('ssn', (recipientId, idContext, ssn) => {
    saveToStorage(`server-ssn-${recipientId.toString('hex')}`, ssn.toString())
})
```

-------------------------------------------------------
<a name="globalAgent"></a>
### coap.globalAgent

The default [`Agent`](#agent) for IPv4.

-------------------------------------------------------
<a name="globalAgentIPv6"></a>
### coap.globalAgentIPv6

The default [`Agent`](#agent) for IPv6.

-------------------------------------------------------
<a name="updateTiming"></a>
### coap.updateTiming

You can update the CoAP timing settings, take a look at the examples:

```js
const coapTiming = {
  ackTimeout: 0.25,
  ackRandomFactor: 1.0,
  maxRetransmit: 3,
  maxLatency: 2,
  piggybackReplyMs: 10
}
coap.updateTiming(coapTiming)
```

-------------------------------------------------------
<a name="defaultTiming"></a>
### coap.defaultTiming

Reset the CoAP timings to the default values

<a name="contributing"></a>
## Contributing

__node-coap__ is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [CONTRIBUTING.md](https://github.com/mcollina/node-coap/blob/master/CONTRIBUTING.md) file for more details.


## Contributors

__node-coap__ is only possible due to the excellent work of the following contributors:

<table><tbody>
<tr><th align="left">Matteo Collina</th><td><a href="https://github.com/mcollina">GitHub/mcollina</a></td><td><a href="https://twitter.com/matteocollina">Twitter/@matteocollina</a></td></tr>
<tr><th align="left">Nguyen Quoc Dinh</th><td><a href="https://github.com/nqd">GitHub/nqd</a></td><td><a href="https://twitter.com/nqdinh">Twitter/@nqdinh</a></td></tr>
<tr><th align="left">Daniel Moran Jimenez</th><td><a href="https://github.com/dmoranj">GitHub/dmoranj</a></td><td><a href="https://twitter.com/erzeneca">Twitter/@erzeneca</a></td></tr>
<tr><th align="left">Ignacio Martín</th><td><a
 href="https://github.com/neich">GitHub/neich</a></td><td><a href="https://twitter.com/natxupitxu">Twitter/@natxupitxu</a></td></tr>
<tr><th align="left">Christopher Hiller</th><td><a href="https://github.com/boneskull">GitHub/boneskull</a></td><td><a href="https://twitter.com/b0neskull">Twitter/@b0neskull</a></td></tr>
</tbody></table>

## LICENSE

MIT, see LICENSE.md file.
