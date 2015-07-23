if (!Buffer.prototype.compare) {
  Buffer.prototype.compare = function (buf) {
    if (this.length != buf.length) return -1

    for (var i = 0; i < this.length; i++) {
      if (this[i] != buf[i]) return -1
    }

    return 0
  }
}