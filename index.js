const serialization = require('./serialization')
const { Protocol } = require('./protocol')
const encoding = require('./encoding')

function createProtocol(opts) {
  return new Protocol(opts)
}

module.exports = Object.assign(createProtocol, {
  serialization,
  encoding,
  Protocol,
})
