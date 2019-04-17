rpc-protocol
============

Create and run commands over a RPC protocol stream

## Installation

```sh
$ npm install rpc-protocol
```

## Usage

Echo server over web sockets:

```js
const WebSocketServer = require('simple-websocket/server')
const protocol = require('rpc-protocol')
const server = new WebSocketServer({ port: 3000 })

server.on('connection', onconnection)

function onconnection(socket) {
  const rpc = protocol({ stream: socket })
  rpc.command('echo', (req) => {
    return req.arguments
  })
}
```

Echo client over web sockets

```js
const WebSocket = require('simple-websocket')
const protocol = require('rpc-protocol')
const socket = new WebSocket('ws://localhost:3000')

socket.on('connect', onconnect)

function onconnect() {
  const rpc = protocol({ stream: socket })
  rpc.call('echo', 'hello world', (err, res) => {
    console.log(res) // [ 'hello world' ]
  })
}

```

## API

### `rpc = require('rpc-protocol')(opts)`

Creates a new RPC protocol Duplex stream where `opts` can be:

* `opts.encoding` is an optional _encoding object_ that
  contains an `encode(value)` and `decode(buffer)` functions for
  converting values to and from buffers that can be sent over a binary
  stream
* `opts.stream` is an optional stream to pump data in and out of into
  the protocol stream

#### `rpc.command(commandName, callback)`

Create a callback for a command given by the string `commandName` that
is called when `rpc.call(commandName, ...)` is called from the client
and where `callback` contains a command request object. Results can be
returned to the caller by returning a value, which can be a `Promise`.

##### Example

Below is a simple example of a command that proxies a `fetch()` call over
the stream. The caller would simply need to call `rpc.call('fetch',
['https://github.com', { mode: 'cors' }, ], callback)`.

```js
rpc.command('fetch', async (req) => {
  const [ resource, init ] = req.arguments
  return fetch(resource, init).then(async (res) => {
    return {
      arrayBuffer: Buffer.from(await res.clone().arrayBuffer),
      text: Buffer.from(await res.clone().text),
      json: Buffer.from(await res.clone().json),

      statusText: res.statusText,
      redirected: res.redirected,
      bodyUsed: res.bodyUsed,
      headers: res.headers,
      status: res.status,
      type: res.type,
      url: res.url,
      ok: res.ok,
    }
  })
})
```

#### Command Streams

Commands can stream responses by to the client by making use of the
second argument given to the command callback called `reply(err, results)`.
It is a function that accepts an optional error and an array of results to
send back to the client.

Below is an example of a simple counter stream. Given a `start` and
`end` range with an `interval` the command will reply with an
incremented `i` value at some `interval`.


```js
rpc.command('counter', (req, reply) => {
  const [ start, end, interval = 100] = req.arguments
  let i = start

  ontick()

  function ontick() {
    if (i <= end) {
      // reply returns true that means we can write again
      if (reply(null, i++)) {
        setTimeout(ontick, interval)
      }
    } else {
      // signal end of stream
      reply(null, null)
    }
  }
})
```

##### `didWrite = reply(err, response)`

The `reply()` function replies to the caller with an error `err` and an
array of results as a `response`. The command can continue to call this
function with more results or errors. The return value of the `reply`
function will indicate if the stream is still open to write to.

#### `command = rpc.call(commandName, arguments, callback)`

A command can be invoked by calling `rpc.call()` with a command name
and an optional array of arguments along with a `callback(err, res)`
function that will be called when the command responds with a reply.
Response results are always given as an array as the command may
return more than value. A command can only throw one error at a time.

```js
rpc.call('echo', ['hello', 'world'], (err, res) => {
  if (err) {
    // handle Error
  } else {
    console.log(res) // ['hello', 'world']
  }
})
```

### `stream = rpc.createReadStream(command)`

Read streams can be created from an existing command. They are useful if
the command can reply with multiple values over a period of time.

```js
rpc.command('fs.createReadStream', (req, reply) => {
  const [ path ] = req.arguments
  const stream = fs.createReadStream(path)
  stream.on('data', (data) => reply(null, data))
  stream.on('end', () => reply(null, null)) // 'null' signals end of stream
})

const command = rpc.call('fs.createReadStream', ['/path/to/file.txt'])
const stream = rpc.createReadStream(command)
const chunks []

stream.on('data', (data) => { chunks.push(data) })
stream.on('end', () => console.log(Buffer.concat(chunks).toString()))
```

### `rpc.send(...)`

`rpc.send()` is the low level function that makes a request for an
existing command, an extension, or an arbitrary buffer.

#### Sending An Extension

Sending an extension message requires you use the extension type and some
value that the extension encodes.

```js
rpc.send(EXTENSION_TYPE, 'some value', (err, res) => {
  // called when extension replies with a response
})
```

#### Sending A Command

Sending a command requires you create an instance of `Command` with an
encoding, command name, array of arguments, and a callback that is
called when the command replies with a response

```js
const command = new Command(rpc.encoding, 'echo', ['hello'], (err, res) => {
  // called when the command replies with a response
})

rpc.send(command.id, command, command.pack())
```

#### Sending An Arbitrary Message

Sending an arbitrary message is possible but replies cannot be linked to
the sent message and there is no guarantee that the message was read.

```js
rpc.send(Buffer.from('hello'), (err) => {
  // It is impossible for a reply as this is an arbitrary message
})
```

### `rpc.cancel(command)`

An alias to `rpc.fin(command)`.

### `rpc.fin(command)`

Send a `Fin` packet to the stream tied to the command request.

```js
const command = rpc.call('echo', ['hello', 'world'], console.log)
rpc.fin(command)
```

### `rpc.extension(extensionType, encoding)`

Extensions provide a way to extend the protocol with user supplied
binary encodings. The `rpc.extension(extensionType, encoding)` function
accepts an integer `extensionType` and an `encoding` object that
contains `encode(value)` and `decode(buffer)` functions for encoding
values to and from buffers.

Extensions can be used by making use of the `rpc.send()` function that
expects an `extensionType`, an array of arguments that will be encoded
by the extension encoding and a callback that will be called when the
extension replies with a response.

#### Extension Wire Interface

Extensions **must** provide a way of encoding an `id` into the extension
encoding which must be available after `decode(buffer)` is called on
the return value. The `id` is used internally to track requests and
response from callers.

If an extension provides a way to encode and decode `Error` properties,
then they will be propagated to the `err` argument in the `reply(err)`
function.

#### Example Extension

```js
const keyPair = require('hypercore-crypto')
const pbs = require('protocol-buffers')
const KEY_PAIR_EXTENSION = 0xfed
const { KeyPair } = pbc(`
  message KeyPair {
    bytes id = 1;
    bytes publicKey = 2;
    bytes secretKey = 3;
  }
`)

const server = protocol()
const client = protocol()

server.extension(KEY_PAIR_EXTENSION, KeyPair)
client.extension(KEY_PAIR_EXTENSION, KeyPair)

server.on('extension', (req, type, buffer, reply) => {
  if (KEY_PAIR_EXTENSION === type) {
    reply(null, keyPair())
  }
})

client.send(KEY_PAIR_EXTENSION, (err, res) => {
  console.log(res) // { publicKey: <Buffer ...>, secretKey: <Buffer ...>
})
```

## License

MIT
