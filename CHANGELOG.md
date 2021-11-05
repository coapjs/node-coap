# Changelog

## 0.26.0
*This version supports all current LTS versions of Node.js (12.x, 14.x, 16.x). Older versions might still work but are untested from now on!*

* (JKRhb) Fix coding style with regard to StandardJS
* (JKRhb) chore: update dependencies
* (JKRhb) chore: remove Node version 10.x from CI testing
* (JKRhb) docs: Let content-format registry link point to IANA
* (JKRhb) fix: fix bugs in two examples
* (JKRhb) fix(agent): reset _lastMessageId to 0
* (JKRhb) fix(server): allow limiting to only one server instance per port number
* (JKRhb) feat: add typescript declarations
* (JKRhb) feat: add more Content-Formats
* (JKRhb) test: add more tests for helper functions
* (JKRhb) feat: add support for FETCH, PATCH, and iPATCH
* (JKRhb) chore: add macos-latest to CI pipeline
* (JKRhb) Various refactorings and cleanup
* (JKRhb) Add strict null and type checking
* (JKRhb) Improve README/documentation

## 0.25.0
*This version supports all current LTS versions of Node.js (10.x, 12.x, 14.x, 16.x). Older versions might still work but are untested from now on!*

* (everhardt/JKRhb) feat: add clientIdentifier option to createServer
* (JKRhb) feat: add more content-formats
* (ats-org/Jamezo97/invaderb) feat: Type-1 Block-wise transfer
* (sjlongland/pekkanikander) feat: Add support for de-registering observations
* (phretor) maintenance: let client handle invalid formats themselves instead throwing an error in the library
* (JKRhb) fix: handling of block2 reponses to multicast requests
* (JKRhb) fix: copy all listeners when using block2 multicast
* (JKRhb) fix: three more problems with blockwise multicast responses
* (ats-org/Jamezo97/invaderb) fix: dgram fix
* (JKRhb) fix: several documentation and code (style) optimizations

## 0.24.0
*This version supports all current LTS versions of Node.js (10.x/12.x, 14.x). Older versions might still work but are untested from now on!*

* (blankm) Fix: Retrysend broken when passing socket to agent
* (mateusz-) Fix: fix missing responses to non-confirmable multicast request
* (JcBernack) Fix: update Buffer usage (prevent deprecation wanrings)
* (JsonMa) Fix: fix agent config bug
* (Apollon77) Fix: Add missing checks for Buffer length before reading from it
* (Apollon77) Update all dependencies
* (JsonMa) Fix: remove useless variables
* (JcBernack) Fix: Fix more flag during block-wise transfer

## 0.23.1 (and below)
... can be found in the [Releases list on GitHub](https://github.com/mcollina/node-coap/releases)
