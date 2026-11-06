import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [interfaceTools, staticRoot, origin, api, lane] = process.argv.slice(2)
const require = createRequire(join(interfaceTools, 'package.json'))
const { chromium, expect } = require('@playwright/test')
const { preview } = await import(pathToFileURL(require.resolve('vite')).href)
const workload = JSON.parse(await readFile(join(lane, 'workload.json'), 'utf8'))
const address = new URL(origin)
const server = await preview({
  configFile: false,
  root: staticRoot,
  build: { outDir: '.' },
  preview: {
    host: address.hostname,
    port: Number(address.port),
    strictPort: true,
    proxy: { '/api': api, '/ws': { target: api.replace(/^http:/, 'ws:'), ws: true } },
  },
})

let browser
let page
const errors = []
try {
  browser = await chromium.launch({ args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing',
  ] })
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } })
  page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/') && response.status() >= 400) {
      console.error(`Browser API ${response.request().method()} ${path} → ${response.status()}`)
    }
  })
  const button = name => page.getByRole('button', { name, exact: true })
  const label = name => page.getByLabel(name, { exact: true })
  const isPost = (response, path) => response.request().method() === 'POST' && path.test(new URL(response.url()).pathname)

  assert.equal((await page.goto('/')).status(), 200)
  await expect(label('Three-dimensional circuit workspace')).toBeVisible()
  await button('Open account').click()
  await label('Username').fill('e2e_admin')
  await label('Password').fill(process.env.CIRNET_BROWSER_PASSWORD)
  const [login] = await Promise.all([
    page.waitForResponse(response => isPost(response, /^\/api\/auth\/login$/)),
    button('Sign in').click(),
  ])
  assert.equal(login.status(), 200)
  await expect(button('Sign out')).toBeVisible()
  await button('Close account').click()

  await label('Open circuit file').setInputFiles({
    name: 'and.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workload.graph)),
  })
  await expect(page.locator('.project-title')).toContainText(workload.graph.metadata.name)
  await button('Open Inspector').click()
  await expect(page.locator('.window-note').filter({ hasText: /^Events: connected\./ })).toBeVisible()
  const configuration = workload.configuration
  for (const [name, value] of Object.entries({
    'Capture duration (ns)': configuration.duration_ns,
    'Capture signals': configuration.signals.join(','),
    'Capture maximum events': configuration.max_events,
  })) {
    await label(name).fill(String(value))
    await label(name).press('Tab')
  }
  const [vector] = workload.vectors
  await label('Test vector time (ns)').fill(String(vector.time_ns))
  await label('Test vector inputs').fill(Object.entries(vector.inputs).map(([name, value]) => `${name}=${value}`).join(','))
  await button('Add test vector').click()
  await button('Close Inspector').click()

  await page.getByRole('tab', { name: 'Run', exact: true }).click()
  const [create, run] = await Promise.all([
    page.waitForResponse(response => isPost(response, /^\/api\/(?:v2\/)?experiments$/)),
    page.waitForResponse(response => isPost(response, /^\/api\/(?:v2\/)?experiments\/[^/]+\/run$/)),
    page.getByRole('toolbar', { name: 'Execution controls', exact: true }).getByRole('button', { name: 'Run', exact: true }).click(),
  ])
  assert.equal(create.status(), 201)
  const submitted = create.request().postDataJSON()
  assert.deepEqual(submitted.capture_config, configuration)
  assert.deepEqual(submitted.test_vectors, workload.vectors)
  const { experiment_id: experimentId } = await create.json()
  assert.ok(run.ok(), `Run status ${run.status()}`)
  const experiment = `/api/experiments/${experimentId}`
  let record
  await expect.poll(async () => {
    record = await (await context.request.get(experiment)).json()
    return record.state
  }, { timeout: 20000 }).toBe('COMPLETE')
  assert.equal(record.capture.available, true)

  await button('File').click()
  await page.getByRole('menu', { name: 'File', exact: true }).getByRole('menuitem', { name: 'History', exact: true }).click()
  const history = page.getByRole('region', { name: 'Experiment history and queue', exact: true })
  await history.getByRole('button', { name: 'Refresh execution history', exact: true }).click()
  await history.getByRole('button', { name: `Read experiment ${experimentId}`, exact: true }).click()
  await history.getByRole('button', { name: 'Open selected capture', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Observed digital event traces', exact: true })).toBeVisible()
  const trace = page.locator('path.observed-trace[data-signal="G.Y1"]')
  await expect(trace).toHaveAttribute('d', /V8/)

  const capture = await context.request.get(`/api/captures/${record.capture.capture_id}/payload`, {
    headers: { Accept: 'application/vnd.cirnet.capture; version=1' },
  })
  assert.equal(capture.status(), 200)
  const bytes = await capture.body()
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'NCAP')
  const captureSha256 = createHash('sha256').update(bytes).digest('hex')
  assert.equal(bytes.length, record.capture.payload_byte_count)
  assert.equal(captureSha256, record.capture.sha256)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: join(lane, 'capture.png') })
  await writeFile(join(lane, 'result.json'), JSON.stringify({
    chromium: browser.version(), node: process.version, loginStatus: 200, createStatus: create.status(), runStatus: run.status(),
    eventsConnected: true, state: record.state, trace: await trace.getAttribute('d'),
    captureBytes: bytes.length, captureSha256,
  }, null, 2) + '\n')
} catch (error) {
  if (page) await page.screenshot({ path: join(lane, 'failure.png'), timeout: 3000 }).catch(() => {})
  throw error
} finally {
  try {
    if (browser) await browser.close()
  } finally {
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
  }
}
