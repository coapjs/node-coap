This folder contains tests of the proxy feature based on issues:
* https://github.com/mcollina/node-coap/issues/55
* https://github.com/mcollina/node-coap/issues/56

IoTDevice.js simulates an IoT device
Server1.js and Server2.js simulates a cloud WoT server.

Issue 55: Start Server1.js and then IoTDevice.js. IoTDevice sends a POST CoAP request to the proxy server of Server1.js. As there is no ProxyUri defined in the request the proxy server in Server1.js should invoke its handler but it does not.

Issue 56: Start Server2.js and then IoTDevice.js. Server2 sends a GET observe request to IoTDevice through the internal proxy. Only the first observe response from IoTDevice is received.  

