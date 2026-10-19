import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getArtifactDirectory } from '../../../scripts/artifact-paths.mjs'
import { resolve } from 'node:path'
import type { Mesh, Object3D, PerspectiveCamera } from 'three'
import type { CircuitGraph } from '../src/types/circuit'
import { exportedNativeGraph, observeNativeScene, sceneReady, workspaceCanvas } from './native-scene'

type ProbedCanvas = HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D; camera: PerspectiveCamera; frames: number; target?: number[] }; nativeNavigation?: { target: number[]; reference: number; percent: number } }
const directory = getArtifactDirectory(`unified-camera/${process.env.NETCIRCUIT_CAMERA_BASELINE ? 'before' : 'anchored-after'}`)

async function settled(page: Page) {
  let previous = '', stable = 0
  await expect.poll(async () => {
    const pose = await workspaceCanvas(page).evaluate(element => {
      const camera = (element as ProbedCanvas).nativeSceneProbe?.camera
      return camera ? JSON.stringify([...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements].map(value => Math.round(value * 1e7))) : ''
    })
    stable = pose && pose === previous ? stable + 1 : 0; previous = pose
    return stable
  }, { intervals: [100], timeout: 30_000 }).toBeGreaterThanOrEqual(2)
}

async function open(page: Page, graph: CircuitGraph) {
  await expect(page.getByRole('button', { name: 'Open account', exact: true })).toHaveText('Guest', { timeout: 30_000 })
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'unified-camera.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
  await expect.poll(async () => (await exportedNativeGraph(page)).circuit_id, { timeout: 60_000 }).toBe(graph.circuit_id)
  await settled(page)
}

async function measure(page: Page) {
  const percent = Number((await page.getByLabel('Workspace magnification', { exact: true }).textContent())?.replace('%', ''))
  const state = await workspaceCanvas(page).evaluate((element, percent) => {
    const canvas = element as ProbedCanvas, probe = canvas.nativeSceneProbe!
    const manager = (canvas as unknown as { __vueParentComponent?: { setupState?: { manager?: { target: () => { toArray: () => number[] }; navigationSnapshot?: () => { zoom: number; minZoom: number; maxZoom: number; referenceDistance: number; overviewTarget: number[]; boundsRevision: number } } } } }).__vueParentComponent?.setupState?.manager
    const navigation = manager?.navigationSnapshot?.()
    const camera = probe.camera, point = camera.position.clone(), projected: number[][] = [], resources: unknown[] = [], modules: Record<string, number[][]> = {}
    let worldMin = [Infinity, Infinity, Infinity], worldMax = [-Infinity, -Infinity, -Infinity]
    probe.scene.updateMatrixWorld(true)
    const visit = (root: Object3D, id: string) => {
      modules[id] = []
      root.traverse(object => {
        const mesh = object as Mesh
        if (!mesh.isMesh || !mesh.geometry || mesh.userData.isOutline || mesh.userData.clippingHelper) return
        let parent: Object3D | null = object
        while (parent && parent !== root) { if (!parent.visible || parent.userData.isOutline || parent.userData.clippingHelper) return; parent = parent.parent }
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        if (!mesh.visible || !materials.some(material => material.visible && material.opacity > 0)) return
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        const box = mesh.geometry.boundingBox; if (!box || box.isEmpty()) return
        resources.push({ object: object.uuid, geometry: mesh.geometry.uuid, material: materials.map(material => material.uuid), matrix: [...object.matrixWorld.elements] })
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          point.set(x, y, z).applyMatrix4(mesh.matrixWorld)
          worldMin = worldMin.map((value, axis) => Math.min(value, point.getComponent(axis))); worldMax = worldMax.map((value, axis) => Math.max(value, point.getComponent(axis)))
          point.project(camera); const p = point.toArray(); projected.push(p); modules[id].push(p)
        }
      })
    }
    probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id !== 'PLACE') visit(object, String(object.userData.id)); if (object.name === 'committed-wires') visit(object, '$wires') })
    const xs = projected.map(point => point[0]), ys = projected.map(point => point[1]), zs = projected.map(point => point[2])
    const gl = canvas.getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info')
    const rect = canvas.getBoundingClientRect(), layout = canvas.closest('.workbench-layout')
    const tools = layout?.querySelector('.tools-panel[data-drawer-occupied=true]')?.getBoundingClientRect()
    const components = layout?.querySelector('.component-panel[data-drawer-occupied=true]')?.getBoundingClientRect()
    const usable = { left: -1 + 2 * Math.max(0, (tools?.right ?? rect.left) - rect.left) / rect.width, right: 1,
      top: 1 - 2 * Math.max(0, (components?.bottom ?? rect.top) - rect.top) / rect.height, bottom: -1 }
    const target = manager?.target().toArray() ?? canvas.nativeNavigation?.target ?? probe.target
    const distance = target ? Math.hypot(...camera.position.toArray().map((value, axis) => value - target[axis])) : undefined
    return { percent, navigation, target, reference: navigation?.referenceDistance ?? canvas.nativeNavigation?.reference ?? (distance === undefined ? undefined : distance * percent / 100), position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), near: camera.near, far: camera.far,
      coverage: { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys), minDepth: Math.min(...zs), maxDepth: Math.max(...zs) }, usable, modules, worldMin, worldMax, resources,
      graphics: { cssSize: [canvas.clientWidth, canvas.clientHeight], drawingBuffer: [canvas.width, canvas.height], dpr: devicePixelRatio, backend: debug ? gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER), depthBits: gl?.getParameter(gl.DEPTH_BITS) } }
  }, percent)
  if (!process.env.NETCIRCUIT_CAMERA_BASELINE) {
    expect(state.navigation, 'read the live controller snapshot through the native Vue component').toBeDefined()
    expect(Math.abs(state.percent - state.navigation!.zoom), 'UI matches actual camera readback without a feedback command').toBeLessThanOrEqual(.0051)
  }
  return state
}

