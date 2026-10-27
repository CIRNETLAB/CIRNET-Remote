'use strict'
// Observational, one-shot diagnostic. Never an acceptance runner or product edit.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const root = path.resolve(__dirname, '..')
const modes = new Set(['A', 'B', 'C'])
const baseline = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

function selectArgs(args, mode) {
  if (!modes.has(mode)) throw new Error('GPU diagnostic mode must be A, B or C')
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('Missing pinned launch arguments')
  for (const flag of baseline) if (args.filter(arg => arg === flag).length !== 1) throw new Error('Pinned baseline GPU arguments changed')
  if (args.some(arg => !baseline.includes(arg) && !arg.startsWith('--log-file='))) throw new Error('Unexpected diagnostic launch argument')
  if (args.filter(arg => arg.startsWith('--log-file=')).length !== 1) throw new Error('Expected one owned browser log path')
  return mode === 'B' ? [...args, '--disable-gpu-compositing']
    : mode === 'C' ? args.map(arg => arg === '--use-angle=swiftshader' ? '--use-angle=swiftshader-webgl' : arg)
      : [...args]
}

function allocator() {
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'integration/contracts-version.json'))).dev
  const directory = path.join(root, '.build/contracts-tools')
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'allocator.json')))
  const resource = path.join(directory, 'allocator.mjs')
  if (metadata.name !== pin.name || metadata.version !== pin.version || metadata.sha256 !== pin.node_sha256 ||
      crypto.createHash('sha256').update(fs.readFileSync(resource)).digest('hex') !== pin.node_sha256) throw new Error('Pinned canonical allocator unavailable')
  // Node22 supports synchronous require of this canonical ESM resource (no TLA).
  return require(resource)
}

function output(mode) {
  if (!modes.has(mode)) throw new Error('GPU diagnostic mode must be A, B or C')
  const api = allocator()
  const context = JSON.parse(process.env.NETCIRCUIT_ARTIFACTS_CONTEXT || 'null')
  if (!context || !process.env.NETCIRCUIT_ARTIFACTS_SESSION) throw new Error('Explicit owned artifact context/session required')
  const session = api.getArtifactDirectory('', { context })
  const directory = api.getArtifactDirectory('gpu-diagnostic', { context })
  return { api, context, session, directory }
}

function within(parent, child) {
  const relative = path.relative(parent, child)
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)
}

function browserObserver() {
  const emit = value => {
    const send = globalThis.__netcircuitGpuDiagnostic
    if (typeof send === 'function') void send({ ...value, now: performance.now(), timeOrigin: performance.timeOrigin }).catch(() => {})
  }
  const seen = new WeakSet()
  const originalContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const result = originalContext.apply(this, args)
    if (result && ['webgl', 'webgl2', 'experimental-webgl'].includes(args[0]) && !seen.has(result)) {
      seen.add(result)
      const extension = result.getExtension('WEBGL_debug_renderer_info')
      emit({ type: 'webgl-context', version: result.getParameter(result.VERSION),
        renderer: result.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : result.RENDERER),
        depthBits: result.getParameter(result.DEPTH_BITS), width: result.drawingBufferWidth,
        height: result.drawingBufferHeight, dpr: devicePixelRatio })
    }
    return result
  }
  for (const Constructor of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!Constructor || !Object.prototype.hasOwnProperty.call(Constructor.prototype, 'readPixels')) continue
    const original = Constructor.prototype.readPixels
    Constructor.prototype.readPixels = function (...args) {
      const start = performance.now()
      try { return original.apply(this, args) }
      finally { emit({ type: 'readPixels', startTime: start, durationMs: performance.now() - start, width: args[2], height: args[3] }) }
    }
  }
  if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) emit({ type: 'longtask', durationMs: entry.duration, startTime: entry.startTime })
    })
    observer.observe({ type: 'longtask', buffered: true })
  }
}

