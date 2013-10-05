node-coap
=====

[![Build
Status](https://travis-ci.org/mcollina/node-coap.png)](https://travis-ci.org/mcollina/node-coap)

__node-coap__ is an _highly experimental_ client and (in the future)
server library for CoAP modelled after the `http` module.

What is CoAP?
> Constrained Application Protocol (CoAP) is a software protocol
intended to be used in very simple electronics devices that allows them
to communicate interactively over the Internet. -  Wikipedia

This library follows the
[draft-18](http://tools.ietf.org/html/draft-ietf-core-coap-18) of the standard.

It does not parse the protocol but it use
[CoAP-packet](http://github.com/mcollina/coap-packet) instead.

This has been tested only on node v0.10.

## Installation

```
$: npm install coap --save
```

## Basic Example

The following example opens an UDP client and UDP server and sends a
CoAP message between them:

```
const dgram       = require('dgram')
    , coapPacket  = require('coap-packet')
    , parse       = packet.parse
    , payload     = new Buffer('Hello World')
    , port        = 41234
    , server      = dgram.createSocket("udp4")
    , coap        = require('coap')

server.bind(port, function() {
  coap.request('coap://localhost:' + port).end(paylaod)
})

server.on('message', function(data) {
  console.log(parse(data).payload.toString())
  server.close()
})
```

## API

  * <a href="#parse"><code>coap.<b>request()</b></code></a>

### request(url)

Execute a CoAP request. `url` can be a string or an object.
If it is a string, it is parsed using `require('url').parse(url)`.
If it is an object:

- `host`: A domain name or IP address of the server to issue the request
  to.
  Defaults to `'localhost'`.
- `hostname`: To support `url.parse()` `hostname` is preferred over
  `host`
- `port`: Port of remote server. Defaults to 5483.
- `method`: A string specifying the CoAP request method. Defaults to
  `'GET'`.
- `pathname`: Request path. Defaults to `'/'`. Should not include query string
- `query`: Query string. Defaults to `''`. Should not include the path,
  e.g. 'a=b&c=d'

`coap.request()` returns an instance of `stream.Writable`. If you need
to add a payload, just `pipe` into it.
Otherwise, you __must__ call `end` to submit the request.

## Contributors

Coap-Packet is only possible due to the excellent work of the following contributors:

<table><tbody>
<tr><th align="left">Matteo Collina</th><td><a href="https://github.com/mcollina">GitHub/mcollina</a></td><td><a href="https://twitter.com/matteocollina">Twitter/@matteocollina</a></td></tr>
</tbody></table>

## LICENSE
Copyright (c) 2013 node-coap contributors (listed above).

Coap-Packet is licensed under an MIT +no-false-attribs license.
All rights not explicitly granted in the MIT license are reserved.
See the included LICENSE file for more details.
