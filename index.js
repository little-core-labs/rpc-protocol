const { Duplex } = require('readable-stream')
const messages = require('./messages')
const crypto = require('crypto')
const varint = require('varint')
const pump = require('pump')

class Protocol extends Duplex {
  constructor(opts) {
    super()
    if ('function' !== typeof opts.connect) {
      throw new TypeError('Connection expects a opts.connect(...) factory')
    }

    this.pending = {}
    this.createConnection = opts.connect

    const wire = this.createConnection(this)
    if (wire) {
      pump(wire, this, wire)
    }
  }

  _read(size) {
    void size
  }

  _write(chunk, enc, done) {
    this.onmessage(chunk)
    done(null, chunk)
  }

  call(name, args, cb) {
    if (!Array.isArray(args)) {
      args = [ args ]
    }

    const command = {
      id: crypto.randomBytes(32),
      name,
      arguments: args.map(a => Buffer.from(a)),
      callback: cb
    }

    const body = messages.Command.encode(command)
    const header = Buffer.concat([
      Buffer.from(varint.encode(0x1)),
      Buffer.from(varint.encode(body.length))
    ])

    const buf = Buffer.concat([
      header,
      body
    ])

    this.pending[command.id.toString('hex')] = command
    process.nextTick(() => this.push(buf))
  }

  command(name, cb) {
    this.on(`command:${name}`, cb)
    return this
  }

  onmessage(chunk) {
    const type = varint.decode(chunk.slice(0, 1))
    const size = varint.decode(chunk.slice(1, 2))
    const body = chunk.slice(2, 2 + size)
    switch (type) {
      case 0x1:
        this.oncommand(messages.Command.decode(body))
        break
      case 0xa:
        this.onresponse(messages.Response.decode(body))
        break
    }
  }

  oncommand(command) {
    this.emit(`command:${command.name}`, command, (err, results) => {
      if (results && !Array.isArray(results)) {
        results = [ results ]
      }

      const response = {
        id: command.id,
        name: command.name
      }

      let error
      if (err || !results) {
        err = err || {}
        response.error = {
          name: err.name || 'UnknownError',
          code: err.code || '0',
          message: err.message || 'An unknown error occurred.'
        }
      } else {
        response.results = results.map(r => Buffer.from(r))
      }

      const body = messages.Response.encode(response)
      const header = Buffer.concat([
        Buffer.from(varint.encode(0xa)),
        Buffer.from(varint.encode(body.length))
      ])

      const buf = Buffer.concat([
        header,
        body
      ])
      process.nextTick(() => this.push(buf))
    })
  }

  onresponse(response) {
    const { callback } = this.pending[response.id.toString('hex')]
    callback(response.error ? response.error : response.results)
  }
}

module.exports = {
  Protocol
}