function activate() {
  const mode = process.env.NETCIRCUIT_GPU_DIAGNOSTIC_MODE
  if (process.platform !== 'linux' && process.env.NETCIRCUIT_GPU_DIAGNOSTIC_SMOKE !== '1') throw new Error('Linux-only diagnostic; explicit local smoke required elsewhere')
  const owned = output(mode)
  const configured = process.env.NETCIRCUIT_INTERFACE_ROOT
  if (!configured || !path.isAbsolute(configured)) throw new Error('Explicit installed Interface root required')
  const product = fs.realpathSync(configured)
  const productRequire = createRequire(path.join(product, 'package.json'))
  for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
    if (productRequire(name + '/package.json').version !== '1.64.1') throw new Error('Playwright identity differs from pinned diagnostic')
  }
  const playwright = productRequire('playwright')
  const core = productRequire('playwright-core')
  if (playwright.chromium !== core.chromium || typeof core.chromium.launch !== 'function') throw new Error('Playwright singleton mismatch')
  const chromium = core.chromium
  const marker = Symbol.for('netcircuit.gpu-diagnostic')
  if (chromium.launch[marker]) throw new Error('Chromium launch already patched')
  const append = value => fs.appendFileSync(path.join(owned.directory, `events-${process.pid}.jsonl`),
    JSON.stringify({ mode, pid: process.pid, wallTime: new Date().toISOString(), ...value }) + '\n')
  const write = (name, value) => fs.writeFileSync(path.join(owned.directory, name), JSON.stringify(value, null, 2) + '\n')
  const contexts = new WeakSet(), pages = new WeakSet()
  function instrumentPage(page) {
    if (pages.has(page)) return
    pages.add(page)
    const screenshot = page.screenshot.bind(page)
    page.screenshot = async (...args) => {
      const start = performance.now(); append({ type: 'screenshot-start' })
      try { const result = await screenshot(...args); append({ type: 'screenshot-end', durationMs: performance.now() - start }); return result }
      catch (error) { append({ type: 'screenshot-error', durationMs: performance.now() - start, errorName: error.name }); throw error }
    }
  }
  async function instrumentContext(context) {
    if (contexts.has(context)) return
    contexts.add(context)
    await context.exposeBinding('__netcircuitGpuDiagnostic', (_source, value) => {
      const types = new Set(['readPixels', 'longtask', 'webgl-context'])
      if (!value || !types.has(value.type)) throw new Error('Unexpected diagnostic event')
      const clean = { type: value.type }
      for (const key of ['now', 'timeOrigin', 'durationMs', 'startTime', 'width', 'height', 'dpr', 'depthBits']) if (Number.isFinite(value[key])) clean[key] = value[key]
      for (const key of ['renderer', 'version']) if (typeof value[key] === 'string') clean[key] = value[key].slice(0, 1000)
      append(clean)
    })
    await context.addInitScript(browserObserver)
    context.on('page', instrumentPage)
    for (const page of context.pages()) instrumentPage(page)
  }
  const original = chromium.launch.bind(chromium)
  let sequence = 0
  async function launch(options = {}) {
    let browser, monitor
    try {
      const defaults = playwright._defaultLaunchOptions || {}
      const effective = { ...defaults, ...options }
      if (effective.executablePath || effective.channel || effective.ignoreDefaultArgs || effective.headless === false) throw new Error('Non-pinned browser launch selection')
      // Common to every arm solely for Browser.getBrowserCommandLine access.
      // It is instrumentation, never the renderer/compositor comparison variable.
      const args = [...selectArgs(effective.args, mode), '--enable-automation']
      const log = args.find(arg => arg.startsWith('--log-file=')).slice('--log-file='.length)
      owned.api.validateArtifactDirectory(path.dirname(log), { context: owned.context })
      if (!path.isAbsolute(log) || !within(owned.session, path.resolve(log))) throw new Error('Browser log is not session-owned')
      const runtime = process.env.PLAYWRIGHT_BROWSERS_PATH
      if (!runtime || !path.isAbsolute(runtime) || !/^br-[0-9a-f]{8}$/i.test(path.basename(runtime))) throw new Error('Owned copied browser runtime required')
      owned.api.validateArtifactDirectory(runtime, { context: owned.context })
      if (!within(owned.session, fs.realpathSync(runtime))) throw new Error('Browser runtime is not an owned copy')
      browser = await original({ ...options, args })
      const cdp = await browser.newBrowserCDPSession()
      const commandLine = await cdp.send('Browser.getBrowserCommandLine')
      const gpu = await cdp.send('SystemInfo.getInfo')
      const executable = commandLine.arguments[0]
      if (!executable || !path.isAbsolute(executable) || !within(fs.realpathSync(runtime), fs.realpathSync(executable))) throw new Error('Actual Chromium executable escaped owned runtime')
      const actual = commandLine.arguments
      for (const flag of args) if (!actual.includes(flag)) throw new Error('Chromium did not receive diagnostic arguments')
      const id = `${process.pid}-${++sequence}`
      write(`launch-${id}.json`, { diagnosticOnly: true, guard: 'PASS', mode, singleton: true,
        platform: process.platform, playwright: '1.64.1', browserVersion: browser.version(), args,
        commonIntrospectionArguments: ['--enable-automation'], actualArguments: actual, executable,
        executableSha256: crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
        runtime, gpu, product })
      await cdp.detach()
      if (process.platform === 'linux') {
        write(`host-${id}.json`, { lscpu: execFileSync('lscpu', ['--json'], { encoding: 'utf8' }) })
        const sample = () => {
          const cgroup = {}
          for (const name of ['cpu.max', 'cpu.stat', 'memory.current', 'memory.max', 'memory.events']) {
            const file = '/sys/fs/cgroup/' + name
            if (fs.existsSync(file)) cgroup[name] = fs.readFileSync(file, 'utf8')
          }
          append({ type: 'host-sample', processes: execFileSync('ps', ['-eo', 'pid,ppid,comm,pcpu,rss', '--no-headers'], { encoding: 'utf8' }), cgroup })
        }
        sample(); monitor = setInterval(sample, 1000); monitor.unref()
        browser.on('disconnected', () => clearInterval(monitor))
      }
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (...args) => { const context = await newContext(...args); await instrumentContext(context); return context }
      const newPage = browser.newPage.bind(browser)
      browser.newPage = async (...args) => { const page = await newPage(...args); await instrumentContext(page.context()); instrumentPage(page); return page }
      return browser
    } catch (error) {
      clearInterval(monitor); append({ type: 'launch-guard-failure', errorName: error.name, message: error.message })
      if (browser) await browser.close().catch(() => {})
      throw error
    }
  }
  launch[marker] = true
  chromium.launch = launch
  if (productRequire('playwright-core').chromium.launch !== launch) throw new Error('Actual singleton launch hook was not installed')
}

