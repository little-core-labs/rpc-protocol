const serialization  = require('./serialization')
const { Protocol } = require('./protocol')
const encoding = require('./encoding')
const { Duplex } = require('readable-stream')
const equals = require('deep-equal')
const varint = require('varint')
const test = require('tape')
const pbs = require('protocol-buffers')

test('serialization', (t) => {
  t.plan(1)
  const args = ['arg1', 2, { property: 3 }]
  const serialized = serialization.serialize(args)
  const deserialized = serialization.deserialize(serialized)
  t.ok(equals(args, deserialized), 'serialization')
})

test('encoding', (t) => {
  t.end()
})

test('protocol response', (t) => {
  t.plan(4)
  const server = new Duplex({
    read() { },
    write(chunk, enc, done) {
      client.push(chunk)
      done(null)
    }
  })

  const client = new Duplex({
    read() { },
    write(chunk, enc, done) {
      server.push(chunk)
      done()
    }
  })

  const alice = new Protocol({ connect: () => client })

  const bob = new Protocol({ connect: () => server })

  const cmd = 'cmd'

  bob.command(cmd, (command, reply) => {
    t.equal(command.name, cmd, 'oncommand') // 1, 2
    reply(null, command.arguments)
  })

  const args1 = [ 'argument1' ]
  const args2 = [' argument1', 2, { property: 3 } ]

  alice.call(cmd, args1, (err, res) => {
    t.ok(equals(args1, serialization.deserialize(res)), 'onresponse1') // 3
  })

  alice.call(cmd, args2, (err, res) => {
    t.ok(equals(args2, serialization.deserialize(res)), 'onresponse2') // 4
  })
})

test('protocol error', (t) => {
  t.plan(6)

  const server = new Duplex({
    read() { },
    write(chunk, enc, done) {
      client.push(chunk)
      done(null)
    }
  })

  const client = new Duplex({
    read() { },
    write(chunk, enc, done) {
      server.push(chunk)
      done()
    }
  })

  const alice = new Protocol({ connect: () => client })

  const bob = new Protocol({ connect: () => server })

  const cmd = 'cmd'

  bob.command(cmd, (command, reply) => {
    if (0 === command.arguments.length) {
      t.equal(command.name, cmd, 'oncommand') // 1
      reply({ name: 'error1', code: '500', message: 'Expected 2 arguments; got 0' }, null)
    } else if (1 === command.arguments.length) {
      t.equal(command.name, cmd, 'oncommand') // 2
      reply({ name: 'error2', code: '500', message: 'Expected 2 arguments; got 1' }, null)
    } else if (3 === command.arguments.length) {
      t.equal(command.name, cmd, 'oncommand') // 3
      reply({}, null)
    }
  })

  alice.call(cmd, [ ], (err, res) => {
    t.equal('error1', err.name, 'onresponse1') // 4
  })

  alice.call(cmd, [ 'argument1' ], (err, res) => {
    t.equal('error2', err.name, 'onresponse2') // 5
  })

  alice.call(cmd, [ 'argument1', 'argument2', 'argument3' ], (err, res) => {
    t.equal('Error', err.name, 'onresponse3') // 6
  })
})

test('protocol extensions', (t) => {
  const alice = new Protocol()
  const bob = new Protocol()

  const EXTENSION = 0xEE
  const BINARY = 0xBB

  const { Extension, Binary } = pbs(`
  message Extension {
    bytes id = 1;
    bytes body = 2;
    Error error = 10;
    message Error {
      string name = 1;
      string message = 2;
      string stack = 3;
    }
  }
  `)

  alice.pipe(bob).pipe(alice)

  bob.command('echo', (req, reply) => {
    reply(null, req.arguments)
  })

  alice.call('echo', 'hello world', (err, res) => {
    t.equal(null, err)
    t.equal(res[0], 'hello world')
  })

  alice.extension(EXTENSION, Extension)
  bob.extension(EXTENSION, Extension)

  alice.extension(BINARY, Binary)
  bob.extension(BINARY, Binary)

  bob.on('extension', (extension, type, buffer, reply) => {
    if (EXTENSION === type) {
      const body = extension.body && extension.body.toString()
      if ('error' === body) {
        reply(new Error('oops'))
      } else if (body) {
        reply(null, { body: Buffer.from(body.toUpperCase()) })
      } else {
        reply(null)
      }
    }
  })

  alice.send(EXTENSION, { body: Buffer.from('hello') }, (err, res) => {
    t.equal(null, err)
    alice.send(EXTENSION, { body: Buffer.from('error') }, (err, res) => {
      t.true(err instanceof Error)
      t.equal('oops', err.message)
      t.end()
    })
  })
})
