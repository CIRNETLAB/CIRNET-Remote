import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { getArtifactDirectory } from '../../../scripts/artifact-paths.mjs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { REVISION, type InstancedMesh, type Mesh, type Object3D, type PerspectiveCamera } from 'three'
import type { CircuitGraph } from '../src/types/circuit'
import { exportedNativeGraph, nativeSceneEvidence, observeNativeScene, projectContact, sceneReady, workspaceCanvas } from './native-scene'

type Canvas = HTMLCanvasElement & { nativeSceneProbe?: { scene: Object3D; camera: PerspectiveCamera; frames: number; memory: { geometries: number; textures: number } } }
const directory = getArtifactDirectory('depth-workspace-acceptance')

async function settled(page: Page) {
  let previous = '', stable = 0
  await expect.poll(async () => {
    const pose = await workspaceCanvas(page).evaluate(element => {
      const camera = (element as Canvas).nativeSceneProbe?.camera
      return camera ? JSON.stringify([...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements].map(value => Math.round(value * 1e7))) : ''
    })
    stable = pose && pose === previous ? stable + 1 : 0; previous = pose
    return stable
  }, { intervals: [100], timeout: 30_000 }).toBeGreaterThanOrEqual(2)
}

async function snapshot(page: Page) {
  return workspaceCanvas(page).evaluate((element, threeRevision) => {
    const canvas = element as Canvas, probe = canvas.nativeSceneProbe
    if (!probe) throw Error('Missing native workspace renderer.')
    const resources: unknown[] = []
    probe.scene.traverse(object => {
      if (object.userData.kind !== 'module' && object.name !== 'committed-wires') return
      object.traverse(child => {
        const mesh = child as Mesh
        if (!mesh.isMesh) return
        resources.push({ mesh: mesh.uuid, geometry: mesh.geometry.uuid, material: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.uuid), matrix: [...mesh.matrixWorld.elements] })
      })
    })
    const gl = canvas.getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info')
    return { near: probe.camera.near, far: probe.camera.far, position: probe.camera.position.toArray(), quaternion: probe.camera.quaternion.toArray(), resources, memory: probe.memory,
      graphics: { threeRevision, backend: debug ? gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER), depthBits: gl?.getParameter(gl.DEPTH_BITS), drawingBuffer: [canvas.width, canvas.height], dpr: window.devicePixelRatio } }
  }, REVISION)
}

async function open(page: Page, graph: CircuitGraph) {
  // Initial native rendering can precede session bootstrap. Wait for the public
  // principal UI so its synchronous privacy reset cannot cancel file.text().
  await expect(page.getByRole('button', { name: 'Open account', exact: true })).toHaveText('Guest', { timeout: 30_000 })
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'depth-navigation.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
  await expect.poll(async () => (await exportedNativeGraph(page)).circuit_id, { timeout: 60_000 }).toBe(graph.circuit_id)
  await settled(page)
}

