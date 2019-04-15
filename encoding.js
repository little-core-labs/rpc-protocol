const { deserialize, serialize } = require('./serialization')
const jitson = require('jitson')

const parse = jitson()

const isPlainObject = (value) => null !== value &&
  'object' === typeof value &&
  'object' === typeof Object.getPrototypeOf(value) &&
  Object === value.constructor

encode.bytes = 0
decode.bytes = 0

function encode(value, buffer, offset) {
  const encoded = JSON.stringify(map(value))
  const size = encoded.length

  if (!offset || 'number' !== typeof offset) {
    offset = 0
  }

  if (!buffer) {
    buffer = Buffer.alloc(size)
  }

  if (offset + size > buffer.length) {
    throw new RangeError(`Cannot write to buffer at offset: ${offset}`)
  }

  encode.bytes = buffer.write(encoded, offset, size, 'utf8')

  return buffer

  function map(value) {
    if (Array.isArray(value)) {
      return value.map(map)
    }

    value = serialize(value)

    if (isPlainObject(value)) {
      return Object.keys(value).reduce(reduce, {})
    }

    return value

    function reduce(object, key) {
      object[key] = map(value[key])
      return object
    }
  }
}

function decode(buffer, offset) {
  if (!offset || 'number' !== typeof offset) {
    offset = 0
  }

  try {
    return map(parse(buffer.slice(offset).toString('utf8')))
  } catch (err) {
    return map(buffer.slice(offset).toString('utf8'))
  }

  return decoded

  function map(value) {
    if (Array.isArray(value)) {
      return value.map(map)
    }

    value = deserialize(value)

    if (isPlainObject(value)) {
      return Object.keys(value).reduce(reduce, {})
    }

    return value

    function reduce(object, key) {
      object[key] = map(value[key])
      return object
    }
  }
}

module.exports = {
  decode,
  encode,
  parse,
}
