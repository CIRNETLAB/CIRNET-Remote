import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build, version as esbuildVersion } from 'esbuild'

// Run from any directory: node apps/web/scripts/benchmark-component-palette.mjs
// Historical implementation comes from Git, not a rewritten baseline formula.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(webRoot, '../..')
const argv = process.argv.slice(2)
const argument = (name, fallback) => {
  const position = argv.indexOf(name)
  return position === -1 ? fallback : argv[position + 1]
}
const config = {
  baselineRef: argument('--baseline-ref', '40a4cad80be76a5b08943fab51ee2218cb7d7012'),
  baselineOnly: argv.includes('--baseline-only'),
  reuseBaselineSearch: argument('--reuse-baseline-search', null),
  searchSamples: Number(argument('--search-samples', '30')),
  thumbnailSamples: Number(argument('--thumbnail-samples', '8')),
  warmups: Number(argument('--warmups', '3')),
  visibleCards: Number(argument('--visible', '10')),
  desktopVisibleCards: Number(argument('--desktop-visible', '20')),
  preloadCards: Number(argument('--preload', '5')),
}
for (const key of ['searchSamples', 'thumbnailSamples', 'warmups', 'visibleCards', 'desktopVisibleCards', 'preloadCards']) {
  assert.ok(Number.isInteger(config[key]) && config[key] >= (key === 'warmups' || key === 'preloadCards' ? 0 : 1), `invalid ${key}`)
}
const queries = ['', '74', '740', '7400', '74hc00', 'CD4013BE', 'AND', 'NAND', 'not', 'flip-flop', 'TTL AND', 'logic IC', 'DIP14', 'schmitt', 'đảo', 'absolutely-not-a-component']
const sourcePaths = ['apps/web/src/data/componentSearch.ts', 'apps/web/src/three/PackageThumbnails.ts']
const git = (...args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trimEnd()
const sha256 = source => createHash('sha256').update(source).digest('hex')
const baselineSource = new Map(sourcePaths.map(file => [file, git('show', `${config.baselineRef}:${file}`)]))
const savedBaseline = config.reuseBaselineSearch ? JSON.parse(await readFile(path.resolve(repoRoot, config.reuseBaselineSearch), 'utf8')) : null
if (savedBaseline) {
  assert.equal(savedBaseline.baselineRef, git('rev-parse', config.baselineRef), 'reused baseline must match the requested historical ref')
  assert.deepEqual(savedBaseline.querySet, queries, 'reused baseline must have an identical query set')
  assert.equal(savedBaseline.config.searchSamples, config.searchSamples, 'reused baseline must have the same sample count')
  assert.equal(savedBaseline.config.warmups, config.warmups, 'reused baseline must have the same warmups')
  assert.deepEqual(savedBaseline.sourceHashes.baseline, Object.fromEntries([...baselineSource].map(([file, source]) => [file, sha256(source)])), 'reused baseline source hashes must match')
  assert.equal(savedBaseline.environment.node, process.version, 'reused baseline must use the same Node runtime')
  assert.equal(savedBaseline.environment.esbuild, esbuildVersion, 'reused baseline must use the same esbuild version')
  assert.equal(savedBaseline.environment.os, `${os.type()} ${os.release()} ${os.arch()}`, 'reused baseline must use the same OS')
  assert.equal(savedBaseline.environment.cpu, os.cpus()[0]?.model ?? 'unknown', 'reused baseline must use the same CPU')
}
const buildDirectory = path.join(webRoot, '.benchmark-build')
const buildFiles = []
const rounded = value => Number(value.toFixed(6))
function stats(values) {
  if (!values.length) return { samples: 0, p50Ms: null, p95Ms: null, maxMs: null, totalMs: 0 }
  const ordered = [...values].sort((a, b) => a - b)
  const quantile = fraction => ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)]
  return { samples: values.length, p50Ms: rounded(quantile(.5)), p95Ms: rounded(quantile(.95)), maxMs: rounded(ordered.at(-1)), totalMs: rounded(values.reduce((sum, value) => sum + value, 0)) }
}
async function loadImplementation(label, historical) {
  await mkdir(buildDirectory, { recursive: true })
  const output = path.join(buildDirectory, `component-palette-${process.pid}-${label}.mjs`)
  buildFiles.push(output)
  const overridden = []
  await build({
    stdin: {
      contents: `export * from './src/data/componentSearch.ts'; export { ribbonGroups } from './src/data/ribbon.ts'; export * from './src/three/PackageThumbnails.ts'; export { buildComponent, disposeObject } from './src/three/ComponentModel.ts'; export { getDefinition } from './src/data/editorCatalog.ts'; export { getPartForType } from './src/data/partCatalog.ts';`,
      resolveDir: webRoot, sourcefile: `${label}-benchmark-entry.ts`, loader: 'ts',
    },
    outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
    plugins: historical ? [{ name: 'git-historical-implementations', setup(buildContext) {
      buildContext.onLoad({ filter: /(?:componentSearch|PackageThumbnails)\.ts$/ }, ({ path: filename }) => {
        const relative = path.relative(repoRoot, filename).replaceAll('\\', '/')
        const contents = baselineSource.get(relative)
        if (contents === undefined) return undefined
        overridden.push(relative)
        return { contents, loader: 'ts', resolveDir: path.dirname(filename) }
      })
    } }] : [],
  })
  if (historical) assert.deepEqual(overridden.sort(), [...sourcePaths].sort(), 'both historical implementations must come from Git')
  return import(pathToFileURL(output).href)
}
function expandedItems(real, count) {
  if (count === real.length) return real
  return Array.from({ length: count }, (_, index) => ({ ...real[index % real.length], name: `${real[index % real.length].name} sample ${String(index).padStart(5, '0')}`, description: `${real[index % real.length].description} catalog expansion item ${index}` }))
}
let sink = 0
function timeSearch(search, items) {
  const batches = [], individual = queries.map(() => [])
  for (let warmup = 0; warmup < config.warmups; warmup++) for (const query of queries) sink += search(query).length
  for (let sample = 0; sample < config.searchSamples; sample++) {
    const batchStart = performance.now()
    // Rotate query order across samples without random input or a changing fixture.
    for (let offset = 0; offset < queries.length; offset++) {
      const index = (offset + sample) % queries.length
      const start = performance.now()
      const result = search(queries[index])
      individual[index].push(performance.now() - start)
      sink += result.length
    }
    batches.push(performance.now() - batchStart)
  }
  assert.ok(items.length > 0)
  return { batch: stats(batches), allQueries: stats(individual.flat()), queries: queries.map((query, index) => ({ query, matches: search(query).length, ...stats(individual[index]) })) }
}
function benchmarkSearch(baseline, current, real) {
  const results = []
  for (const count of [real.length, 4000, 10000]) {
    const items = expandedItems(real, count)
    const oldSearch = query => baseline.searchComponents(query, items)
    const savedFixture = savedBaseline?.search.find(fixture => fixture.count === count)
    if (savedBaseline) assert.ok(savedFixture, `reused baseline is missing the ${count}-item fixture`)
    const entry = { fixture: count === real.length ? 'current Logic menu' : 'synthetic repeated Logic metadata with unique name/description suffixes', count, baseline: savedFixture?.baseline ?? timeSearch(oldSearch, items) }
    if (current) {
      assert.equal(typeof current.createComponentSearchIndex, 'function', 'updated indexed search API is required')
      for (let warmup = 0; warmup < config.warmups; warmup++) sink += current.createComponentSearchIndex(items).items.length
      const constructions = []
      for (let sample = 0; sample < config.searchSamples; sample++) {
        const start = performance.now()
        sink += current.createComponentSearchIndex(items).items.length
        constructions.push(performance.now() - start)
      }
      const index = current.createComponentSearchIndex(items)
      entry.indexConstruction = stats(constructions)
      entry.current = timeSearch(query => index.search(query), items)
      entry.batchMedianSpeedup = rounded(entry.baseline.batch.p50Ms / entry.current.batch.p50Ms)
      const identities = new Map(items.map((item, position) => [item, position]))
      entry.behaviorComparison = queries.map(query => {
        const before = oldSearch(query).map(item => identities.get(item)), after = index.search(query).map(item => identities.get(item))
        const beforeSet = new Set(before), afterSet = new Set(after)
        return { query, baselineMatches: before.length, currentMatches: after.length, sameMembership: before.length === after.length && before.every(identity => afterSet.has(identity)), sameOrder: JSON.stringify(before) === JSON.stringify(after), removed: before.filter(identity => !afterSet.has(identity)).length, added: after.filter(identity => !beforeSet.has(identity)).length }
      })
    }
    results.push(entry)
    process.stdout.write(`Search measured: ${count} items\n`)
  }
  return results
}
async function importThree() {
  // Resolving relative to this script uses the same installed dependency as the app.
  return import('three')
}
function watchResources(model, counters) {
  const geometries = new Set(), materials = new Set(), textures = new Set()
  model.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) materials.add(material)
  })
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
  for (const [name, resources] of [['geometry', geometries], ['material', materials], ['texture', textures]]) {
    counters[`${name}Created`] += resources.size
    for (const resource of resources) resource.addEventListener('dispose', () => counters[`${name}Disposed`]++)
  }
}
const newResourceCounters = () => ({ geometryCreated: 0, geometryDisposed: 0, materialCreated: 0, materialDisposed: 0, textureCreated: 0, textureDisposed: 0 })
function benchmarkModel(implementation, real) {
  const construction = [], disposal = [], framing = [], counters = newResourceCounters()
  const camera = new three.OrthographicCamera(-4 / 3, 4 / 3, 1, -1, .01, 100)
  for (let sample = -config.warmups; sample < config.thumbnailSamples; sample++) {
    for (const item of real) {
      const descriptor = implementation.getPartForType(item.type), definition = implementation.getDefinition(item.type)
      const properties = { ...(descriptor?.editor.defaults ?? definition?.defaults ?? {}) }
      const start = performance.now(), model = implementation.buildComponent({ id: 'benchmark', type: item.type, properties })
      const built = performance.now()
      implementation.fitPackageThumbnailCamera(model, camera, 4 / 3)
      const fitted = performance.now()
      if (sample >= 0) watchResources(model, counters)
      const beforeDisposal = performance.now()
      implementation.disposeObject(model)
      const disposed = performance.now()
      if (sample >= 0) { construction.push(built - start); framing.push(fitted - built); disposal.push(disposed - beforeDisposal) }
    }
  }
  assert.equal(counters.geometryCreated, counters.geometryDisposed)
  assert.equal(counters.materialCreated, counters.materialDisposed)
  assert.equal(counters.textureCreated, counters.textureDisposed)
  return { implementation: 'shared current ComponentModel / unchanged dependency graph', itemCount: real.length, construction: stats(construction), cameraFraming: stats(framing), disposal: stats(disposal), resources: counters }
}
const pauseTask = () => new Promise(resolve => setTimeout(resolve, 0))
async function captureRun(implementation, real, demand, mode = 'capture', visibleCount = config.visibleCards) {
  const requested = real.slice(0, demand), resources = newResourceCounters(), captureTimes = [], framing = [], renderedTypes = []
  let rendererAttempts = 0, rendererDisposals = 0, captures = 0, closeTimer
  const camera = new three.OrthographicCamera(-4 / 3, 4 / 3, 1, -1, .01, 100)
  let leases = []
  const cache = implementation.createPackageThumbnailCache({ idleDelayMs: 0, createRenderer() {
    rendererAttempts++
    if (mode === 'unsupported') return null
    return {
      render(model) {
        captureTimes.push(performance.now())
        captures++; renderedTypes.push(model.userData.type)
        watchResources(model, resources)
        const framingStart = performance.now()
        implementation.fitPackageThumbnailCamera(model, camera, 4 / 3)
        framing.push(performance.now() - framingStart)
        if (mode === 'failure') throw new Error('intentional injected renderer failure')
        if (mode === 'close-after-first' && captures === 1) closeTimer = setTimeout(() => leases.forEach(lease => lease.release()), 0)
        // This is a CPU boundary marker. There is no WebGL render or PNG encoding.
        return `data:image/png;base64,benchmark-${captures}`
      },
      dispose() { rendererDisposals++ },
    }
  } })
  const start = performance.now()
  leases = requested.map((item, index) => cache.acquire(item.type, undefined, { priority: index < visibleCount ? 'visible' : 'preload' }))
  const acquisitionEnded = performance.now()
  if (mode === 'cancel-all') leases.forEach(lease => lease.release())
  if (mode === 'cancel-offscreen') leases.slice(config.visibleCards + config.preloadCards).forEach(lease => lease.release())
  const values = await Promise.all(leases.map(lease => lease.ready))
  const ready = performance.now()
  leases.forEach(lease => lease.release())
  await pauseTask(); await pauseTask()
  if (closeTimer) clearTimeout(closeTimer)
  const beforeRevisit = { captures, rendererAttempts, rendererDisposals }
  const revisitStart = performance.now()
  const revisits = mode === 'capture' ? requested.map(item => cache.acquire(item.type)) : []
  await Promise.all(revisits.map(lease => lease.ready))
  const revisitMs = performance.now() - revisitStart
  revisits.forEach(lease => lease.release())
  await pauseTask()
  assert.equal(resources.geometryCreated, resources.geometryDisposed, 'cache must dispose model geometries')
  assert.equal(resources.materialCreated, resources.materialDisposed, 'cache must dispose model materials')
  assert.equal(resources.textureCreated, resources.textureDisposed, 'cache must dispose model textures')
  return {
    requested: requested.length, captures: beforeRevisit.captures, rendererAttempts: beforeRevisit.rendererAttempts, rendererDisposals: beforeRevisit.rendererDisposals,
    successes: values.filter(value => value !== null).length, fallbacksOrReleased: values.filter(value => value === null).length,
    acquisitionMs: rounded(acquisitionEnded - start), firstCaptureBoundaryMs: captureTimes.length ? rounded(captureTimes[0] - start) : null,
    allReadyMs: rounded(ready - start), framingMs: stats(framing), resources, renderedTypes,
    revisit: { requested: revisits.length, allReadyMs: rounded(revisitMs), additionalCaptures: captures - beforeRevisit.captures, additionalRendererAttempts: rendererAttempts - beforeRevisit.rendererAttempts },
  }
}
async function benchmarkCaptures(implementation, label, real, demand, visibleCount) {
  for (let warmup = 0; warmup < config.warmups; warmup++) await captureRun(implementation, real, demand, 'capture', visibleCount)
  const runs = []
  for (let sample = 0; sample < config.thumbnailSamples; sample++) runs.push(await captureRun(implementation, real, demand, 'capture', visibleCount))
  for (const run of runs) {
    assert.equal(run.captures, demand)
    assert.equal(run.rendererAttempts, 1)
    assert.equal(run.rendererDisposals, 1)
    assert.equal(run.revisit.additionalCaptures, 0)
    assert.equal(run.revisit.additionalRendererAttempts, 0)
  }
  process.stdout.write(`Thumbnail CPU boundary measured: ${label}, ${demand} requests\n`)
  return { label, demand, visibleCards: visibleCount, preloadCards: demand - visibleCount, acquisition: stats(runs.map(run => run.acquisitionMs)), firstCaptureBoundary: stats(runs.map(run => run.firstCaptureBoundaryMs)), allReady: stats(runs.map(run => run.allReadyMs)), revisit: stats(runs.map(run => run.revisit.allReadyMs)), runs }
}
async function benchmarkShortReopen(implementation, real) {
  let rendererAttempts = 0, rendererDisposals = 0, captures = 0
  const resources = newResourceCounters()
  const camera = new three.OrthographicCamera(-4 / 3, 4 / 3, 1, -1, .01, 100)
  // Keep the production default idle retention here; the cold timing matrix
  // above uses idleDelayMs:0 only to make every iteration independent.
  const cache = implementation.createPackageThumbnailCache({ createRenderer() {
    rendererAttempts++
    return { render(model) { captures++; watchResources(model, resources); implementation.fitPackageThumbnailCamera(model, camera, 4 / 3); return `data:image/png;base64,reopen-${captures}` }, dispose() { rendererDisposals++ } }
  } })
  try {
    const first = cache.acquire(real[0].type)
    await first.ready; first.release()
    const closed = performance.now()
    await pauseTask()
    const reopenedAfterMs = performance.now() - closed
    const second = cache.acquire(real[1].type)
    await second.ready; second.release()
    await pauseTask()
    const beforeCleanup = { captures, rendererAttempts, rendererDisposals }
    cache.dispose?.()
    await pauseTask()
    assert.equal(resources.geometryCreated, resources.geometryDisposed)
    assert.equal(resources.materialCreated, resources.materialDisposed)
    assert.equal(resources.textureCreated, resources.textureDisposed)
    return { reopenedAfterMs: rounded(reopenedAfterMs), beforeExplicitCleanup: beforeCleanup, afterExplicitCleanup: { captures, rendererAttempts, rendererDisposals }, resources }
  } finally { cache.dispose?.() }
}
function markdown(report) {
  const lines = [
    '# Component palette benchmark — 2026-10-16', '',
    `Baseline: \`${report.baselineRef}\`. Runtime: ${report.environment.node}, ${report.environment.os}, ${report.environment.cpu}.`, '',
    'Reproduce from the repository root with `node apps/web/scripts/benchmark-component-palette.mjs`. The command rewrites the accompanying JSON and this report. No new dependency is required. Historical search/cache source is loaded with `git show` through esbuild; both versions use the same current catalog, Three.js, and ComponentModel dependencies.', '',
    savedBaseline ? `This saved report reused unchanged historical search timings from \`${config.reuseBaselineSearch}\`, captured at ${savedBaseline.capturedAtUtc}, and freshly measured the final indexed search and all thumbnail phases. Baseline/current search timings therefore come from separate processes on the same CPU/OS/Node runtime. Ref, source hashes, queries, warmups, sample count and shared dependency hashes are validated before reuse. Reproduce this exact mode by adding \`--reuse-baseline-search ${config.reuseBaselineSearch}\`; omit the flag to rerun both search implementations in one process.` : 'Both search implementations were measured in the same process, baseline first and current second.', '',
    `Search uses ${config.warmups} full-query warmup passes and ${config.searchSamples} measured batches per fixture, with ${queries.length} fixed queries rotated in order. Each batch runs every query once. Nearest-rank p50/p95/max are wall-clock milliseconds from performance.now(); there are no timing assertions. Synthetic entries repeat the real Logic parts, preserving real part lookups while adding unique name and description suffixes. Index construction is measured separately; steady query timings reuse a constructed index.`, '',
    '| Items | Old batch p50 / p95 / max (ms) | Indexed batch p50 / p95 / max (ms) | Index build p50 / p95 (ms) | Median batch speedup |',
    '| ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const row of report.search) lines.push(`| ${row.count} | ${row.baseline.batch.p50Ms} / ${row.baseline.batch.p95Ms} / ${row.baseline.batch.maxMs} | ${row.current ? `${row.current.batch.p50Ms} / ${row.current.batch.p95Ms} / ${row.current.batch.maxMs}` : 'not measured'} | ${row.indexConstruction ? `${row.indexConstruction.p50Ms} / ${row.indexConstruction.p95Ms}` : 'n/a'} | ${row.batchMedianSpeedup ?? 'n/a'}× |`)
  lines.push('', `Individual-query timings pool ${config.searchSamples * queries.length} invocations across the fixed query set:`, '', '| Items | Old query p50 / p95 / max (ms) | Indexed query p50 / p95 / max (ms) |', '| ---: | ---: | ---: |')
  for (const row of report.search) lines.push(`| ${row.count} | ${row.baseline.allQueries.p50Ms} / ${row.baseline.allQueries.p95Ms} / ${row.baseline.allQueries.maxMs} | ${row.current ? `${row.current.allQueries.p50Ms} / ${row.current.allQueries.p95Ms} / ${row.current.allQueries.maxMs}` : 'not measured'} |`)
  lines.push('', 'The JSON includes per-query latency/match counts and membership/order comparisons. Added metadata and ranking intentionally change some results; these comparisons are observations, not assertions of identical behavior.', '',
    `Thumbnail fixtures use all ${report.logicCount} real Logic types. A controlled compact viewport requests ${config.visibleCards} visible + ${config.preloadCards} preload = ${config.visibleCards + config.preloadCards} models. A desktop-sized controlled viewport requests ${config.desktopVisibleCards} visible + ${config.preloadCards} preload = ${config.desktopVisibleCards + config.preloadCards} models. The preload margin is 72px. These are explicit viewport-specific demand fixtures, not measured physical browser layouts. Each row has ${config.warmups} warmups and ${config.thumbnailSamples} cold cache runs. The current cache uses its default scheduler under Node (timer fallback) and idleDelayMs:0 so its renderer is cleaned up before the run ends. The baseline microtask/timer scheduling is unmodified.`, '',
    'The opening comparison uses baseline eager demand for all 40 cards and current visibility-scoped demand for each viewport. Additional baseline scoped and current eager rows are controls that isolate demand count from queue scheduling.', '',
    '| Cache / demand | Models per open | First capture boundary p50 / p95 (ms) | All ready p50 / p95 (ms) | Cached revisit p50 (ms) |',
    '| --- | ---: | ---: | ---: | ---: |')
  for (const row of report.thumbnails.cold) lines.push(`| ${row.label} | ${row.runs[0].captures} | ${row.firstCaptureBoundary.p50Ms} / ${row.firstCaptureBoundary.p95Ms} | ${row.allReady.p50Ms} / ${row.allReady.p95Ms} | ${row.revisit.p50Ms} |`)
  lines.push('', 'The injected renderer receives real production models, runs the production camera-fitting function, and observes their actual disposal. It returns a marker string. It does not create a WebGL context, render pixels, or encode PNG. “Renderer attempts” in the JSON count the injected factory boundary; they are not successful GPU contexts. No document/canvas is present, so browser 2D label/texture work is also absent. These are CPU/model/scheduling measurements, not real GPU capture latency.', '',
    `Direct model construction p50/p95: ${report.thumbnails.models.construction.p50Ms}/${report.thumbnails.models.construction.p95Ms} ms; camera framing: ${report.thumbnails.models.cameraFraming.p50Ms}/${report.thumbnails.models.cameraFraming.p95Ms} ms; disposal: ${report.thumbnails.models.disposal.p50Ms}/${report.thumbnails.models.disposal.p95Ms} ms. The JSON includes geometry/material/texture creation and disposal counts, cached revisits, cancellation before work, cancellation after the first capture, injected renderer failure/unavailability, and a short-close/reopen probe using default renderer retention.`, '',
    'Actual browser WebGL first-image latency, PNG encoding latency, screenshot quality, GPU memory, and successful physical GPU context counts were not measured. Browser localhost access was denied in this session; this harness does not bypass that denial. The controlled Vue/IntersectionObserver integration checks are separate evidence for how many of the 40 cards request models when the menu opens.', '',
    'Machine and process load are uncontrolled. Short operations, timer granularity, JIT, garbage collection, and shared machine activity can vary these results. The benchmark is reproducible evidence from this environment, not a browser frame-time or cross-machine performance guarantee.', '',
  )
  return lines.join('\n')
}

let three
try {
  const baseline = await loadImplementation('baseline', true)
  const current = config.baselineOnly ? null : await loadImplementation('current', false)
  three = await importThree()
  if (savedBaseline) assert.equal(savedBaseline.environment.threeRevision, three.REVISION, 'reused baseline must use the same Three revision')
  const logic = baseline.ribbonGroups.find(group => group.id === 'logic').items
  assert.equal(logic.length, 40, 'fixture must represent the current 40-card Logic menu')
  assert.ok(config.visibleCards + config.preloadCards <= logic.length)
  assert.ok(config.desktopVisibleCards + config.preloadCards <= logic.length)
  const sharedModelPath = 'apps/web/src/three/ComponentModel.ts'
  const sharedDependencyHashes = Object.fromEntries(await Promise.all(['apps/web/package-lock.json', 'apps/web/src/data/ribbon.ts', 'apps/web/src/data/partCatalog.ts', 'apps/web/src/data/editorCatalog.ts', 'apps/web/src/data/physicalParts.json', 'apps/web/src/data/editorCatalog.json', 'apps/web/src/data/editorParts.json'].map(async file => [file, sha256(await readFile(path.join(repoRoot, file)))])))
  if (savedBaseline) assert.deepEqual(savedBaseline.sharedDependencyHashes, sharedDependencyHashes, 'reused baseline shared dependencies must be unchanged')
  const report = {
    schemaVersion: 1, capturedAtUtc: new Date().toISOString(), config, baselineRef: git('rev-parse', config.baselineRef), currentHead: git('rev-parse', 'HEAD'),
    environment: { node: process.version, v8: process.versions.v8, esbuild: esbuildVersion, threeRevision: three.REVISION, os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), execArgv: process.execArgv, browser: 'unavailable: localhost browser access was denied; no browser automation workaround attempted', webgl: 'not measured; injected CPU renderer boundary only' },
    sourceHashes: { baseline: Object.fromEntries([...baselineSource].map(([file, source]) => [file, sha256(source)])), current: Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, sha256((await readFile(path.join(repoRoot, file), 'utf8')).trimEnd())]))), sharedComponentModel: sha256((await readFile(path.join(repoRoot, sharedModelPath), 'utf8')).trimEnd()) },
    sharedDependencyHashes,
    baselineSearchOrigin: savedBaseline ? { mode: 'reused unchanged earlier process', report: config.reuseBaselineSearch, capturedAtUtc: savedBaseline.capturedAtUtc, finishedAtUtc: savedBaseline.finishedAtUtc, environment: savedBaseline.environment } : { mode: 'fresh same process' },
    workingTreeAtStart: git('status', '--short'), logicCount: logic.length, querySet: queries,
    methodology: { clock: 'performance.now milliseconds', quantiles: 'nearest rank ceil(N*p)-1', queryBatch: 'one invocation of every query; query order rotates by sample; result lengths consumed', synthetic: 'repeat real 40 Logic parts; append deterministic unique suffixes to name and description; preserve type/metadata lookups', cacheBoundary: 'production acquire/queue/buildComponent/disposeObject; injected render calls real fitPackageThumbnailCamera then returns a marker data URL; resource-disposal observer instrumentation is enabled', gpu: 'none; no WebGL context, browser canvas, pixel capture, PNG encoding or 2D label texture work', viewport: { actualBrowserMeasurement: false, rootMarginPx: 72, assumedCardHeightPx: 120, assumedColumns: 5, scenarios: [{ label: 'compact', visibleCards: config.visibleCards, preloadCards: config.preloadCards, assumedViewportHeightPx: 240 }, { label: 'desktop-sized', visibleCards: config.desktopVisibleCards, preloadCards: config.preloadCards, assumedViewportHeightPx: 420 }] }, indexConstructionIncludedInQueries: false },
    search: benchmarkSearch(baseline, current, logic), thumbnails: { models: benchmarkModel(current ?? baseline, logic), cold: [], lifecycle: [], shortReopen: [] },
  }
  for (const [implementation, label] of [[baseline, 'baseline'], ...(current ? [[current, 'current']] : [])]) {
    for (const scenario of [{ count: logic.length, visible: logic.length, label: 'eager all cards' }, { count: config.visibleCards + config.preloadCards, visible: config.visibleCards, label: 'compact viewport' }, { count: config.desktopVisibleCards + config.preloadCards, visible: config.desktopVisibleCards, label: 'desktop-sized viewport' }]) report.thumbnails.cold.push(await benchmarkCaptures(implementation, `${label}, ${scenario.label}`, logic, scenario.count, scenario.visible))
    for (const mode of ['cancel-all', 'cancel-offscreen', 'close-after-first', 'failure', 'unsupported']) {
      const run = await captureRun(implementation, logic, logic.length, mode)
      assert.equal(run.captures, ['cancel-all', 'unsupported'].includes(mode) ? 0 : mode === 'cancel-offscreen' ? config.visibleCards + config.preloadCards : 1)
      assert.equal(run.rendererAttempts, mode === 'cancel-all' ? 0 : 1)
      report.thumbnails.lifecycle.push({ implementation: label, mode, ...run })
    }
    const shortReopen = await benchmarkShortReopen(implementation, logic)
    assert.equal(shortReopen.beforeExplicitCleanup.captures, 2)
    assert.equal(shortReopen.beforeExplicitCleanup.rendererAttempts, label === 'baseline' ? 2 : 1)
    report.thumbnails.shortReopen.push({ implementation: label, ...shortReopen })
  }
  report.resultConsumer = sink
  report.finishedAtUtc = new Date().toISOString()
  if (current) {
    const finalHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, sha256((await readFile(path.join(repoRoot, file), 'utf8')).trimEnd())])))
    assert.deepEqual(finalHashes, report.sourceHashes.current, 'current source changed during the benchmark; rerun after source edits settle')
  }
  const suffix = config.baselineOnly ? '-baseline' : ''
  const destination = path.join(repoRoot, 'docs/verification', `2026-10-16-component-palette-benchmark${suffix}`)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(`${destination}.json`, `${JSON.stringify(report, null, 2)}\n`)
  if (!config.baselineOnly) await writeFile(`${destination}.md`, markdown(report))
  process.stdout.write(`Wrote ${path.relative(repoRoot, destination)}.json${config.baselineOnly ? '' : ' and .md'}\n`)
} finally {
  for (const filename of buildFiles) await unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error })
  await rmdir(buildDirectory).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error })
}
