const Server = require('simple-websocket/server')
const { Protocol } = require('./')

const server = new Server({ port: 3000 })

server.on('connection', (socket) => {
  global.bob = new Protocol({ connect: () => socket })

  bob.command('hey joe!', (command, reply) => {
    console.log('got command', command)
    reply(null, [ 'results1', 'results2' ])
  })
})