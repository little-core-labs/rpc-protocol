const { Protocol, unserialize } = require('./')
const through = require('through2')
const Server = require('simple-websocket/server')
const fs= require('fs')

const server = new Server({ port: 3000 })

server.on('connection', (socket) => {
  global.bob = new Protocol({ connect: () => socket })

  bob.command('stream', () => {
    return fs.createReadStream('./package.json')
  })

  bob.command('iterator', () => {
    return new Set([1,2,3,4,5]).values()
    //return new Set(['a','b','c']).values()
  })

  bob.command('hey joe!', (command) => {
    console.log('got command', command)
    return [ 'result', 1000 ]
  })

  bob.command('yo', (command, reply) => {
    console.log('got command', command)
    reply({ name: 'BigError', code: '4000', message: 'you dun goofed'})
  })
})
