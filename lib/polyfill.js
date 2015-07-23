exports.compareBuffers = function (buf1, buf2) {
  if (Buffer.compare)
    return Buffer.compare(buf1, buf2)
  else {
    if (buf1.length != buf2.length) return -1
    for (var i = 0; i < buf1.length; i++) {
      if (buf1[i] != buf2[i]) return -1
    }
    return 0
  }
}