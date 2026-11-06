import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [mode, interfaceRoot, assetRoot, origin, backend, lane] = process.argv.slice(2)
const address = new URL(origin)
const upstream = new URL(backend)
if (origin !== 'http://127.0.0.1:14173' || upstream.origin !== backend ||
    upstream.hostname !== '127.0.0.1' || upstream.protocol !== 'http:') {
  throw new Error('Interface test requires exact loopback origins')
}
const require = createRequire(join(interfaceRoot, 'package.json'))
const { createServer, preview } = await import(pathToFileURL(require.resolve('vite')).href)
const host = address.hostname
const port = Number(address.port)
const proxy = { '/api': backend, '/ws': { target: backend.replace(/^http:/, 'ws:'), ws: true } }
let close
if (mode === 'static') {
  const server = await preview({
    configFile: false,
    root: assetRoot,
    cacheDir: join(lane, 'vite-cache'),
    build: { outDir: '.' },
    preview: { host, port, strictPort: true, proxy },
  })
  close = () => new Promise((resolve, reject) =>
    server.httpServer.close(error => error ? reject(error) : resolve()))
} else if (mode === 'source') {
  process.env.CIRNET_DEV_API_TARGET = backend
  const server = await createServer({
    root: interfaceRoot,
    configLoader: 'runner',
    envDir: false,
    cacheDir: join(lane, 'vite-cache'),
    server: { host, port, strictPort: true, proxy },
  })
  await server.listen()
  close = () => server.close()
} else {
  throw new Error('Unexpected Interface asset mode')
}
console.log('CIRNET_BROWSER_READY')
try {
  for await (const _ of process.stdin) {}
} finally {
  await close()
}
