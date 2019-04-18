const { deserialize } = require('./serialization')
const defaultEncoding = require('./encoding')
const { Response } = require('./response')
const { Command } = require('./command')
const { Duplex } = require('readable-stream')
const { unpack } = require('./unpack')
const isStream = require('is-stream')
const { pack } = require('./pack')
const { Fin } = require('./fin')
const through = require('through2')
const varint = require('varint')
const crypto = require('crypto')
const pump = require('pump')

const READ_STREAM_TIMEOUT = 1000

class Protocol extends Duplex {
  static get COMMAND() { return Command.WIRE_TYPE }
  static get RESPONSE() { return Response.WIRE_TYPE }
  static get FIN() { return Fin.WIRE_TYPE }

  constructor(opts) {
    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    super(opts)

    this.setMaxListeners(0)

    this.readStreams = new Set()
    this.extensions = new Map()
    this.encoding = opts.encoding || defaultEncoding
    this.pending = new Map()

    if (opts && 'function' === typeof opts.connect) {
      process.nextTick(pump, this, opts.connect(this), this)
    }

    if (opts && opts.stream) {
      process.nextTick(pump, this, opts.stream, this)
    }
  }

  _read(size) {
    void size
  }

  _write(chunk, enc, done) {
    try {
      this.onmessage(chunk)
      done(null, chunk)
    } catch (err) {
      done(err)
    }
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
        buffer = Buffer.from(id)
        id = crypto.randomBytes(32)
      } else {
      }

      request = { id }

      if ('function' === typeof callback) {
        process.nextTick(()=> {
          if (this.destroyed) {
            callback(new Error('Destroyed'))
          } else {
            callback(null)
          }
        })
      }
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

    if ('object' === typeof nameOrExtension) {
      if (nameOrExtension.id) {
        nameOrExtension = nameOrExtension.id
      } else if (!Buffer.isBuffer(nameOrExtension)) {
        throw new TypeError('Expecting a command ID or name, or an extension ID')
      }
    }

    const objectMode = false !== opts.objectMode && true !== opts.binary
    const stream = objectMode ? through.obj(opts) : through(opts)
    let closed = false
    let timer = 0
    let id = null

    if (Buffer.isBuffer(nameOrExtension)) {
      nameOrExtension = nameOrExtension.toString('hex')
    }

    if ('string' === typeof nameOrExtension) {
      const command = this.pending.get(nameOrExtension)
      if (command) {
        id = stream.id = nameOrExtension
        this.readStreams.add(nameOrExtension)
        const { callback } = command
        command.callback = (err, res) => {
          if (err) {
            stream.emit('error', err)
          } else if (!closed) {
            for (const k of res) {
              stream.push(Buffer.from(k))
            }
          }

          if ('function' === typeof callback) {
            callback(err, res)
          }
        }
      } else {
        const command = this.call(nameOrExtension, onresponse)
        stream.id = command.id
        this.readStreams.add(command.id.toString('hex'))
      }
    }

    if (nameOrExtension && 'number' === typeof nameOrExtension) {
      id = stream.id = this.send(nameOrExtension, onresponse)
      this.readStreams.add(id)
    }

    stream.once('close', onclose)
    stream.once('end', onend)
    stream.once('end', () => this.fin(id))

    this.once('close', close)
    this.once('end', close)

    timeout()

    return stream

    function timeout() {
      clearTimeout(timer)
      timer = setTimeout(ontimeout, opts.timeout || READ_STREAM_TIMEOUT)
      stream.once('data', () => timeout())
    }

    function close() {
      stream.end()
      stream.destroy()
    }

    function ontimeout() {
      close()
    }

    function onclose() {
      clearTimeout(timer)
      closed = true
    }

    function onend() {
      clearTimeout(timer)
    }

