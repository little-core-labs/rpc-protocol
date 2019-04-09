const { Protocol } = require('./')

const client = new Protocol()

const server = new Protocol()

client.pipe(server).pipe(client)

client.call('hey joe!', [ 'argument' ], console.log)

server.command('hey joe!', (command, reply) => {
  reply(null, null)
  console.log(command)
})