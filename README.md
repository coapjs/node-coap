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

**node-coap** is an **OPEN Open Source Project**, see the <a href="#contributing">Contributing</a> section to find out what this means.

This has been tested only on node v0.10.

## Installation

```
$: npm install coap --save
```

## Basic Example

The following example opens a UDP server and sends a
CoAP message to it:

```
const coap        = require('../') // or coap
    , server      = coap.createServer()

server.on('request', function(req, res) {
  res.end('Hello ' + req.url.split('/')[1] + '\n')
})

// the default CoAP port is 5683
server.listen(function() {
  var req = coap.request('coap://localhost/Matteo')

  req.on('response', function(res) {
    res.pipe(process.stdout)
    res.on('end', function() {
      process.exit(0)
    })
  })

  req.end()
})
```

## API

  * <a href="#request"><code>coap.<b>request()</b></code></a>
  * <a href="#createServer"><code>coap.<b>createServer()</b></code></a>

<a name="request"></a>
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

`coap.request()` returns an instance of <a
href='#incoming'><code>coap.IncomingMessage</code></a>.
If you need
to add a payload, just `pipe` into it.
Otherwise, you __must__ call `end` to submit the request.

#### Event: 'response'

`function (response) { }`

Emitted when a response is received.
`response` is
an instance of <a
href='#incoming'><code>coap.IncomingMessage</code></a>.

<a name="createServer"></a>
### createServer([requestListener])

Returns a new CoAP Server object.

The `requestListener` is a function which is automatically
added to the `'request'` event.

#### Event: 'request'

`function (request, response) { }`

Emitted each time there is a request. 
`request` is an instance of <a
href='#incoming'><code>coap.IncomingMessage</code></a> and `response` is
an instance of <a
href='#outgoing'><code>coap.OutgoingMessage</code></a>.

#### server.listen(port, [hostname], [callback])

Begin accepting connections on the specified port and hostname.  If the
hostname is omitted, the server will accept connections directed to any
IPv4 address (`INADDR_ANY`).

To listen to a unix socket, supply a filename instead of port and hostname.

This function is asynchronous.

#### server.close([callback])

Closes the server.

This function is synchronous, but it provides an asynchronous callback
for convenience.

<a name="contributing"></a>
## Contributing

__node-coap__ is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [CONTRIBUTING.md](https://github.com/mcollina/node-coap/blob/master/CONTRIBUTING.md) file for more details.

## Limitations

At the moment only non-confirmable messages are supported (NON in the
CoAP spec). This means less reliability, as there is no way for a client
to know if the server has received the message.

Moreover, the maximum packet size is 1280, as the
[blockwise](http://datatracker.ietf.org/doc/draft-ietf-core-block/) is
not supported yet.

The [observe](http://datatracker.ietf.org/doc/draft-ietf-core-observe/)
support is planned too.

## Contributors

__node-coap__ is only possible due to the excellent work of the following contributors:

<table><tbody>
<tr><th align="left">Matteo Collina</th><td><a href="https://github.com/mcollina">GitHub/mcollina</a></td><td><a href="https://twitter.com/matteocollina">Twitter/@matteocollina</a></td></tr>
</tbody></table>

## LICENSE
Copyright (c) 2013 node-coap contributors (listed above).

Coap-Packet is licensed under an MIT +no-false-attribs license.
All rights not explicitly granted in the MIT license are reserved.
See the included LICENSE file for more details.
