const test = require('tape')
const { Protocol } = require('./')

test('protocol response', (t) => {
  t.plan(4)
  const client = new Protocol()

  const server = new Protocol()

  client.pipe(server).pipe(client)

  server.command('cmd', (command, reply) => {
    t.ok(command, 'oncommand') // 1, 2
    reply(null, command.arguments)
  })

  client.call('cmd', [ 'argument1' ], (res) => {
    t.equal(res.length, 1, 'onresponse1') // 3
  })

  client.call('cmd', [ 'argument1', 'argument2' ], (res) => {
    t.equal(res.length, 2, 'onresponse2') // 4
  })
})

test('protocol error', (t) => {
  t.plan(6)
  const client = new Protocol()

  const server = new Protocol()

  client.pipe(server).pipe(client)

  server.command('cmd', (command, reply) => {
    if (0 === command.arguments.length) {
      t.ok(command, 'oncommand1') // 1
      reply({ name: 'error1', code: '500', message: 'Expected 2 arguments; got 0' }, null)
    } else if (1 === command.arguments.length) {
      t.ok(command, 'oncommand2') // 2
      reply({ name: 'error2', code: '500', message: 'Expected 2 arguments; got 1' }, null)
    } else if (3 === command.arguments.length) {
      t.ok(command, 'oncommand3') // 3
      reply({}, null)
    }
  })

  client.call('cmd', [ ], (res) => {
    t.equal(res.name, 'error1', 'onresponse1') // 4
  })

  client.call('cmd', [ 'argument1' ], (res) => {
    t.equal(res.name, 'error2', 'onresponse2') // 5
  })

  client.call('cmd', [ 'argument1', 'argument2', 'argument3' ], (res) => {
    t.equal(res.name, 'UnknownError', 'onresponse3') // 6
  })
})