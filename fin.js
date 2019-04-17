const defaultEncoding = require('./encoding')
const { unpack } = require('./unpack')
const messages = require('./messages')
const { pack } = require('./pack')
const crypto = require('crypto')
const varint = require('varint')

class Fin {
  static get WIRE_TYPE() {
    return 0x05
  }

  static from(buffer, encoding) {
    const type = varint.decode(buffer)

    if (Fin.WIRE_TYPE !== type) {
      throw new TypeError('Invalid wire type for Fin')
    }

    encoding = encoding || defaultEncoding
    const decoded = messages.Fin.decode(unpack(buffer))
    return new Fin(encoding, decoded.id, decoded.nonce)
  }

  constructor(encoding, id, nonce) {
    this.id = id
    this.nonce = nonce || crypto.randomBytes(32)
  }

  toJSON() {
    return{
      id: this.id,
      nonce: this.nonce
    }
  }

  toBuffer() {
    return messages.Fin.encode(this.toJSON())
  }

  pack() {
    return pack(Fin.WIRE_TYPE, this.toBuffer())
  }
}

module.exports = {
  Fin
}