    function onresponse(err, res) {
      if (err) {
        stream.emit('error', err)
      } else if (!closed) {
        stream.push(objectMode ? res : res[0])
      }
    }
  }

  call(name, args, cb) {
    if ('function' === typeof args && !cb) {
      cb = args
      args = []
    }

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
    if ('string' === typeof name && 'function' === typeof cb) {
      const event = `command:${hash(name)}`
      this.removeAllListeners(event)
      this.on(event, oncommand)
      this.once('close', () => {
        this.removeListener(event, oncommand)
      })
    }

    if ('function' === typeof name) {
      this.on('command', oncommand)
    }

    return this

    async function oncommand(cmd, reply) {
      let responded = false
      try {
        const results = await cb(cmd, respond)
        if (!responded && undefined !== results) {
          if (isStream(results)) {
            let reading = true
            results.on('data', (data) => { reading && (reading = respond(null, data)) })
            results.on('end', () => { reading && respond(null, null) })
          } else {
            respond(null, results)
          }
        }
      } catch (err) {
        respond(err)
      }

      function respond(err, results) {
        responded = true
        return reply(err, results)
      }
    }
  }

  extension(type, handler) {
    this.extensions.set(type, handler)
    return this
  }

  fin(id) {
    if (id && 'object' === typeof id && id.id) {
      id = id.id
    }

    if ('string' === typeof id) {
      id = Buffer.from(id, 'hex')
    }

    this.push(new Fin(this.encoding, id).pack())
  }

  cancel(command) {
    this.fin(command)
  }

  onmessage(buffer) {
    const type = varint.decode(buffer)

    switch (type) {
      case Protocol.COMMAND:
        return this.oncommand(Command.from(buffer, this.encoding))

      case Protocol.RESPONSE:
        return this.onresponse(Response.from(buffer, this.encoding))

      case Protocol.FIN:
        return this.onfin(Fin.from(buffer, this.encoding))
    }

    if (this.extensions.has(type)) {
      const extension = this.extensions.get(type)
      if (extension && 'function' === typeof extension.decode) {
        const chunk = extension.decode(unpack(buffer))
        return this.onextension(type, chunk, buffer)
      }
    }

    this.emit('message', buffer)
  }

  onfin(fin) {
    const id = fin.id.toString('hex')
    if (this.pending.has(id)) {
      const req = this.pending.get(id)
      this.pending.delete(id)
      this.emit('fin', id, req)
    }
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
      } else {
        this.pending.set(id, req)
      }
    }

    const reply = (err, results) => {
      if (results && !Array.isArray(results)) {
        results = [ results ]
      }

      const { encode } = this.extensions.get(type)
      const id = req.id.toString('hex')

      if (this.pending.has(id)) {

        if (err) {
          this.push(pack(type, encode({ id: req.id, error: err })))
        }

        if (results) {
          for (const result of results) {
            result.id = result.id || req.id
            this.push(pack(type, encode(result)))
          }
        }
        return true
      }

      return false
    }

    this.emit('extension', req, type, buffer, reply)
  }

  oncommand(command) {
    const id = command.id.toString('hex')
    const reply = (err, results) => {
      if (undefined !== results && !Array.isArray(results)) {
        results = [ results ]
      }

      const response = new Response(this.encoding, command, err, results)
      const buffer = response.pack()

      if (this.pending.has(id)) {
        process.nextTick(() => this.push(buffer))
        return true
      }

      return false
    }

    this.pending.set(id, command)
    this.emit('command', command, reply)
    this.emit(`command:${hash(command.name)}`, command, reply)
  }

  onresponse(res) {
    const id = res.id.toString('hex')
    const request = this.pending.get(id)
    if (request) {
      const { callback } = request

      if (!this.readStreams.has(id)) {
        this.pending.delete(id)
        process.nextTick(() => {
          this.fin(res.id)
        })
      }

      if ('function' === typeof callback) {
        callback(res.error, res.results)
      }
    }
  }
}

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest()
    .toString('hex')
}

module.exports = {
  Protocol
}
