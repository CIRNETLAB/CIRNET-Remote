import assert from 'node:assert/strict'
import { Console } from 'node:console'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createServer as createHttpServer, request } from 'node:http'
import type { Duplex } from 'node:stream'
import { Writable } from 'node:stream'
import { test } from 'node:test'
import { createLogger, createServer, type Logger, type ViteDevServer } from 'vite'
import appConfig from '../vite.config'

function recordingLogger(level: 'info' | 'error' | 'silent' = 'info') {
  const output: string[] = []
  const sink = new Writable({ write(chunk, _encoding, done) { output.push(String(chunk)); done() } })
  const logger = createLogger(level, { console: new Console({ stdout: sink, stderr: sink }), allowClearScreen: false })
  const calls: { method: 'error' | 'warn'; message: string; options: Parameters<Logger['error']>[1] }[] = []
  for (const method of ['error', 'warn'] as const) {
    const original = logger[method].bind(logger)
    logger[method] = (message, options) => { calls.push({ method, message, options }); original(message, options) }
  }
  return { logger, calls, output }
}

async function configuredServer(logger: Logger) {
  return createServer({
    ...appConfig, configFile: false, customLogger: logger,
    server: { ...appConfig.server, middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
}

function socketError(code = 'ECONNABORTED', syscall = 'write') {
  return Object.assign(new Error(`${syscall} ${code}`), { code, syscall })
}

test('Vite reports an aborted browser socket write as a visible warning without an error stack', async () => {
  const { logger, calls, output } = recordingLogger()
  const server = await configuredServer(logger)
  try {
    const error = socketError()
    const options = { error, timestamp: true, clear: false, environment: 'dev-proxy-test' }
    logger.error(`\u001b[31mws proxy socket error:\u001b[39m\n${error.stack}`, options)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'warn')
    assert.match(calls[0].message, /browser WebSocket.*ECONNABORTED/i)
    assert.doesNotMatch(calls[0].message, /\n|at /)
    assert.equal(calls[0].options?.timestamp, true)
    assert.equal(calls[0].options?.clear, false)
    assert.equal(calls[0].options?.environment, 'dev-proxy-test')
    assert.equal(logger.hasWarned, true)
    assert.equal(logger.hasErrorLogged(error), false)
    assert.ok(output.join('').includes('ECONNABORTED'))
  } finally { await server.close() }
})

test('Vite retains upstream failures, read failures, unknown causes and unrelated diagnostics unchanged', async () => {
  const { logger, calls } = recordingLogger()
  const server = await configuredServer(logger)
  try {
    const cases = [
      { prefix: 'ws proxy error:', error: socketError() },
      { prefix: 'http proxy error: /api/health', error: socketError('ECONNREFUSED', 'connect') },
      { prefix: 'ws proxy socket error:', error: socketError('ECONNABORTED', 'read') },
      { prefix: 'ws proxy socket error:', error: socketError('ECONNRESET') },
      { prefix: 'ws proxy socket error:', error: socketError('EPIPE') },
      { prefix: 'ws proxy socket error:', error: socketError('ECONNREFUSED', 'connect') },
      { prefix: 'ws proxy socket error:', error: new Error('write ECONNABORTED') },
      { prefix: 'compile failed:', error: socketError() },
      { prefix: 'ws proxy socket error:', error: undefined },
    ]
    for (const { prefix, error } of cases) {
      const message = `${prefix}\n${error?.stack ?? 'write ECONNABORTED'}`
      const options = { error, timestamp: true }
      logger.error(message, options)
      assert.deepEqual(calls.at(-1), { method: 'error', message, options })
      assert.equal(calls.at(-1)?.options, options)
      if (error) assert.equal(logger.hasErrorLogged(error), true)
    }
    assert.equal(calls.length, cases.length)
  } finally { await server.close() }
})

for (const level of ['error', 'silent'] as const) {
  test(`Vite preserves the resolved ${level} log level for browser write interruptions`, async () => {
    const { logger, output } = recordingLogger(level)
    const server = await configuredServer(logger)
    try {
      const error = socketError()
      logger.error(`ws proxy socket error:\n${error.stack}`, { error })
      assert.equal(output.join(''), '')
    } finally { await server.close() }
  })
}

test('actual Vite proxy survives browser write aborts, forwards denied handshakes and reports an unavailable API', { timeout: 15_000 }, async () => {
  const upstream = createHttpServer()
  const upstreamSockets = new Set<Duplex>()
  const browserSockets = new Set<Duplex>()
  const frontend = createHttpServer()
  const clients: WebSocket[] = []
  let server: ViteDevServer | undefined
  let deny = false
  upstream.on('upgrade', (req, socket) => {
    upstreamSockets.add(socket)
    socket.on('close', () => upstreamSockets.delete(socket))
    socket.on('error', () => {})
    socket.on('end', () => socket.end())
    if (deny) {
      socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      return
    }
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    const payload = Buffer.from('proxy-ready')
    socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]))
    socket.on('data', chunk => {
      if ((chunk[0] & 0x0f) === 8) socket.end(Buffer.from([0x88, 0]))
    })
  })
  try {
    upstream.listen(0, '127.0.0.1')
    await once(upstream, 'listening')
    const address = upstream.address()
    assert.ok(address && typeof address !== 'string')
    const { logger, calls } = recordingLogger()
    server = await createServer({
      ...appConfig, configFile: false, customLogger: logger,
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: { server: frontend }, hmr: false, watch: null, proxy: {
        '/ws': { target: `ws://127.0.0.1:${address.port}`, ws: true, configure(proxy) {
          proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
            browserSockets.add(socket)
            socket.on('close', () => browserSockets.delete(socket))
          })
        } },
      } },
    })
    frontend.on('request', server.middlewares)
    frontend.listen(0, '127.0.0.1')
    await once(frontend, 'listening')
    const proxyAddress = frontend.address()
    assert.ok(proxyAddress && typeof proxyAddress !== 'string')
    const url = `ws://127.0.0.1:${proxyAddress.port}/ws/events`
    async function connect() {
      const client = new WebSocket(url)
      clients.push(client)
      const [message] = await once(client, 'message', { signal: AbortSignal.timeout(3_000) })
      assert.equal((message as MessageEvent).data, 'proxy-ready')
      return client
    }
    const first = await connect()
    const downstream = [...browserSockets][0]
    const backendSocket = [...upstreamSockets][0]
    assert.ok(downstream && backendSocket)
    const browserClosed = once(first, 'close', { signal: AbortSignal.timeout(3_000) })
    const backendClosed = once(backendSocket, 'close', { signal: AbortSignal.timeout(3_000) })
    // Drive the actual Vite listener deterministically; OS-specific errno is not portable.
    downstream.destroy(socketError())
    await Promise.all([browserClosed, backendClosed])
    assert.equal(calls.filter(call => call.method === 'error').length, 0)
    assert.equal(calls.filter(call => call.method === 'warn' && call.message.includes('ECONNABORTED')).length, 1)

    const next = await connect()
    const nextClosed = once(next, 'close', { signal: AbortSignal.timeout(3_000) })
    next.close()
    await nextClosed

    deny = true
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(url.replace(/^ws:/, 'http:'), { signal: AbortSignal.timeout(3_000), headers: {
        Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.alloc(16).toString('base64'),
      } })
      req.once('response', res => { res.resume(); resolve(res.statusCode) })
      req.once('error', reject)
      req.end()
    })
    assert.equal(status, 403)

    for (const socket of upstreamSockets) socket.destroy()
    await new Promise<void>(resolve => upstream.close(() => resolve()))
    const unavailable = new WebSocket(url)
    clients.push(unavailable)
    await once(unavailable, 'error', { signal: AbortSignal.timeout(3_000) })
    assert.ok(calls.some(call => call.method === 'error' && /ws proxy error:/.test(call.message)
      && (call.options?.error as NodeJS.ErrnoException)?.code === 'ECONNREFUSED'))
  } finally {
    for (const client of clients) client.close()
    for (const socket of browserSockets) socket.destroy()
    for (const socket of upstreamSockets) socket.destroy()
    await server?.close()
    if (frontend.listening) await new Promise<void>(resolve => frontend.close(() => resolve()))
    if (upstream.listening) await new Promise<void>(resolve => upstream.close(() => resolve()))
  }
})
