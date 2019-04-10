const Socket = require('simple-websocket')
const { Protocol } = require('./')

const socket = new Socket('ws://localhost:3000')

socket.on('connect', () => {
  global.alice = new Protocol({ connect: () => socket })

  alice.call('hey joe!', [ 'argument' ], (message) => {
    console.log('got response!', message)
  })
})