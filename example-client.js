const { Protocol, unserialize } = require('./')
const Socket = require('simple-websocket')

const socket = new Socket('ws://localhost:3000')

socket.on('connect', () => {
  global.alice = new Protocol({ connect: () => socket })

  alice.call('hey joe!', [ 'argument1', 2, { "property": 3 } ], (response) => {
    const result = response.error ? response.error.message : response.results.length ? unserialize(response.results) : []
    console.log(response.error ? `got error :( ${response.error.name}` : 'got response', response.name, result)
  })

  alice.call('yo', [], (response) => {
    const result = response.error ? response.error.message : response.results.length ? unserialize(response.results) : []
    console.log(response.error ? `got error :( ${response.error.name}` : 'got response', response.name, result)
  })
})