if (require.main === module) {
  if (process.argv[2] === '--self-check') {
    const args = [...baseline, '--log-file=/owned/browser.log']
    if (JSON.stringify(selectArgs(args, 'A')) !== JSON.stringify(args) || !selectArgs(args, 'B').includes('--disable-gpu-compositing') || !selectArgs(args, 'C').includes('--use-angle=swiftshader-webgl')) throw new Error('Argument matrix self-check failed')
    for (const [candidate, mode] of [[args, 'unknown'], [[...args, '--disable-webgl'], 'A'], [[], 'A']]) {
      let failed = false; try { selectArgs(candidate, mode) } catch { failed = true }
      if (!failed) throw new Error('Invalid launch was admitted')
    }
    console.log('Diagnostic argument and fail-closed checks PASS; no browser launched')
  } else if (process.argv[2] === '--verify') {
    const mode = process.argv[3], owned = output(mode)
    const launches = fs.readdirSync(owned.directory).filter(name => /^launch-\d+-\d+\.json$/.test(name)).map(name => JSON.parse(fs.readFileSync(path.join(owned.directory, name))))
    const events = fs.readdirSync(owned.directory).filter(name => /^events-\d+\.jsonl$/.test(name)).flatMap(name => fs.readFileSync(path.join(owned.directory, name), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)))
    if (!launches.length || launches.some(item => item.mode !== mode || item.guard !== 'PASS' || item.singleton !== true) || events.some(item => item.type === 'launch-guard-failure')) throw new Error('Diagnostic launch guard receipt missing or failed')
    const webgl = events.filter(item => item.type === 'webgl-context')
    if (!webgl.length || webgl.some(item => !item.renderer.includes('SwiftShader'))) throw new Error('Actual page SwiftShader evidence missing')
    if (![1, 2].every(dpr => webgl.some(item => item.dpr === dpr && item.version.includes('WebGL 2')))) throw new Error('Both original DPR contexts were not observed')
    const readbacks = events.filter(item => item.type === 'readPixels')
    if (!readbacks.length) throw new Error('Native readPixels profile was not observed')
    console.log(JSON.stringify({ diagnosticOnly: true, mode, launches: launches.length, webglContexts: webgl.length, readbacks: readbacks.length, guard: 'PASS' }))
  } else throw new Error('Use NODE_OPTIONS=--require=ABSOLUTE_PRELOADER; direct commands are --self-check or --verify MODE')
} else activate()
