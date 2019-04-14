const { unpack } = require('./unpack')
const messages = require('./messages')
const { pack } = require('./pack')
const varint = require('varint')

function toMaybeError(err) {
  if (!err) {
    return null
  }

  return Object.assign(new Error(), err)
}

class Response {
  static get WIRE_TYPE() {
    return 0x0A
  }

  static from(buffer, encoding) {
    const type = varint.decode(buffer)

    if (Response.WIRE_TYPE !== type) {
      throw new TypeError('Invalid wire type for Response')
    }

    const dec = messages.Response.decode(unpack(buffer))
    return Object.assign(new Response(encoding, dec, dec.error, dec.results))
  }

  constructor(encoding, req, error, results) {
    this.id = req.id
    this.name = req.name
    this.error = toMaybeError(error)
    this.results = results
    this.encoding = encoding
  }

  toJSON() {
    const { encoding } = this
    return {
      id: this.id,
      name: this.name,
      error: this.error || null,
      results: this.results && this.results.map((result) => encoding.encode(result)),
    }
  }

  toBuffer() {
    return messages.Response.encode(this.toJSON())
  }

  pack() {
    return pack(Response.WIRE_TYPE, this.toBuffer())
  }
}

module.exports = {
  Response
}
