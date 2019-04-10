function serialize(args) {
  return args.map(a => Buffer.isBuffer(a) ? a : Buffer.from(JSON.stringify(a)))
}

function unserialize(args) {
  return args.map(a => JSON.parse(a.toString()))
}

module.exports = {
  unserialize,
  serialize
}