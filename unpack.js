const varint = require('varint')

function unpack(buffer) {
  const type = varint.decode(buffer)
  buffer = buffer.slice(varint.decode.bytes)
  const size = varint.decode(buffer)
  buffer = buffer.slice(varint.decode.bytes)
  buffer = buffer.slice(0, size)
  return buffer
}

module.exports = {
  unpack
}