function visible(state: Awaited<ReturnType<typeof measure>>) {
  const c = state.coverage
  return c.left >= -1.001 && c.right <= 1.001 && c.bottom >= -1.001 && c.top <= 1.001 && c.minDepth >= -1.001 && c.maxDepth <= 1.001
}

function pureZoom(before: Awaited<ReturnType<typeof measure>>, after: Awaited<ReturnType<typeof measure>>) {
  expect(after.target, 'zoom keeps the focal target').toEqual(before.target)
  expect(after.quaternion, 'zoom keeps the camera orientation').toEqual(before.quaternion)
  expect(after.reference, 'zoom keeps the last explicit Fit or Home reference').toBe(before.reference)
  const direction = (state: typeof before) => {
    const offset = state.position.map((value, axis) => value - state.target![axis]), distance = Math.hypot(...offset)
    return offset.map(value => value / distance)
  }
  const a = direction(before), b = direction(after)
  expect(Math.hypot(...b.map((value, axis) => value - a[axis])), 'zoom only changes distance along its existing view direction').toBeLessThan(1e-9)
}

async function progress(name: string, stages: { name: string; state: Awaited<ReturnType<typeof measure>> }[]) {
  await writeFile(resolve(directory, `${name}-progress.json`), JSON.stringify(stages.map(({ name, state }) => {
    const { resources: _resources, modules: _modules, ...pose } = state
    return { name, ...pose }
  }), null, 2))
}

async function zoomOut(page: Page) {
  for (let clicks = 0; clicks < 300; clicks++) {
    const button = page.getByRole('button', { name: 'Zoom Out', exact: true })
    if (await button.isDisabled()) break
    await button.click()
  }
  await settled(page)
  await expect(page.getByLabel('Workspace magnification', { exact: true })).toHaveText('50%')
}

