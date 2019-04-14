const varint = require('varint')

function pack(wireType, buffer) {
  const type = Buffer.from(varint.encode(wireType))
  const size = Buffer.from(varint.encode(buffer.length))
  const header = Buffer.concat([ type, size ])
  return Buffer.concat([ header, buffer ])
}

module.exports = {
  pack
}
