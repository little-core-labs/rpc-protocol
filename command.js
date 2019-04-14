const { unpack } = require('./unpack')
const messages = require('./messages')
const { pack } = require('./pack')
const crypto = require('crypto')
const varint = require('varint')

class Command {
  static id() {
    return crypto.randomBytes(32)
  }

  static get WIRE_TYPE() {
    return 0x01
  }

  static from(buffer, encoding) {
    const type = varint.decode(buffer)

    if (Command.WIRE_TYPE !== type) {
      throw new TypeError('Invalid wire type for Command')
    }

    const dec = messages.Command.decode(unpack(buffer))
    return Object.assign(new Command(encoding, dec.name, dec.arguments), {
      id: dec.id
    })
  }

  constructor(encoding, name, args, callback) {
    this.id = Command.id()
    this.name = name
    this.callback = callback
    this.arguments = args

    if (Array.isArray(this.arguments) && encoding) {
      this.arguments = this.arguments.map((arg) => encoding.encode(arg))
    }
  }

  toBuffer() {
    return messages.Command.encode(this)
  }

  pack() {
    return pack(Command.WIRE_TYPE, this.toBuffer())
  }
}

module.exports = {
  Command
}
