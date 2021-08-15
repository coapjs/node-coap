/*
 * Copyright (c) 2013-2021 node-coap contributors.
 *
 * node-coap is licensed under an MIT +no-false-attribs license.
 * All rights not explicitly granted in the MIT license are reserved.
 * See the included LICENSE file for more details.
 */

function isNullOrUndefined (obj) {
  return typeof obj === 'undefined' || obj === null
}
const TwoPowTwenty = 1048575
/**
 *
 * @param {Number} sequenceNumber The block sequence number.
 * @param {Boolean} moreBlocks If there are more blocks to follow
 * @param {Number} blockSize
 */
module.exports.generateBlockOption = function (sequenceNumber, moreBlocks, blockSize) {
  if (typeof sequenceNumber === 'object') {
    moreBlocks = sequenceNumber.moreBlocks
    blockSize = sequenceNumber.blockSize
    sequenceNumber = sequenceNumber.sequenceNumber
  }

  if (isNullOrUndefined(sequenceNumber) || isNullOrUndefined(blockSize) || isNullOrUndefined(sequenceNumber)) {
    throw new Error('Invalid parameters')
  }

  if (sequenceNumber > TwoPowTwenty) {
    throw new Error('Sequence number out of range')
  }

  let buff = Buffer.alloc(4)

  const value = (sequenceNumber << 4) | ((moreBlocks ? (1) : (0)) << 3) | (blockSize & 7)
  buff.writeInt32BE(value)

  if (sequenceNumber >= 4096) {
    buff = buff.slice(1, 4)
  } else if (sequenceNumber >= 16) {
    buff = buff.slice(2, 4)
  } else {
    buff = buff.slice(3, 4)
  }

  return buff
}

module.exports.parseBlockOption = function (buff) {
  if (buff.length === 1) {
    buff = Buffer.concat([Buffer.alloc(3), buff])
  } else if (buff.length === 2) {
    buff = Buffer.concat([Buffer.alloc(2), buff])
  } else if (buff.length === 3) {
    buff = Buffer.concat([Buffer.alloc(1), buff])
  } else {
    throw new Error('Invalid block option buffer length. Must be 1, 2 or 3. It is ' + buff.length)
  }

  const value = buff.readInt32BE()

  const sequenceNumber = (value >> 4) & TwoPowTwenty
  const moreBlocks = ((value & 8) === 8) ? 1 : 0
  const blockSize = value & 7

  return {
    sequenceNumber: sequenceNumber,
    moreBlocks: moreBlocks,
    blockSize: blockSize
  }
}

module.exports.exponentToByteSize = function (expo) {
  return Math.pow(2, expo + 4)
}

module.exports.byteSizeToExponent = function (byteSize) {
  return Math.round(Math.log(byteSize) / Math.log(2) - 4)
}
