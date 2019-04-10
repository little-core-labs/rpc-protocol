const { Protocol, serialize, unserialize } = require('./')
const { Duplex } = require('readable-stream')
const equals = require('deep-equal')
const test = require('tape')

test('serialization', (t) => {
  t.plan(1)
  const args = ['arg1', 2, { property: 3 }]
  const serialized = serialize(args)
  const unserialized = unserialize(serialized)
  t.ok(equals(args, unserialized), 'serialization1')
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
  const args2 = [' argument1', 'argument2' ]

  alice.call(cmd, args1, (res) => {
    t.ok(equals(args1, unserialize(res.results)), 'onresponse1') // 3
  })

  alice.call(cmd, args2, (res) => {
    t.ok(equals(args2, unserialize(res.results)), 'onresponse2') // 4
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

  alice.call(cmd, [ ], (res) => {
    t.equal(res.error.name, 'error1', 'onresponse1') // 4
  })

  alice.call(cmd, [ 'argument1' ], (res) => {
    t.equal(res.error.name, 'error2', 'onresponse2') // 5
  })

  alice.call(cmd, [ 'argument1', 'argument2', 'argument3' ], (res) => {
    t.equal(res.error.name, 'UnknownError', 'onresponse3') // 6
  })
})