import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Mesh, MeshPhysicalMaterial, Object3D, Camera } from 'three'
import type { CircuitGraph, CircuitModule } from '../src/types/circuit'
import type * as Catalog from '../src/data/partCatalog'
import type { solveMounting as RigidSolver } from '../src/electrical/mounting'
import type { solveFlexibleMount as FlexibleSolver } from '../src/electrical/flexibleGeometry'
import { exportedNativeGraph, nativeComponentBody, nativeSceneEvidence, observeNativeScene, sceneReady, workspaceCanvas } from './native-scene'

type Runtime = typeof Catalog & { solveMounting: typeof RigidSolver; solveFlexibleMount: typeof FlexibleSolver }
const galleryDirectory = resolve('.test-build/sealed-model-gallery')
const info = (page: Page) => page.getByRole('complementary', { name: 'Component Info', exact: true })
const board: CircuitModule = { id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }
const fileGraph = (graph: CircuitGraph): CircuitGraph => JSON.parse(JSON.stringify(graph)) as CircuitGraph

async function runtime(): Promise<Runtime> {
  await mkdir(galleryDirectory, { recursive: true })
  const filename = resolve(galleryDirectory, 'geometry-runtime.mjs')
  await build({ stdin: { contents: "export * from './src/data/partCatalog'; export {solveMounting} from './src/electrical/mounting'; export {solveFlexibleMount} from './src/electrical/flexibleGeometry'", resolveDir: process.cwd(), loader: 'ts' }, outfile: filename, bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  return import(pathToFileURL(filename).href) as Promise<Runtime>
}
async function open(page: Page, graph: CircuitGraph) {
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: `${graph.circuit_id}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
  await expect.poll(() => exportedNativeGraph(page)).toEqual(fileGraph(graph))
  await expect.poll(async () => { try { return (await nativeComponentBody(page, 'PART')).body } catch { return '' } }).not.toBe('')
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
}
async function begin(page: Page) { await page.setViewportSize({ width: 1920, height: 1080 }); await observeNativeScene(page); await page.goto('/'); await sceneReady(page) }
async function settle(page: Page) {
  let previous = '', stable = 0
  await expect.poll(async () => {
    const current = await workspaceCanvas(page).evaluate(element => {
      const probe = (element as HTMLCanvasElement & { nativeSceneProbe?: { camera: Camera } }).nativeSceneProbe
      if (!probe) return ''
      return JSON.stringify([...probe.camera.position.toArray(), ...probe.camera.quaternion.toArray(), ...probe.camera.projectionMatrix.elements].map(n => Math.round(n * 1e7)))
    })
    stable = current && current === previous ? stable + 1 : 0; previous = current; return stable
  }, { intervals: [150], timeout: 20_000 }).toBeGreaterThanOrEqual(2)
}
async function projectedPackage(page: Page, id: string) {
  return workspaceCanvas(page).evaluate((element, id) => {
    const canvas = element as HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D; camera: Camera } }, probe = canvas.nativeSceneProbe
    if (!probe) throw Error('Missing actual native renderer.')
    let model: Object3D | undefined; probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === id) model = object })
    if (!model) throw Error('Missing rendered package.')
    const bounds = canvas.getBoundingClientRect(), xs: number[] = [], ys: number[] = [], bodyXs: number[] = [], bodyYs: number[] = []
    model.updateWorldMatrix(true, true)
    const body = model.getObjectByName('package-body') as Mesh
    if (!body?.geometry) throw Error('Missing body for gallery framing.')
    body.geometry.computeBoundingBox()
    const center = body.geometry.boundingBox!.getCenter(body.position.clone()).applyMatrix4(body.matrixWorld).project(probe.camera)
    const cx = bounds.left + (center.x + 1) * bounds.width / 2, cy = bounds.top + (1 - center.y) * bounds.height / 2
    model.traverse(object => {
      const mesh = object as Mesh
      if (!mesh.isMesh || !object.visible || object.userData.pinTarget || object.userData.pinHighlight || object.userData.ignorePick) return
      for (let ancestor = object.parent; ancestor && ancestor !== model; ancestor = ancestor.parent) if (!ancestor.visible) return
      if ((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(material => !material.visible)) return
      mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox; if (!box) return
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = model!.position.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(probe.camera)
        const px = bounds.left + (p.x + 1) * bounds.width / 2, py = bounds.top + (1 - p.y) * bounds.height / 2
        xs.push(px); ys.push(py)
        if (object === body) { bodyXs.push(px); bodyYs.push(py) }
      }
    })
    const halfX = Math.max(18, ...xs.map(x => Math.abs(x - cx) * 1.2)), halfY = Math.max(18, ...ys.map(y => Math.abs(y - cy) * 1.2))
    return { x1: cx - halfX, y1: cy - halfY, x2: cx + halfX, y2: cy + halfY, bodyPixels: Math.max(Math.max(...bodyXs) - Math.min(...bodyXs), Math.max(...bodyYs) - Math.min(...bodyYs)) }
  }, id)
}
async function closeup(page: Page, id: string, view: string) {
  // Opposite cube faces/corners are culled from the actual widget. Compass
  // controls remain available; Home exposes the default elevated corners.
  const cardinal = ({ LEFT: 'W', RIGHT: 'E', FRONT: 'S', BACK: 'N' } as Record<string, string>)[view]
  if (cardinal) await page.getByRole('button', { name: `Orient to ${cardinal}`, exact: true }).press('Enter', { timeout: 15_000 })
  else {
    const target = page.getByRole('button', { name: `View ${view}`, exact: true })
    if (!await target.count()) { await page.getByRole('button', { name: 'Home view', exact: true }).click(); await settle(page) }
    await target.press('Enter', { timeout: 15_000 })
  }
  await settle(page)
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settle(page)
  const close = page.getByRole('button', { name: 'Close Component Info', exact: true }); if (await close.isVisible()) await close.click()
  // Each native area gesture resets the app's zoom reference. Reframing from
  // fresh projected body bounds avoids a tiny subject or a focus on the board.
  for (let pass = 0; pass < 3; pass++) {
    const rect = await projectedPackage(page, id)
    if (rect.bodyPixels >= 380) break
    const before = (await nativeSceneEvidence(page)).frames
    await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
    await page.mouse.move(rect.x1, rect.y1); await page.mouse.down(); await page.mouse.move(rect.x2, rect.y2, { steps: 6 }); await page.mouse.up()
    await expect.poll(async () => (await nativeSceneEvidence(page)).frames, { timeout: 20_000 }).toBeGreaterThan(before)
    await settle(page)
  }
  const framed = await projectedPackage(page, id)
  expect(framed.bodyPixels, `Actual ${view} body must be visible at a useful closeup size`).toBeGreaterThanOrEqual(180)
  console.info(`Native package framing ${id} ${view}: ${Math.round(framed.bodyPixels)}px body`)
}
async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = resolve(galleryDirectory, `${name}.png`)
  const clip = await workspaceCanvas(page).boundingBox(); if (!clip) throw Error('Missing visible native workspace.')
  await settle(page)
  try { await page.screenshot({ path, clip, timeout: 90_000, scale: 'css', animations: 'disabled', caret: 'hide' }) }
  catch (error) {
    if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error
    console.info(`Retrying native software-WebGL capture: ${name}`)
    await settle(page)
    await page.screenshot({ path, clip, timeout: 90_000, scale: 'css', animations: 'disabled', caret: 'hide' })
  }
  await testInfo.attach(name, { path, contentType: 'image/png' })
  console.info(`Retained native package render: ${name}`)
}
async function notchCloseup(page: Page, mm: number) {
  // Use the real body frame only to locate the cavity; the production area
  // gesture performs the camera movement and the original renderer draws it.
  for (let pass = 0; pass < 2; pass++) {
    const rect = await workspaceCanvas(page).evaluate((element, mm) => {
      const canvas = element as HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D; camera: Camera } }, probe = canvas.nativeSceneProbe
      if (!probe) throw Error('Missing native cavity renderer.')
      let model: Object3D | undefined; probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === 'PART') model = object })
      const body = model?.getObjectByName('package-body') as Mesh; if (!body) throw Error('Missing molded body.')
      body.updateWorldMatrix(true, false); body.geometry.computeBoundingBox(); const box = body.geometry.boundingBox!, bounds = canvas.getBoundingClientRect()
      const xs: number[] = [], ys: number[] = []
      for (const x of [box.min.x - .2 * mm, box.min.x + 2.1 * mm]) for (const y of [box.max.y - 1 * mm, box.max.y + .3 * mm]) for (const z of [-1.2 * mm, 1.2 * mm]) {
        const p = body.position.clone().set(x, y, z).applyMatrix4(body.matrixWorld).project(probe.camera)
        xs.push(bounds.left + (p.x + 1) * bounds.width / 2); ys.push(bounds.top + (1 - p.y) * bounds.height / 2)
      }
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
      const hx = Math.max(18, (Math.max(...xs) - Math.min(...xs)) * .6), hy = Math.max(18, (Math.max(...ys) - Math.min(...ys)) * .6)
      return { x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy, pixels: Math.max(...xs) - Math.min(...xs) }
    }, mm)
    if (rect.pixels >= 500) break
    await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
    await page.mouse.move(rect.x1, rect.y1); await page.mouse.down(); await page.mouse.move(rect.x2, rect.y2, { steps: 6 }); await page.mouse.up(); await settle(page)
  }
}
async function renderedBodyCenter(page: Page, id: string) {
  return workspaceCanvas(page).evaluate((element, id) => {
    const canvas = element as HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D; camera: Camera } }, probe = canvas.nativeSceneProbe
    if (!probe) throw Error('Missing renderer for physical selection.')
    let model: Object3D | undefined; probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === id) model = object })
    const body = model?.getObjectByName('package-body') as Mesh; if (!body) throw Error('Missing body selection target.')
    body.updateWorldMatrix(true, false); body.geometry.computeBoundingBox()
    const p = body.geometry.boundingBox!.getCenter(body.position.clone()).applyMatrix4(body.matrixWorld).project(probe.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 }
  }, id)
}

test('sealed package gallery retains actual native renders of every family and molded-lead closeups', async ({ page }, testInfo) => {
  test.setTimeout(600_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await begin(page); await page.setViewportSize({ width: 1440, height: 900 }); await settle(page)
  const api = await runtime(), evidence: unknown[] = []
  const cases = [
    ['resistor-horizontal', 'GENERIC_RESISTOR', 13], ['resistor-standing', 'GENERIC_RESISTOR', 11],
    ['diode-horizontal', 'GENERIC_DIODE', 13], ['zener-horizontal', 'GENERIC_ZENER_DIODE', 13],
    ['ceramic-upright', 'GENERIC_CAPACITOR', 11], ['electrolytic-upright', 'GENERIC_CAPACITOR_ELECTROLYTIC', 11],
    ['led-upright', 'GENERIC_LED', 11], ['dip14', 'SN74HC08N', 0], ['to92', 'GENERIC_BJT', 0],
  ] as const
  for (const [name, type, last] of cases) {
    const solution = last ? api.solveFlexibleMount(type, board.id, 'terminal:C:10', `terminal:C:${last}`, [board]) : api.solveMounting(type, { x: 0, y: 0, z: 0 }, 0, [board])
    expect(solution?.valid, solution?.reason).toBe(true)
    const graph: CircuitGraph = { schema_version: '1.2', circuit_id: `sealed-${name}`, metadata: { name: `Sealed ${name}` }, modules: [board, { id: 'PART', type, mount: solution!.mount!, ...(type === 'GENERIC_RESISTOR' ? { properties: { resistanceOhms: 4700, tolerancePercent: 1 } } : {}) }], connections: [] }
    await open(page, graph)
    await closeup(page, 'PART', 'TOP-FRONT-RIGHT'); await capture(page, testInfo, `${name}-isometric`)
    if (name === 'dip14') for (const [view, suffix] of [['TOP', 'top'], ['TOP-FRONT', 'front'], ['TOP-FRONT-LEFT', 'notch-end']] as const) { await closeup(page, 'PART', view); await capture(page, testInfo, `${name}-${suffix}`) }
    if (name === 'dip14') { await notchCloseup(page, api.MM_TO_WORLD); await capture(page, testInfo, `${name}-notch-detail`) }
    if (name === 'to92') for (const [view, suffix] of [['TOP-FRONT', 'front'], ['TOP-RIGHT', 'right']] as const) { await closeup(page, 'PART', view); await capture(page, testInfo, `${name}-${suffix}`) }
    if (name === 'electrolytic-upright') { await closeup(page, 'PART', 'TOP-FRONT-LEFT'); await capture(page, testInfo, `${name}-value-side`) }
    if (['resistor-horizontal', 'diode-horizontal', 'zener-horizontal'].includes(name)) { await closeup(page, 'PART', 'TOP-RIGHT'); await capture(page, testInfo, `${name}-sealed-end`) }
    expect(await exportedNativeGraph(page)).toEqual(fileGraph(graph))
    expect((await nativeSceneEvidence(page)).handles).toBe(false)
    evidence.push({ name, descriptor: api.physicalDescriptorForPart(api.getPartForType(type)!), nativeBody: await nativeComponentBody(page, 'PART'), scene: await nativeSceneEvidence(page) })
  }
  expect(errors).toEqual([])
  const content = JSON.stringify(evidence, null, 2); await writeFile(resolve(galleryDirectory, 'native-evidence.json'), content)
  await testInfo.attach('sealed-native-evidence', { body: Buffer.from(content), contentType: 'application/json' })
})

test('native rebuild previews and commits rigid DIP and free components with cancellation, one Undo, Redo and JSON reload', async ({ page }, testInfo) => {
  test.setTimeout(300_000) // Two complete rebuild flows plus retained software-WebGL closeups.
  await begin(page); const api = await runtime()
  for (const [name, type, mounted] of [['rigid-dip14', 'SN74HC08N', true], ['free-to92', 'GENERIC_BJT', false]] as const) {
    const historical = api.historicalPartCatalog.filter(part => part.editorType === type).sort((a, b) => a.revision - b.revision)[0]!
    expect(historical).toBeTruthy()
    const descriptor = api.physicalDescriptorForPart(historical)
    const candidate = mounted ? api.solveMounting(type, { x: 0, y: 0, z: 0 }, 0, [board], 'PART', descriptor) : null
    if (mounted) expect(candidate?.valid, candidate?.reason).toBe(true)
    const module: CircuitModule = { id: 'PART', type, properties: { ...historical.editor.defaults }, ...(mounted ? { mount: candidate!.mount } : { position: { x: 0, y: .309, z: 0 }, rotation: 0, physicalDescriptor: descriptor }) }
    const graph: CircuitGraph = { schema_version: '1.2', circuit_id: `sealed-rebuild-${name}`, metadata: { name: `Sealed rebuild ${name}` }, modules: [board, module], connections: [] }
    await open(page, graph); await page.getByRole('button', { name: 'View TOP-FRONT-RIGHT', exact: true }).press('Enter'); await settle(page)
    const before = await exportedNativeGraph(page), oldBody = await nativeComponentBody(page, 'PART')
    const point = await renderedBodyCenter(page, 'PART'); await page.mouse.click(point.x, point.y)
    const rebuild = info(page).getByRole('button', { name: 'Rebuild component geometry', exact: true })
    await expect(rebuild).toBeVisible(); await rebuild.click()
    await expect(info(page).getByRole('button', { name: 'Apply rebuilt component geometry', exact: true })).toBeEnabled()
    expect(await exportedNativeGraph(page)).toEqual(before)
    const preview = await nativeComponentBody(page, 'PART'); expect(preview.body).not.toBe(oldBody.body)
    await info(page).getByRole('button', { name: 'Cancel component geometry rebuild', exact: true }).click()
    expect(await exportedNativeGraph(page)).toEqual(before); expect((await nativeComponentBody(page, 'PART')).size).toEqual(oldBody.size)
    await rebuild.click(); await info(page).getByRole('button', { name: 'Apply rebuilt component geometry', exact: true }).click()
    const after = await exportedNativeGraph(page), changed = after.modules.find(part => part.id === 'PART')!
    expect(changed.id).toBe(module.id); expect(changed.properties).toEqual(module.properties); expect(after.connections).toEqual(before.connections)
    if (mounted) { expect(changed.mount?.contacts).toEqual(module.mount?.contacts); expect(changed.mount?.partRevision).toBe(api.getPartForType(type)!.revision) }
    else expect(changed.physicalDescriptor).toEqual(api.physicalDescriptorForPart(api.getPartForType(type)!))
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(before)
    await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(after)
    await open(page, after); expect(await exportedNativeGraph(page)).toEqual(after)
    await closeup(page, 'PART', 'TOP-FRONT-RIGHT'); await capture(page, testInfo, `${name}-rebuilt`)
  }
})

async function captureRefinedSurfaces(page: Page, testInfo: TestInfo, families: readonly string[]) {
  test.setTimeout(360_000)
  await begin(page); await page.setViewportSize({ width: 1440, height: 900 }); await settle(page)
  const api = await runtime(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const cases = [
    { name: 'ceramic-upright', type: 'GENERIC_CAPACITOR', properties: { capacitanceFarads: 100e-9, voltageRatingVolts: 50 }, views: [['TOP-FRONT-RIGHT', 'isometric'], ['TOP-FRONT', 'front']] },
    { name: 'electrolytic-upright', type: 'GENERIC_CAPACITOR_ELECTROLYTIC', properties: { capacitanceFarads: 47e-6, voltageRatingVolts: 25 }, views: [['LEFT', 'value-left']] },
    { name: 'led-upright', type: 'GENERIC_LED', properties: { color: '#ff0000' }, views: [['TOP-FRONT-RIGHT', 'isometric'], ['FRONT', 'front'], ['LEFT', 'left']] },
  ]
  for (const { name, type, properties, views } of cases) {
    if (!families.includes(type)) continue
    const solution = api.solveFlexibleMount(type, board.id, 'terminal:C:10', 'terminal:C:11', [board])
    expect(solution.valid, solution.reason).toBe(true)
    const graph: CircuitGraph = { schema_version: '1.2', circuit_id: `surface-${name}`, metadata: { name: `Surface ${name}` }, modules: [board, { id: 'PART', type, mount: solution.mount!, properties }], connections: [] }
    await open(page, graph)
    if (type === 'GENERIC_LED') {
      // Inspect the material after the native import/appearance pipeline has
      // run, then retain real renders to assess the faint internal frame.
      const optics = await workspaceCanvas(page).evaluate(element => {
        const probe = (element as HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D } }).nativeSceneProbe
        if (!probe) throw Error('Missing native LED renderer.')
        let model: Object3D | undefined
        probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === 'PART') model = object })
        const body = model?.getObjectByName('package-body') as Mesh | undefined
        if (!body) throw Error('Missing native LED shell.')
        const material = body.material as MeshPhysicalMaterial
        return {
          color: material.color.getHexString(), opacity: material.opacity, transmission: material.transmission,
          roughness: material.roughness,
          frame: ['package-led-anode-post', 'package-led-cathode-stem', 'package-led-cathode-anvil', 'package-led-die'].map(name => Boolean(model?.getObjectByName(name)?.visible)),
        }
      })
      expect(optics).toEqual({ color: '781521', opacity: .98, transmission: .28, roughness: .25, frame: [true, true, true, true] })
      await writeFile(resolve(galleryDirectory, 'led-native-optics.json'), JSON.stringify(optics, null, 2))
    }
    for (const [view, suffix] of views) { await closeup(page, 'PART', view!); await capture(page, testInfo, `${name}-${suffix}`) }
    expect(await exportedNativeGraph(page)).toEqual(fileGraph(graph))
  }
  expect(errors).toEqual([])
}

test('refined ceramic coating retains native closeups and readable capacitor values', async ({ page }, testInfo) => {
  await captureRefinedSurfaces(page, testInfo, ['GENERIC_CAPACITOR', 'GENERIC_CAPACITOR_ELECTROLYTIC'])
})

test('refined LED optics retain the dark resin and faint frame in actual native views', async ({ page }, testInfo) => {
  await captureRefinedSurfaces(page, testInfo, ['GENERIC_LED'])
})
