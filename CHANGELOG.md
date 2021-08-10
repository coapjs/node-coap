# Changelog

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
