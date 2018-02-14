const {generate} = require('coap-packet');
const {generateBlockOption} = require('./block');


function SegmentedTransmission(blockSize, req, packet, outgoingMessage) {
    if(blockSize < 0 || blockSize > 6) {
        throw new Error("invalid block size " + blockSize);
    }

    this.blockState = {
        sequenceNumber: 0,
        moreBlocks: false,
        blockSize: 0
    };

    this.setBlockSizeExp(blockSize);

    this.totalLength = packet.payload.length;
    this.currentByte = 0;

    this.req = req;
    this.payload = packet.payload;
    this.packet = packet;
    this.outgoingMessage = outgoingMessage;

    this.packet.payload = null;
}

SegmentedTransmission.prototype.setBlockSizeExp = function setBlockSizeExp(blockSizeExp) {
    this.blockState.blockSize = blockSizeExp;
    this.byteSize = Math.pow(2, blockSizeExp+4);
}

SegmentedTransmission.prototype.updateBlockState = function updateBlockState() {
    this.blockState.sequenceNumber = this.currentByte / this.byteSize;
    this.blockState.moreBlocks = ((this.currentByte + this.byteSize) < this.totalLength)?1:0;

    this.req.setOption("Block1", generateBlockOption(this.blockState));
}

/**
 * 
 * @param {Packet} packet The packet received which contained the ack
 * @param {Object} retBlockState The received block state from the other end 
 */
SegmentedTransmission.prototype.receiveACK = function receiveACK(packet, retBlockState) {
    if(this.blockState.blockSize !== retBlockState.blockSize) {
        this.setBlockSizeExp(retBlockState.blockSize);
    }
    if(this.remaining() > 0) {
        this.sendNext();
    }
}

SegmentedTransmission.prototype.remaining = function remaining() {
    return this.totalLength - this.currentByte;
}

SegmentedTransmission.prototype.sendNext = function sendNext() {
    var blockLength = Math.min(this.totalLength - this.currentByte, this.byteSize);
    var subBuffer = this.payload.slice(this.currentByte, this.currentByte + blockLength);
    this.updateBlockState();

    this.packet.payload = subBuffer;

    this.currentByte += blockLength;
    var buf;
    
    try {
      buf = generate(this.packet)
    } catch(err) {
      this.req.sender.reset()
      return this.req.emit('error', err)
    }
    
    this.req.sender.send(buf, !this.packet.confirmable)
}



module.exports.SegmentedTransmission = SegmentedTransmission;