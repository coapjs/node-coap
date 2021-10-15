# Changelog

## 0.26.0
*This version supports all current LTS versions of Node.js (12.x, 14.x, 16.x). Older versions might still work but are untested from now on!*

* (JKRhb) Fix coding style with regard to StandardJS ([#251](https://github.com/mcollina/node-coap/pull/251))
* (JKRhb) chore: update dependencies ([#265](https://github.com/mcollina/node-coap/pull/265))
* (JKRhb) chore: remove Node version 10.x from CI testing
* (JKRhb) docs: Let content-format registry link point to IANA
* (JKRhb) refactor(agent): remove dnsbug check ([#272](https://github.com/mcollina/node-coap/pull/272))
* (JKRhb) refactor: replace prototypes with classes ([#273](https://github.com/mcollina/node-coap/pull/273))
* (JKRhb) refactor: replace that with this by using arrow functions ([#274](https://github.com/mcollina/node-coap/pull/274))
* (JKRhb) refactor: replace unneeded function statements with arrow functions ([#275](https://github.com/mcollina/node-coa275p/pull/))
* (JKRhb) fix: fix bugs in two examples ([#276](https://github.com/mcollina/node-coap/pull/276))
* (JKRhb) fix: increase timeout for invalid packets test ([#277](https://github.com/mcollina/node-coap/pull/277))
* (JKRhb) fix(agent): reset _lastMessageId to 0 ([#266](https://github.com/mcollina/node-coap/pull/266))
* (JKRhb) refactor: replace deprecated URL.parse ([#267](https://github.com/mcollina/node-coap/pull/267))
* (JKRhb) fix(server): allow only one server instance for each port number ([#271](https://github.com/mcollina/node-coap/pull/271))
* (JKRhb) feat: add typescript declarations ([#278](https://github.com/mcollina/node-coap/pull/278))
* (JKRhb) feat: refactor and add type declarations for ObserveReadStream, add copyright header ([#279](https://github.co279m/mcollina/node-coap/pull/))
* (JKRhb) feat: add type declaration for ObserveWriteStream ([#280](https://github.com/mcollina/node-coap/pull/280))
* (JKRhb) docs: add missing copyright header ([#281](https://github.com/mcollina/node-coap/pull/281))
* (JKRhb) feat: add more Content-Formats ([#282](https://github.com/mcollina/node-coap/pull/282))
* (JKRhb) docs: fix Buffer code for Block1 option ([#283](https://github.com/mcollina/node-coap/pull/283))
* (JKRhb) chore: ignore auxiliary files when publishing ([#284](https://github.com/mcollina/node-coap/pull/284))
* (JKRhb) refactor(agent): remove obsolete token statements ([#286](https://github.com/mcollina/node-coap/pull/286))
* (JKRhb) fix(examples): fix problem caused by new URL ([#287](https://github.com/mcollina/node-coap/pull/287))
* (JKRhb) test(helpers): add test for toCode ([#290](https://github.com/mcollina/node-coap/pull/290))
* (JKRhb) refactor: refactor parameters, expand Typescript declaration ([#291](https://github.com/mcollina/node-coap/pull/291))
* (JKRhb) refactor: remove obsolete polyfill module ([#292](https://github.com/mcollina/node-coap/pull/292))
* (JKRhb) style: refactor string concatenation ([#294](https://github.com/mcollina/node-coap/pull/294))
* (JKRhb) feat: add support for FETCH, PATCH, and iPATCH ([#264](https://github.com/mcollina/node-coap/pull/264))
* (JKRhb) refactor: use Maps instead of Objects for caching ([#295](https://github.com/mcollina/node-coap/pull/295))
* (JKRhb) refactor: unify block1 and block2 terminology ([#296](https://github.com/mcollina/node-coap/pull/296))
* (JKRhb) refactor: add strict nullchecks ([#297](https://github.com/mcollina/node-coap/pull/297))
* (JKRhb) test: refactor and fix tests ([#298](https://github.com/mcollina/node-coap/pull/298))
* (JKRhb) test: clean up sinon.useFakeTimers() calls ([#299](https://github.com/mcollina/node-coap/pull/299))
* (JKRhb) refactor: remove simplifyPacketForPrint function ([#300](https://github.com/mcollina/node-coap/pull/300))
* (JKRhb) refactor: refactor helper functions ([#301](https://github.com/mcollina/node-coap/pull/301))
* (JKRhb) chore: add macos-latest to CI pipeline ([#304](https://github.com/mcollina/node-coap/pull/304))

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
