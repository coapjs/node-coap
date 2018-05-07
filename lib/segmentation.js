var generate = require('coap-packet').generate
 , generateBlockOption = require('./block').generateBlockOption
 , byteSizeToExponent = require('./block').byteSizeToExponent
 , exponentToByteSize = require('./block').exponentToByteSize;


function SegmentedTransmission(blockSize, req, packet) {
  if(blockSize < 0 || blockSize > 6) {
    throw new Error("invalid block size " + blockSize)
  }

  this.blockState = {
    sequenceNumber: 0,
    moreBlocks: false,
    blockSize: 0
  }

  this.setBlockSizeExp(blockSize)

  this.totalLength = packet.payload.length
  this.currentByte = 0
  this.lastByte = 0

  this.req = req
  this.payload = packet.payload
  this.packet = packet

  this.packet.payload = null
  this.resendCount = 0
}

SegmentedTransmission.prototype.setBlockSizeExp = function setBlockSizeExp(blockSizeExp) {
  this.blockState.blockSize = blockSizeExp
  this.byteSize = exponentToByteSize(blockSizeExp)
}

SegmentedTransmission.prototype.updateBlockState = function updateBlockState() {
  this.blockState.sequenceNumber = this.currentByte / this.byteSize
  this.blockState.moreBlocks = ((this.currentByte + this.byteSize) < this.totalLength)?1:0

  this.req.setOption("Block1", generateBlockOption(this.blockState))
}

SegmentedTransmission.prototype.isCorrectACK = function isCorrectACK(packet, retBlockState) {
  return retBlockState.sequenceNumber == this.blockState.sequenceNumber// && packet.code == "2.31"
}

SegmentedTransmission.prototype.resendPreviousPacket = function resendPreviousPacket() {
  if(this.resendCount < 5) {
    this.currentByte = this.lastByte
    if(this.remaining() > 0) {
      this.sendNext()
    }
    this.resendCount++
  } else {
    throw new Error("Too many block re-transfers")
  }
}

/**
 * 
 * @param {Packet} packet The packet received which contained the ack
 * @param {Object} retBlockState The received block state from the other end 
 * @returns {Boolean} Returns true if the ACK was for the correct block. 
 */
SegmentedTransmission.prototype.receiveACK = function receiveACK(packet, retBlockState) {
  if(this.blockState.blockSize !== retBlockState.blockSize) {
    this.setBlockSizeExp(retBlockState.blockSize)
  }

  if(this.remaining() > 0) {
    this.sendNext()
  }
  this.resendCount = 0
}

SegmentedTransmission.prototype.remaining = function remaining() {
  return this.totalLength - this.currentByte
}

SegmentedTransmission.prototype.sendNext = function sendNext() {
  var blockLength = Math.min(this.totalLength - this.currentByte, this.byteSize)
  var subBuffer = this.payload.slice(this.currentByte, this.currentByte + blockLength)
  this.updateBlockState()

  this.packet.ack = false
  this.packet.reset = false
  this.packet.confirmable = true

  this.packet.payload = subBuffer


  this.lastByte = this.currentByte
  this.currentByte += blockLength
  var buf
  
  try {
    buf = generate(this.packet)
  } catch(err) {
    this.req.sender.reset()
    return this.req.emit('error', err)
  }
  this.req.sender.send(buf, !this.packet.confirmable)
}



module.exports.SegmentedTransmission = SegmentedTransmission