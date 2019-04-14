const serializeError = require('serialize-error')
const dateRegex = require('regex-iso-date')()

function serialize(value) {
  if (Array.isArray(value)) {
    return value.map(serialize)
  }

  if (value instanceof Error) {
    return serializeError(value)
  }

  if (value instanceof Set) {
    return Array.from(value)
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).reduce((o, kv) => Object.assign({
      [kv[0]]: kv[1]
    }), {})
  }

  if ('function' === typeof value) {
    if ('function' !== value.toString().slice(0, 8)) {
      if ('(' !== value.toString()[0]) {
        value = `function ${value}`
      }
    }

    return String(new Function(`return ${value.toString()}`))
  }

  return value
}

function deserialize(value) {
  if (Array.isArray(value)) {
    return value.map(deserialize)
  }

  if (null !== value && 'object' === typeof value) {
    if ('Buffer' === value.type && Array.isArray(value.data)) {
      return Buffer.from(value)
    }

    if ('name' in value && 'message' in value) {
      const error = new Error(value.message)
      Object.assign(error, value)
      return error
    }
  }

  if ('string' === typeof value) {
    if ('null' === value) {
      return null
    }

    if (dateRegex.test(value)) {
      return new Date(Date.parse(value))
    }

    if ('function' === value.slice(0, 8)) {
      const holder = new Function(`return ${value}`)
      return holder()()
    }
  }

  return value
}

module.exports = {
  deserialize,
  serialize
}
