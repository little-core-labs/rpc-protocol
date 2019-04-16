const defaultEncoding = require('./encoding')
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

    encoding = encoding || defaultEncoding
    const decoded = messages.Command.decode(unpack(buffer))
    const name = decoded.name
    const args = decoded.arguments
    const cmd = new Command(encoding, name, args.map(decode))
    cmd.id = decoded.id
    return cmd
    function decode(arg) {
      return encoding.decode(arg)
    }
  }

  constructor(encoding, name, args, callback) {
    this.id = Command.id()
    this.name = name
    this.encoding = encoding
    this.callback = callback
    this.arguments = args
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      arguments: this.arguments.map((arg) => this.encoding.encode(arg))
    }
  }

  toBuffer() {
    return messages.Command.encode(this.toJSON())
  }

  pack() {
    return pack(Command.WIRE_TYPE, this.toBuffer())
  }
}

module.exports = {
  Command
}