function fixture(offset = { x: 0, z: 0 }): CircuitGraph {
  return { schema_version: '1.2', circuit_id: `unified-camera-${offset.x}-${offset.z}`, modules: [
    { id: 'SCOPE', type: 'OSCILLOSCOPE', position: { x: offset.x - 15, y: 0, z: offset.z } },
    { id: 'GEN', type: 'GENERATOR', position: { x: offset.x + 15, y: 0, z: offset.z } },
    { id: 'DISPLAY', type: 'SEGMENT_SC5611EWA', position: { x: offset.x + 15, y: .33, z: offset.z + 2 }, physicalDescriptor: { version: 1, partId: 'KINGBRIGHT-SC56-11EWA', partRevision: 2, packageId: 'SC56-11EWA-TH-BBI3', packageRevision: 2 } },
  ], connections: [] }
}

test('camera framing fits separated instruments tightly, preserves an Area zoom anchor and homes a translated circuit', async ({ page }, info) => {
  test.setTimeout(240_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await mkdir(directory, { recursive: true }); await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  await open(page, fixture())
  const original = await exportedNativeGraph(page), stages: { name: string; state: Awaited<ReturnType<typeof measure>> }[] = []
  const record = async (name: string) => {
    await settled(page); const state = await measure(page)
    stages.push({ name, state }); await workspaceCanvas(page).screenshot({ path: resolve(directory, `${info.project.name || 'wide'}-${name}.png`), timeout: 90_000 })
    await progress(info.project.name || 'wide', stages)
    return state
  }
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
  const fit = await record('fit-separated')
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
  const repeat = await record('fit-repeat')
  const canvas = workspaceCanvas(page), rect = await canvas.boundingBox(); if (!rect) throw Error('Missing canvas bounds.')
  const gen = fit.modules.GEN, xs = gen.map(p => p[0]), ys = gen.map(p => p[1])
  const area = { left: rect.x + (Math.min(...xs) + 1) * rect.width / 2, right: rect.x + (Math.max(...xs) + 1) * rect.width / 2, top: rect.y + (1 - Math.max(...ys)) * rect.height / 2, bottom: rect.y + (1 - Math.min(...ys)) * rect.height / 2 }
  await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
  await page.mouse.move(area.left, area.top); await page.mouse.down(); await page.mouse.move(area.right, area.bottom, { steps: 10 }); await page.mouse.up()
  const inspect = await record('peripheral-area')
  await zoomOut(page); const returned = await record('area-return-50')
  pureZoom(inspect, returned)
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click()
  const fitAfterArea = await record('fit-after-area-50')
  expect(await exportedNativeGraph(page), 'Area and zoom retain the exact committed circuit').toEqual(original)
  expect(returned.resources).toEqual(fit.resources)
  expect(returned.graphics.cssSize).toEqual(fit.graphics.cssSize)
  await open(page, fixture({ x: 80, z: 40 }))
  const translated = await exportedNativeGraph(page)
  await page.getByRole('button', { name: 'Home view', exact: true }).click()
  const home = await record('home-translated')
  await zoomOut(page); const home50 = await record('home-translated-50')
  expect(await exportedNativeGraph(page), 'camera commands preserve translated CircuitGraph').toEqual(translated)
  const evidence = { fixture: original, translatedFixture: translated, errors, stages }
  await writeFile(resolve(directory, `${info.project.name || 'wide'}-evidence.json`), JSON.stringify(evidence, null, 2))
  await info.attach('camera-framing-evidence', { body: Buffer.from(JSON.stringify(evidence)), contentType: 'application/json' })
  const extent = Math.max((fit.coverage.right - fit.coverage.left) / (fit.usable.right - fit.usable.left), (fit.coverage.top - fit.coverage.bottom) / (fit.usable.top - fit.usable.bottom))
  expect(visible(fit), 'Fit contains all circuit geometry').toBe(true)
  expect(extent, 'tight Fit uses at least 89% of one usable viewport dimension').toBeGreaterThanOrEqual(.89)
  expect(Math.hypot(...repeat.position.map((value, axis) => value - fit.position[axis])), 'a repeated Fit is idempotent').toBeLessThan(1e-8)
  expect(inspect.percent, 'Area readback uses the full-circuit reference').toBeGreaterThan(100)
  expect(visible(fitAfterArea), 'Fit restores the entire circuit after inspection').toBe(true)
  expect(visible(home), 'Home contains a circuit translated far from the world origin').toBe(true)
  expect(home.percent).toBe(100)
  expect(visible(home50), 'Home then 50% retains the entire translated circuit').toBe(true)
  expect(errors).toEqual([])
})

test('zoom framing preserves target and orientation through off-center native wheel, plus and minus after Area', async ({ page }, info) => {
  test.setTimeout(180_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await mkdir(directory, { recursive: true }); await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  await open(page, fixture({ x: 25, z: -18 }))
  const original = await exportedNativeGraph(page), stages: { name: string; state: Awaited<ReturnType<typeof measure>> }[] = []
  const record = async (name: string) => {
    await settled(page); const state = await measure(page); stages.push({ name, state })
    await workspaceCanvas(page).screenshot({ path: resolve(directory, `${info.project.name || 'wide'}-${name}.png`), timeout: 90_000 }); await progress(`${info.project.name || 'wide'}-interaction`, stages); return state
  }
  const fit = async () => { await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settled(page); return measure(page) }
  const initial = await fit(), canvas = workspaceCanvas(page), rect = await canvas.boundingBox(); if (!rect) throw Error('Missing workspace bounds.')
  const dragArea = async (left: number, top: number, right: number, bottom: number) => {
    await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
    await page.mouse.move(rect.x + left, rect.y + top); await page.mouse.down(); await page.mouse.move(rect.x + right, rect.y + bottom, { steps: 10 }); await page.mouse.up(); await settled(page)
  }
  const gen = initial.modules.GEN, xs = gen.map(p => p[0]), ys = gen.map(p => p[1])
  const left = (Math.min(...xs) + 1) * rect.width / 2, right = (Math.max(...xs) + 1) * rect.width / 2
  const top = (1 - Math.max(...ys)) * rect.height / 2, bottom = (1 - Math.min(...ys)) * rect.height / 2
  await dragArea(left + (right - left) * .15, top + (bottom - top) * .42, left + (right - left) * .55, top + (bottom - top) * .92)
  const partial = await record('partial-generator-area')
  expect(partial.percent, 'a sub-model Area can inspect more closely than a full overview').toBeGreaterThan(100)
  expect(partial.reference!, 'reference inferred from rounded UI readback remains calibrated').toBeCloseTo(initial.reference!, 2)
  await page.mouse.move(rect.x + rect.width * .8, rect.y + rect.height * .65)
  for (let step = 0; step < 7; step++) {
    await page.mouse.wheel(0, -600); await settled(page)
    const current = await measure(page)
    pureZoom(partial, current)
    const percent = Number((await page.getByLabel('Workspace magnification', { exact: true }).textContent())?.replace('%', ''))
    if (percent >= 1000 || await page.getByRole('button', { name: 'Zoom In', exact: true }).isDisabled()) break
  }
  const wheelIn = await record('wheel-inspect')
  expect(wheelIn.percent).toBeGreaterThanOrEqual(partial.percent)
  expect(wheelIn.percent, 'inspection retains the established finite magnification range').toBeLessThanOrEqual(1000)
  await page.getByRole('button', { name: 'Zoom Out', exact: true }).click(); await settled(page)
  const minus = await record('minus-after-area')
  pureZoom(partial, minus)
  if (await page.getByRole('button', { name: 'Zoom In', exact: true }).isEnabled()) {
    await page.getByRole('button', { name: 'Zoom In', exact: true }).click(); await settled(page)
    const plus = await record('plus-after-area')
    pureZoom(partial, plus)
  }
  await page.mouse.move(rect.x + rect.width * .8, rect.y + rect.height * .65)
  for (let count = 0; count < 20; count++) {
    await page.mouse.wheel(0, 1200); await settled(page)
    const current = await measure(page)
    pureZoom(partial, current)
    if (Number((await page.getByLabel('Workspace magnification', { exact: true }).textContent())?.replace('%', '')) === 50) break
  }
  const wheelOut = await record('wheel-return-50'); expect(wheelOut.percent).toBe(50)
  pureZoom(partial, wheelOut)
  await page.mouse.wheel(0, 12000); await settled(page)
  const limitedOut = await measure(page)
  expect(Math.hypot(...limitedOut.position.map((value, axis) => value - wheelOut.position[axis])), 'continued scrolling at the limit does not translate the camera').toBeLessThan(1e-9)
  pureZoom(partial, limitedOut)
  await fit()
  await page.mouse.move(rect.x + rect.width * .55, rect.y + rect.height * .55)
  await page.mouse.down({ button: 'right' }); await page.mouse.move(rect.x + rect.width * .55 + 75, rect.y + rect.height * .55 + 15, { steps: 10 }); await page.mouse.up({ button: 'right' })
  const orbit = await record('native-right-orbit'), orbitFit = await fit()
  expect(orbit.reference, 'native Orbit retains the established zoom reference').toBe(partial.reference)
  expect(orbitFit.quaternion.map((value, axis) => Math.abs(value - orbit.quaternion[axis])).every(delta => delta < 1e-7), 'Fit retains native Orbit orientation').toBe(true)
  expect(visible(orbitFit)).toBe(true)
  await dragArea(rect.width * .45, rect.height * .45, rect.width * .55, rect.height * .65)
  const empty = await record('empty-center-area')
  expect([...empty.position, empty.near, empty.far, empty.percent].every(Number.isFinite)).toBe(true)
  expect(empty.reference!).toBeCloseTo(orbitFit.reference!, 2)
  await zoomOut(page); const empty50 = await record('empty-area-return-50')
  pureZoom(empty, empty50)
  const size = page.viewportSize()!
  await page.setViewportSize({ width: size.width + 100, height: size.height + 50 })
  const resized = await record('resized-readback')
  expect(resized.position, 'resize changes projection while retaining the current camera pose').toEqual(empty50.position)
  expect(resized.reference, 'resize retains the established zoom reference').toBe(empty50.reference)
  expect(resized.percent, 'resize does not change magnification').toBe(empty50.percent)
  expect(resized.graphics.cssSize).not.toEqual(empty50.graphics.cssSize)
  await fit(); const resizedOverview = await record('resized-fit'); expect(visible(resizedOverview)).toBe(true)
  const frames = await canvas.evaluate(element => (element as ProbedCanvas).nativeSceneProbe!.frames)
  const contextRestorable = await canvas.evaluate(element => {
    const extension = (element as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 500); return true
  })
  expect(contextRestorable, 'the real WebGL context supports a restore regression').toBe(true)
  await expect.poll(() => canvas.evaluate(element => (element as ProbedCanvas).nativeSceneProbe?.frames ?? 0), { timeout: 30_000 }).toBeGreaterThan(frames)
  await expect(page.getByText('Graphics context interrupted. Waiting for recovery…', { exact: true })).toHaveCount(0)
  const restored = await record('context-restored')
  expect(restored.position).toEqual(resizedOverview.position); expect(visible(restored)).toBe(true)
  expect(await exportedNativeGraph(page)).toEqual(original)
  expect(restored.resources).toEqual(initial.resources)
  expect(errors).toEqual([])
  await writeFile(resolve(directory, `${info.project.name || 'wide'}-interaction-evidence.json`), JSON.stringify({ graph: original, stages, errors }, null, 2))
})

test('camera Area framing retains a thin foreground wire at the rectangle center and preserves native wire picking', async ({ page }, info) => {
  test.setTimeout(180_000)
  await mkdir(directory, { recursive: true }); await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  const graph: CircuitGraph = { schema_version: '1.2', circuit_id: 'camera-area-wire', modules: [{ id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }], connections: [
    { source: 'BB.contact:terminal:A:10', destination: 'BB.contact:terminal:D:26', metadata: { wireVisual: { version: 1, color: '#8656a8', routeMode: 'FREE', controlPoints: [{ space: 'world', position: { x: 0, y: 1.5, z: 0 } }], thickness: .035, height: .03 } } },
  ] }
  await open(page, graph)
  await page.getByRole('button', { name: 'View TOP', exact: true }).press('Enter'); await settled(page)
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settled(page)
  const original = await exportedNativeGraph(page), before = await measure(page)
  const center = await workspaceCanvas(page).evaluate(element => {
    const canvas = element as ProbedCanvas, probe = canvas.nativeSceneProbe!, wire = probe.scene.getObjectByName('committed-wires')?.children.find(object => object.userData.kind === 'wire')
    const path = wire?.children.find(object => (object as { isLine?: boolean }).isLine) as Mesh | undefined
    if (!wire || !path) throw Error('Missing rendered wire and its real centerline.')
    const positions = path.geometry.getAttribute('position'), point = wire.position.clone(), best = point.clone()
    let highest = -Infinity
    for (let index = 0; index < positions.count; index++) { point.fromBufferAttribute(positions, index).applyMatrix4(path.matrixWorld); if (point.y > highest) { highest = point.y; best.copy(point) } }
    best.project(probe.camera); const rect = canvas.getBoundingClientRect()
    return { x: rect.left + (best.x + 1) * rect.width / 2, y: rect.top + (1 - best.y) * rect.height / 2 }
  })
  await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
  await page.mouse.move(center.x - 40, center.y - 40); await page.mouse.down(); await page.mouse.move(center.x + 40, center.y + 40, { steps: 10 }); await page.mouse.up(); await settled(page)
  const after = await measure(page), rect = await workspaceCanvas(page).boundingBox(); if (!rect) throw Error('Missing canvas bounds.')
  const hit = await workspaceCanvas(page).evaluate(async element => {
    const modulePath = '/node_modules/three/build/three.module.js', { Raycaster } = await import(modulePath)
    const probe = (element as ProbedCanvas).nativeSceneProbe!, ray = new Raycaster(), wires = probe.scene.getObjectByName('committed-wires')!
    ray.setFromCamera({ x: 0, y: 0 }, probe.camera)
    const result = ray.intersectObjects(wires.children, false)[0]
    return result ? { kind: result.object.userData.kind, distance: result.distance } : null
  })
  await workspaceCanvas(page).screenshot({ path: resolve(directory, `${info.project.name || 'wide'}-foreground-wire-area.png`), timeout: 90_000 })
  await writeFile(resolve(directory, `${info.project.name || 'wide'}-wire-area-evidence.json`), JSON.stringify({ before, after, hit, graph: original }, null, 2))
  expect(after.percent).toBeGreaterThan(100)
  expect(hit?.kind, 'the thin foreground wire remains at the selected rectangle center').toBe('wire')
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await expect(page.getByRole('region', { name: 'Jumper wire options', exact: true })).toBeVisible()
  expect(await exportedNativeGraph(page)).toEqual(original)
  // A thin-wire close-up can require many fixed button steps. Exercise the
  // native wheel for the longer distance, then the actual minus
  // button for the final steps; the first case tests its complete button path.
  await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .4)
  for (let step = 0; step < 30; step++) {
    const percent = Number((await page.getByLabel('Workspace magnification', { exact: true }).textContent())?.replace('%', ''))
    if (percent <= 500) break
    await page.mouse.wheel(0, 1200); await settled(page)
  }
  await zoomOut(page)
  const zoomedOut = await measure(page)
  pureZoom(after, zoomedOut)
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settled(page)
  expect(visible(await measure(page))).toBe(true)
})