async function tool(page: Page, name: string) {
  const expand = page.getByRole('button', { name: 'Expand Tools', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.getByRole('button', { name, exact: true }).click()
}

test('real workspace depth navigation preserves graph and model resources through toolbar zoom, right Orbit, pan, Fit and ViewCube', async ({ page }, info) => {
  test.setTimeout(300_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await mkdir(directory, { recursive: true })
  await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  const graph: CircuitGraph = { schema_version: '1.2', circuit_id: 'workspace-depth-navigation', modules: [
    { id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } },
    { id: 'SCOPE', type: 'OSCILLOSCOPE', position: { x: -6, y: 0, z: -4 } },
    { id: 'GEN', type: 'GENERATOR', position: { x: 1, y: 0, z: -4 } },
    { id: 'PS', type: 'DC_SUPPLY', position: { x: 6, y: 0, z: -4 } },
    { id: 'DISPLAY', type: 'SEGMENT_SC5611EWA', position: { x: 0, y: .33, z: 0 }, physicalDescriptor: { version: 1, partId: 'KINGBRIGHT-SC56-11EWA', partRevision: 2, packageId: 'SC56-11EWA-TH-BBI3', packageRevision: 2 } },
  ], connections: [] }
  await open(page, graph)
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settled(page)
  const original = await exportedNativeGraph(page), before = await snapshot(page), stages: unknown[] = []
  const canvas = workspaceCanvas(page), rect = await canvas.boundingBox(); if (!rect) throw Error('Missing canvas bounds.')
  const record = async (name: string) => {
    await settled(page)
    const state = await snapshot(page)
    expect(state.near).toBeGreaterThan(0); expect(state.far).toBeGreaterThan(state.near)
    expect([...state.position, ...state.quaternion, state.near, state.far].every(Number.isFinite)).toBe(true)
    expect(state.resources, `${name}: navigation does not rebuild or move models`).toEqual(before.resources)
    expect(await exportedNativeGraph(page), `${name}: navigation preserves CircuitGraph`).toEqual(original)
    const path = resolve(directory, `${name}.png`); await canvas.screenshot({ path, timeout: 90_000 }); await info.attach(name, { path, contentType: 'image/png' })
    stages.push({ name, near: state.near, far: state.far, position: state.position, quaternion: state.quaternion, memory: state.memory })
    return state
  }
  for (const zoom of [50, 100, 1000]) {
    // Establish this direction's explicit Fit overview before each absolute
    // toolbar level, then exercise the actual +/- buttons from its 100% state.
    await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settled(page)
    let current = Number((await page.getByLabel('Workspace magnification', { exact: true }).textContent())?.replace('%', ''))
    for (let clicks = 0; current !== zoom && clicks < 110; clicks++) {
      await page.getByRole('button', { name: current > zoom ? 'Zoom Out' : 'Zoom In', exact: true }).click()
      current = Number((await page.getByLabel('Workspace magnification', { exact: true }).textContent())?.replace('%', ''))
    }
    await expect(page.getByLabel('Workspace magnification', { exact: true })).toHaveText(`${zoom}%`)
    const preOrbit = await record(`zoom-${zoom}`)
    await page.mouse.move(rect.x + rect.width * .55, rect.y + rect.height * .55)
    await page.mouse.down({ button: 'right' }); await page.mouse.move(rect.x + rect.width * .55 + 90, rect.y + rect.height * .55 + 20, { steps: 12 }); await page.mouse.up({ button: 'right' })
    const postOrbit = await record(`zoom-${zoom}-right-orbit`)
    expect(postOrbit.quaternion).not.toEqual(preOrbit.quaternion)
  }
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await record('fit')
  for (const view of ['TOP', 'FRONT', 'TOP-FRONT-RIGHT']) {
    await page.getByRole('button', { name: `View ${view}`, exact: true }).press('Enter')
    await expect(page.getByRole('button', { name: `View ${view}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await record(`view-${view.toLowerCase()}`)
  }
  const prePan = await snapshot(page)
  await page.mouse.move(rect.x + rect.width * .6, rect.y + rect.height * .6)
  await page.mouse.down({ button: 'middle' }); await page.mouse.move(rect.x + rect.width * .6 + 45, rect.y + rect.height * .6 + 20, { steps: 8 }); await page.mouse.up({ button: 'middle' })
  const postPan = await record('middle-pan'); expect(postPan.position).not.toEqual(prePan.position)
  await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
  await page.mouse.move(rect.x + rect.width * .35, rect.y + rect.height * .35); await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * .7, rect.y + rect.height * .7, { steps: 10 }); await page.mouse.up()
  const area = await record('zoom-to-area'); expect(area.position).not.toEqual(postPan.position)
  await page.getByRole('button', { name: 'Home view', exact: true }).click()
  const home = await record('home-reset'); expect(home.quaternion).not.toEqual(area.quaternion)
  expect((await nativeSceneEvidence(page)).trustedPointerDowns).toBeGreaterThanOrEqual(5)
  expect(errors).toEqual([])
  const evidence = JSON.stringify({ before: { ...before, resources: undefined }, stages, graph: original, native: await nativeSceneEvidence(page) }, null, 2)
  await writeFile(resolve(directory, 'navigation-evidence.json'), evidence)
  await info.attach('native-navigation-evidence', { body: Buffer.from(evidence), contentType: 'application/json' })
})

test('native wire drawing and bend editing retain endpoints after adaptive navigation', async ({ page }, info) => {
  test.setTimeout(180_000)
  await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  await open(page, { schema_version: '1.2', circuit_id: 'workspace-depth-wire-edit', modules: [{ id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }], connections: [] })
  await page.getByRole('button', { name: 'View TOP', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settled(page)
  await tool(page, 'Wire')
  const start = await projectContact(page, 'BB', 'terminal:A:10'), end = await projectContact(page, 'BB', 'terminal:D:26'), corner = await projectContact(page, 'BB', 'terminal:A:26')
  await page.mouse.click(start.x, start.y)
  await page.mouse.move(corner.x, corner.y); await page.mouse.click(corner.x, corner.y, { button: 'right' })
  await page.mouse.move(end.x, end.y); await page.mouse.click(end.x, end.y)
  const drawn = await exportedNativeGraph(page)
  expect(drawn.connections).toHaveLength(1)
  expect(drawn.connections[0].source).toBe('BB.contact:terminal:A:10'); expect(drawn.connections[0].destination).toBe('BB.contact:terminal:D:26')
  expect((drawn.connections[0].metadata?.wireVisual as { controlPoints: unknown[] }).controlPoints.length).toBeGreaterThan(0)
  await tool(page, 'Select')
  const wirePoint = await workspaceCanvas(page).evaluate(element => {
    const canvas = element as Canvas, probe = canvas.nativeSceneProbe!, wire = probe.scene.getObjectByName('committed-wires')?.children.find(object => object.userData.kind === 'wire')
    const line = wire?.children.find(object => (object as { isLine?: boolean }).isLine) as Mesh | undefined
    if (!line) throw Error('Missing native wire picking path.')
    const positions = line.geometry.getAttribute('position'), point = line.position.clone().fromBufferAttribute(positions, Math.floor(positions.count / 3)).applyMatrix4(line.matrixWorld).project(probe.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  })
  await page.mouse.click(wirePoint.x, wirePoint.y)
  await expect(page.getByRole('region', { name: 'Jumper wire options', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Purple wire', exact: true }).click()
  const recolored = await exportedNativeGraph(page)
  expect((recolored.connections[0].metadata?.wireVisual as { color: string }).color).toBe('#8656a8')
  const handle = await workspaceCanvas(page).evaluate(element => {
    const canvas = element as Canvas, probe = canvas.nativeSceneProbe!, handles = probe.scene.getObjectByName('wire-handles') as InstancedMesh
    if (!handles?.count) throw Error('Missing actual wire bend handles.')
    const matrix = handles.matrix.clone(); handles.getMatrixAt(0, matrix)
    const point = handles.position.clone().setFromMatrixPosition(matrix).applyMatrix4(handles.matrixWorld).project(probe.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  })
  await page.mouse.move(handle.x, handle.y); await page.mouse.down(); await page.mouse.move(handle.x - 24, handle.y + 15, { steps: 10 }); await page.mouse.up()
  const edited = await exportedNativeGraph(page)
  expect(edited.connections[0].source).toBe(drawn.connections[0].source); expect(edited.connections[0].destination).toBe(drawn.connections[0].destination)
  expect(edited.connections[0].metadata?.wireVisual).not.toEqual(recolored.connections[0].metadata?.wireVisual)
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(recolored)
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(edited)
  await mkdir(directory, { recursive: true })
  await workspaceCanvas(page).screenshot({ path: resolve(directory, 'wire-drawn-and-edited.png') })
  const evidence = JSON.stringify({ drawn, recolored, edited, native: await nativeSceneEvidence(page) }, null, 2)
  await writeFile(resolve(directory, 'wire-evidence.json'), evidence); await info.attach('native-wire-evidence', { body: Buffer.from(evidence), contentType: 'application/json' })
})

test('an empty workspace supports a visible ground placement preview, commit and history after adaptive navigation', async ({ page }, info) => {
  test.setTimeout(150_000)
  await observeNativeScene(page); await page.goto('/'); await sceneReady(page)
  const graph: CircuitGraph = { schema_version: '1.2', circuit_id: 'workspace-depth-empty-placement', modules: [], connections: [] }
  await open(page, graph)
  await page.getByRole('button', { name: 'View TOP-FRONT-RIGHT', exact: true }).press('Enter'); await settled(page)
  const original = await exportedNativeGraph(page), empty = await snapshot(page)
  await mkdir(directory, { recursive: true })
  const captureGrid = async (name: string) => {
    const png = await workspaceCanvas(page).screenshot({ path: resolve(directory, `${name}.png`) })
    const metadata = await sharp(png).metadata(), width = metadata.width!, height = metadata.height!
    const roi = { left: 180, top: Math.floor(height * .78), width: 120, height: 100 }
    const pixels = await sharp(png).extract(roi).removeAlpha().raw().toBuffer()
    const colors = new Map<string, number>()
    for (let index = 0; index < pixels.length; index += 3) { const key = `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`; colors.set(key, (colors.get(key) ?? 0) + 1) }
    const background = [...colors].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
    let gridPixels = 0
    for (let index = 0; index < pixels.length; index += 3) if (Math.max(...background.map((value, channel) => Math.abs(value - pixels[index + channel]))) > 3) gridPixels++
    await info.attach(name, { body: png, contentType: 'image/png' })
    return { name, pixels, imageSize: [width, height], roi, background, gridPixels, camera: (await snapshot(page)).position }
  }
  const emptyGrid = await captureGrid('empty-workspace-grid-before-placement')
  expect(emptyGrid.gridPixels, 'the empty-workspace background ROI contains visible grid strokes').toBeGreaterThan(10)
  const expand = page.getByRole('button', { name: 'Expand Ribbon', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.locator('[data-group="structure"]').click()
  await page.locator('[data-component-type="BREADBOARD_100"]').click()
  const canvas = workspaceCanvas(page), rect = await canvas.boundingBox(); if (!rect) throw Error('Missing empty workspace bounds.')
  const point = { x: rect.x + rect.width * .6, y: rect.y + rect.height * .62 }
  await page.mouse.move(point.x, point.y)
  await expect.poll(async () => (await nativeSceneEvidence(page)).preview).toBe(true)
  expect(await exportedNativeGraph(page), 'the visible preview remains outside CircuitGraph').toEqual(original)
  const preview = await snapshot(page)
  expect(preview.near).toBeGreaterThan(0); expect(preview.far).toBeGreaterThan(preview.near)
  const previewGrid = await captureGrid('empty-workspace-grid-with-preview')
  expect(previewGrid.camera).toEqual(emptyGrid.camera)
  expect(previewGrid.pixels, 'placement preview cannot alter the distant grid').toEqual(emptyGrid.pixels)
  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => (await exportedNativeGraph(page)).modules.length).toBe(1)
  await canvas.press('Escape')
  const placed = await exportedNativeGraph(page)
  expect(placed.modules[0].type).toBe('BREADBOARD_100'); expect(placed.modules[0].mount).toBeUndefined()
  expect(Object.values(placed.modules[0].position ?? {}).every(Number.isFinite)).toBe(true)
  expect(placed.connections).toEqual([])
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(original)
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(placed)
  const placedGrid = await captureGrid('empty-workspace-ground-placement')
  expect(placedGrid.camera).toEqual(emptyGrid.camera)
  expect(placedGrid.pixels, 'committing a model cannot alter the distant grid').toEqual(emptyGrid.pixels)
  await tool(page, 'Move')
  const body = await canvas.evaluate((element, id) => {
    const canvas = element as Canvas, probe = canvas.nativeSceneProbe!
    let model: Object3D | undefined
    probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === id) model = object })
    const deck = model?.children.find(object => object.userData.breadboardDeck) as Mesh | undefined
    if (!deck) throw Error('Missing actual placed Breadboard deck.')
    deck.updateWorldMatrix(true, false); deck.geometry.computeBoundingBox()
    const box = deck.geometry.boundingBox!, point = deck.position.clone().set(box.min.x + (box.max.x - box.min.x) * .2, box.max.y, 0).applyMatrix4(deck.matrixWorld).project(probe.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  }, placed.modules[0].id)
  await page.mouse.move(body.x, body.y); await page.mouse.down(); await page.mouse.move(body.x + 45, body.y - 20, { steps: 10 }); await page.mouse.up()
  const moved = await exportedNativeGraph(page)
  expect(moved.modules[0].position).not.toEqual(placed.modules[0].position)
  expect(moved.connections).toEqual(placed.connections)
  const movedGrid = await captureGrid('empty-workspace-grid-after-model-move')
  expect(movedGrid.camera).toEqual(emptyGrid.camera)
  expect(movedGrid.pixels, 'native model dragging cannot alter the distant grid').toEqual(emptyGrid.pixels)
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(placed)
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect(await exportedNativeGraph(page)).toEqual(moved)
  const evidence = JSON.stringify({ empty: { ...empty, resources: undefined }, preview: { ...preview, resources: undefined }, placed, moved, grid: [emptyGrid, previewGrid, placedGrid, movedGrid].map(({ pixels, ...record }) => record), native: await nativeSceneEvidence(page) }, null, 2)
  await writeFile(resolve(directory, 'empty-placement-evidence.json'), evidence); await info.attach('native-empty-placement-evidence', { body: Buffer.from(evidence), contentType: 'application/json' })
})
