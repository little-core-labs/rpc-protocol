const Server = require('simple-websocket/server')
const { Protocol, unserialize } = require('./')

const server = new Server({ port: 3000 })

server.on('connection', (socket) => {
  global.bob = new Protocol({ connect: () => socket })

  bob.command('hey joe!', (command) => {
    console.log('got command', command)
    return [ 'result', 1000 ]
  })

  bob.command('yo', (command, reply) => {
    console.log('got command', command)
    reply({ name: 'BigError', code: '4000', message: 'you dun goofed'})
  })
})
