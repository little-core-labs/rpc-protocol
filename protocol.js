const { deserialize } = require('./serialization')
const { Response } = require('./response')
const { Command } = require('./command')
const { Duplex } = require('readable-stream')
const { unpack } = require('./unpack')
const { pack } = require('./pack')
const encoding = require('./encoding')
const through = require('through2')
const varint = require('varint')
const crypto = require('crypto')
const pump = require('pump')

class Protocol extends Duplex {
  static get COMMAND() { return 0x1 }
  static get RESPONSE() { return 0xa }

  constructor(opts) {
    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    super(opts)

    this.setMaxListeners(0)

    this.readStreams = new Set()
    this.extensions = new Map()
    this.encoding = opts.encoding || encoding
    this.pending = new Map()

    if (opts && 'function' === typeof opts.connect) {
      process.nextTick(() => pump(this, opts.connect(this), this))
    }
  }

  _read(size) {
    void size
  }

  _write(chunk, enc, done) {
    this.onmessage(chunk)
    done(null, chunk)
  }

  send(id, request, buffer, callback) {
    // send(extensionType, buffer, callback)
    if ('number' === typeof id) {
      const extensionType = id
      const extension = this.extensions.get(extensionType)

      if ('function' === typeof request) {
        callback = request
        request = {}
      }

      if (!callback && 'function' === typeof buffer) {
        callback = buffer
      }

      request = request || {}
      id = request.id || crypto.randomBytes(32)
      request.id = id

      if (extension && 'function' === typeof extension.encode) {
        if (!Buffer.isBuffer(request)) {
          request = extension.encode(request)
        }
      }

      buffer = pack(extensionType, request)
      request = { id }
      request.encoding = extension
      request.wireType = extensionType
    }

    // send(id, buffer, callback)
    if ('function' === typeof buffer) {
      callback = buffer
      buffer = request
      request = { id }
    }

    // send(buffer, callback)
    if ('function' === typeof request) {
      callback = request
      if (!this.pending.has(id) && !this.pending.has(id.toString('hex'))) {
        buffer = id
        id = crypto.randomBytes(32)
      } else {
      }

      request = { id }
    }

    if ('function' === typeof callback) {
      request.callback = callback
    }

    if (Buffer.isBuffer(id)) {
      id = id.toString('hex')
    }

    if (id && 'string' !== typeof id) {
      id = id.toString()
    }

    if (!request.encoding) {
      request.encoding = this.encoding
    }

    if (this.pending.has(id)) {
      const req = this.pending.get(id)
      if (!Buffer.isBuffer(req) && req.encoding) {
        buffer.id = req.id
        request = buffer
        buffer = req.encoding.encode(buffer)
        if (req.wireType){
          buffer = pack(req.wireType, buffer)
        }
      }
    } else {
      this.pending.set(id, request)
    }

    process.nextTick(() => this.push(buffer))
    return id
  }

  createReadStream(nameOrExtension, opts) {
    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    const objectMode = false !== opts.objectMode && true !== opts.binary
    const stream = objectMode ? through.obj(opts) : through(opts)
    let closed = false

    if ('string' === typeof nameOrExtension) {
      if (this.pending.has(nameOrExtension)) {
        stream.id = nameOrExtension
        this.readStreams.add(nameOrExtension)
      } else {
        const command = this.call(nameOrExtension, onresponse)
        const id = command.id.toString('hex')
        stream.id = id
        this.readStreams.add(id)
      }
    }

    if (nameOrExtension && 'number' === typeof nameOrExtension) {
      const id = this.send(nameOrExtension, onresponse)
      stream.id = id
      this.readStreams.add(id)
    }

    stream.once('close', () => { closed = true })
    return stream

    function onresponse(err, res) {
      if (err) {
        stream.emit('error', err)
      } else if (!closed) {
        stream.push(objectMode ? res : res[0])
      }
    }
  }

  call(name, args, cb) {
    if (!Array.isArray(args)) {
      args = [ args ]
    }

    args = args.filter((arg) => undefined !== arg)

    const command = new Command(this.encoding, name, args, cb)
    const buffer = command.pack()
    const id = command.id.toString('hex')
    this.send(id, command, buffer)
    return command
  }

  command(name, cb) {
    this.on(`command:${name}`, cb)
    return this
  }

  extension(type, handler) {
    this.extensions.set(type, handler)
    return this
  }

  onmessage(buffer) {
    const type = varint.decode(buffer)

    switch (type) {
      case Protocol.COMMAND:
        return this.oncommand(Command.from(buffer, this.encoding))

      case Protocol.RESPONSE:
        return this.onresponse(Response.from(buffer, this.encoding))
    }

    if (this.extensions.has(type)) {
      const extension = this.extensions.get(type)
      if (extension && 'function' === typeof extension.decode) {
        const chunk = extension.decode(unpack(buffer))
        return this.onextension(type, chunk, buffer)
      }
    }

    throw new TypeError(`Invalid wire type: ${type}`)
  }

  onextension(type, req, buffer) {
    if (req && req.id) {
      const id = req.id.toString('hex')
      const request = this.pending.get(id)

      if (request && 'function' === typeof request.callback) {
        const { callback } = request
        const err = deserialize(req.error || null)

        if (!this.readStreams.has(id)) {
          this.pending.delete(id)
        }

        return callback(err, err ? null : req)
      }
    }

    this.emit('extension', req, type, buffer, (err, results) => {
      if (results && !Array.isArray(results)) {
        results = [ results ]
      }

      const { encode } = this.extensions.get(type)

      if (err) {
        this.push(pack(type, encode({ id: req.id, error: err })))
      }

      if (results) {
        for (const result of results) {
          result.id = result.id || req.id
          this.push(pack(type, encode(result)))
        }
      }
    })
  }

  oncommand(command) {
    this.emit('command', command)
    this.emit(`command:${command.name}`, command, (err, results) => {
      if (results && !Array.isArray(results)) {
        results = [ results ]
      }

      const response = new Response(this.encoding, command, err, results)
      const buffer = response.pack()
      process.nextTick(() => this.push(buffer))
    })
  }

  onresponse(res) {
    const id = res.id.toString('hex')
    const request = this.pending.get(id)
    const { callback } = request

    if (!this.readStreams.has(id)) {
      this.pending.delete(id)
    }

    if ('function' === typeof callback) {
      const results = res.results && res.results.map((result) => encoding.decode(result))
      callback(res.error, results)
    }
  }
}

module.exports = {
  Protocol
}
