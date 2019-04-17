const serializeError = require('serialize-error')
const dateRegex = require('regex-iso-date')()

function serialize(value) {
  if (null === value) {
    return null
  }

  switch (typeof value) {
    case 'boolean':
    case 'string':
    case 'number':
      return value
  }

  if (Array.isArray(value)) {
    return value.map(serialize)
  }

  if (value instanceof Error) {
    return serializeError(value)
  }

  if (
    'object' === typeof value && (
      value instanceof Set ||
      'function' === typeof value[Symbol.iterator]
    )
  ) {
    return serialize(Array.from(value))
  }

  if (
    value instanceof Map || (
      'object' === typeof value &&
      'function' === typeof value.entries
    )
  ) {
    const entries = Array.from(value.entries())
    const reduce = (o, kv) => Object.assign({ [kv[0]]: kv[1] })
    return serialize(entries.reduce(reduce, {}))
  }

  if ('function' === typeof value) {
    const original = value
    const isAsync = value.toString().match(/^async\s+/)
    let string = value.toString().replace(/^async\s+/, '')
    if (!/^function/.test(string)) {
      if ('(' !== string.toString()[0]) {
        value = `${isAsync ? 'async ' : ''}function ${string}`
      }
    }


    try {
      const source = `return ${value.toString()}`
      return String(new Function(source))
    } catch (err) {
      return null
    }
  }

  try {
    if ('object' === typeof value) {
      const copy = value
      value = {}
      for (const k in copy) {
        value[k] = serialize(copy[k])
      }
    }
  } catch (err) {
    return null
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

    if ((24 === value.length || 27 === value.length) && dateRegex.test(value)) {
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
