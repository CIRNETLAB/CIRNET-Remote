import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { getArtifactDirectory } from '../../../scripts/artifact-paths.mjs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Camera, Mesh, MeshStandardMaterial, Object3D, WebGLRenderer, BufferGeometry } from 'three'
import type { CircuitGraph, CircuitModule } from '../src/types/circuit'
import type * as Catalog from '../src/data/partCatalog'
import type { solveMounting as Solver } from '../src/electrical/mounting'
import type { boardContactMechanics as Mechanics } from '../src/geometry/BreadboardMechanicalProfile'
import type { defaultWireVisual as WireVisual } from '../src/wires/wireVisual'
import { exportedNativeGraph, nativeSceneEvidence, sceneReady, workspaceCanvas } from './native-scene'

type Runtime = typeof Catalog & { solveMounting: typeof Solver; boardContactMechanics: typeof Mechanics; defaultWireVisual: typeof WireVisual; WIRE_RADIAL_SEGMENTS: number }
interface GalleryProbe { scene: Object3D; camera: Camera; frames: number; memory: { geometries: number; textures: number }; render: { calls: number; triangles: number; lines: number; points: number } }
type GalleryCanvas = HTMLCanvasElement & { nativeSceneProbe?: GalleryProbe; galleryCutaway?: { object: Object3D; visible: boolean; mesh?: Mesh; geometry?: BufferGeometry; cut?: BufferGeometry }[] }
const directory = getArtifactDirectory('contacts-wires-gallery')
const cases = [
  ['SLIDE', 'SLIDE_SWITCH_SS12D10', 0, -2.8], ['TACTILE', 'PUSH_BUTTON_B3F1000', 0, -1.1],
  ['DIP', 'DIP_SWITCH_A6D4100', 0, .4], ['SINGLE', 'SEGMENT_SC5611EWA', 0, 2.5],
  ['DOUBLE', 'SEGMENT_DC5611EWA', 1, -2.5], ['QUAD', 'SEGMENT_CC5612EWA', 1, .3], ['BUZZER', 'BUZZER_PS1240', 1, 3],
] as const

async function runtime(): Promise<Runtime> {
  await mkdir(directory, { recursive: true })
  const filename = resolve(directory, 'runtime.mjs')
  await build({ stdin: { contents: "export * from './src/data/partCatalog'; export {solveMounting} from './src/electrical/mounting'; export {boardContactMechanics} from './src/geometry/BreadboardMechanicalProfile'; export {defaultWireVisual} from './src/wires/wireVisual'; export {WIRE_RADIAL_SEGMENTS} from './src/wires/wireAppearance'", resolveDir: process.cwd(), loader: 'ts' }, outfile: filename, bundle: true, platform: 'node', format: 'esm', packages: 'external' })
  return import(pathToFileURL(filename).href) as Promise<Runtime>
}

/** This observer records the original renderer's output. It changes neither
 * camera/materials nor capability/simulation evidence. */
async function observeGallery(page: Page) {
  await page.addInitScript(() => {
    const events = new EventTarget()
    Object.defineProperty(window, '__THREE_DEVTOOLS__', { configurable: true, value: events })
    events.addEventListener('observe', event => {
      const value: unknown = (event as CustomEvent<unknown>).detail
      if (!value || typeof value !== 'object' || !('isWebGLRenderer' in value) || value.isWebGLRenderer !== true) return
      if (!('domElement' in value) || !(value.domElement instanceof HTMLCanvasElement) || !('render' in value) || typeof value.render !== 'function') return
      const renderer = value as unknown as WebGLRenderer, canvas = renderer.domElement as GalleryCanvas
      if (canvas.getAttribute('aria-label') !== 'Three-dimensional circuit workspace') return
      const original = renderer.render.bind(renderer)
      let trustedPointerDowns = 0, trustedContextMenus = 0
      window.addEventListener('pointerdown', event => { if (event.target === canvas && event.isTrusted) trustedPointerDowns++ }, { capture: true })
      window.addEventListener('contextmenu', event => { if (event.target === canvas && event.isTrusted) trustedContextMenus++ }, { capture: true })
      renderer.render = (scene, camera) => {
        original(scene, camera)
        if (!scene.getObjectByName('flexible-edit-handles')) return
        Object.assign(canvas, { nativeSceneProbe: { scene, camera, frames: (canvas.nativeSceneProbe?.frames ?? 0) + 1, trustedPointerDowns, trustedContextMenus, memory: { ...renderer.info.memory }, render: { ...renderer.info.render } } })
      }
    })
  })
}

async function settle(page: Page) {
  let previous = '', stable = 0
  await expect.poll(async () => {
    const current = await workspaceCanvas(page).evaluate(element => {
      const probe = (element as GalleryCanvas).nativeSceneProbe
      return probe ? JSON.stringify([...probe.camera.position.toArray(), ...probe.camera.quaternion.toArray(), ...probe.camera.projectionMatrix.elements].map(value => Math.round(value * 1e7))) : ''
    })
    stable = current && current === previous ? stable + 1 : 0; previous = current; return stable
  }, { intervals: [150], timeout: 20_000 }).toBeGreaterThanOrEqual(2)
}

async function open(page: Page, graph: CircuitGraph) {
  await page.getByLabel('Open circuit file', { exact: true }).setInputFiles({ name: 'contacts-wires-gallery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(graph)) })
  await expect.poll(async () => {
    const ids = await workspaceCanvas(page).evaluate(element => {
      const probe = (element as GalleryCanvas).nativeSceneProbe, ids: string[] = []
      probe?.scene.traverse(object => { if (object.userData.kind === 'module') ids.push(String(object.userData.id)) }); return ids.sort()
    })
    return ids
  }).toEqual(graph.modules.map(module => module.id).sort())
  await settle(page)
}

function fixture(api: Runtime): CircuitGraph {
  const boards: CircuitModule[] = [{ id: 'BB1', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } }, { id: 'BB2', type: 'BREADBOARD', position: { x: 0, y: 0, z: 3.5 } }]
  const modules = [...boards]
  for (const [id, type, index, x] of cases) {
    const part = api.getPartForType(type)!, solution = api.solveMounting(type, { x, y: .309, z: boards[index]!.position!.z ?? 0 }, 0, modules, id)
    expect(solution?.valid, `${id}: ${solution?.reason}`).toBe(true)
    modules.push({ id, type, mount: solution!.mount, properties: { ...part.editor.defaults } })
  }
  const connections = [
    ['BB1.contact:terminal:A:04', 'BB1.contact:terminal:A:17', '#397ec6', 1.5],
    ['BB1.contact:terminal:B:32', 'BB1.contact:terminal:D:41', '#d8493f', 1.5],
    ['BB2.contact:terminal:A:22', 'BB2.contact:terminal:A:25', '#3a9d58', 1.1],
  ].map(([source, destination, color, diameter]) => ({ source: String(source), destination: String(destination), metadata: { wireVisual: { ...api.defaultWireVisual(), color: String(color), thickness: Number(diameter) * api.MM_TO_WORLD } } }))
  return { schema_version: '1.2', circuit_id: 'contacts-wires-native-gallery', metadata: { name: 'Contact and continuous-wire native gallery' }, modules, connections }
}

async function orient(page: Page, view: string) {
  const target = page.getByRole('button', { name: `View ${view}`, exact: true })
  if (!await target.count()) { await page.getByRole('button', { name: 'Home view', exact: true }).click(); await settle(page) }
  await target.press('Enter'); await settle(page)
}

async function targetRect(page: Page, id: string) {
  return workspaceCanvas(page).evaluate((element, id) => {
    const canvas = element as GalleryCanvas, probe = canvas.nativeSceneProbe; if (!probe) throw Error('Missing real gallery renderer.')
    let target: Object3D | undefined
    if (id === 'WIRES' || id === 'WIRE-END') target = probe.scene.getObjectByName('committed-wires')
    else probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === id) target = object })
    if (!target) throw Error(`Missing native ${id}.`)
    const canvasRect = canvas.getBoundingClientRect(), xs: number[] = [], ys: number[] = []
    target.updateWorldMatrix(true, true)
    if (id === 'WIRE-END') {
      const wire = target.children.find(child => (child as Mesh).isMesh), core = wire?.children.find(child => child.userData.wireTerminal), terminal = core?.userData.terminals?.[0] as { tip: { x: number; y: number; z: number }; junction: { x: number; y: number; z: number } } | undefined
      if (!terminal) throw Error('Missing actual first wire terminal.')
      for (const x of [terminal.tip.x - .13, terminal.tip.x + .13]) for (const y of [terminal.tip.y - .025, terminal.junction.y + .16]) for (const z of [terminal.tip.z - .13, terminal.tip.z + .13]) {
        const p = target.position.clone().set(x, y, z).project(probe.camera); xs.push(canvasRect.left + (p.x + 1) * canvasRect.width / 2); ys.push(canvasRect.top + (1 - p.y) * canvasRect.height / 2)
      }
    }
    target.traverse(object => {
      if (id === 'WIRE-END') return
      const mesh = object as Mesh
      if (!mesh.isMesh || !object.visible || object.userData.pinTarget || object.userData.pinHighlight || object.userData.ignorePick) return
      if (id !== 'WIRES' && object.userData.physicalLead) return
      mesh.geometry.computeBoundingBox(); const bounds = mesh.geometry.boundingBox; if (!bounds) return
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const p = target!.position.clone().set(x, y, z).applyMatrix4(mesh.matrixWorld).project(probe.camera)
        xs.push(canvasRect.left + (p.x + 1) * canvasRect.width / 2); ys.push(canvasRect.top + (1 - p.y) * canvasRect.height / 2)
      }
    })
    const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys), padX = Math.max(12, (x2 - x1) * .18), padY = Math.max(12, (y2 - y1) * .18)
    return { x1: Math.max(canvasRect.left + 2, x1 - padX), y1: Math.max(canvasRect.top + 2, y1 - padY), x2: Math.min(canvasRect.right - 2, x2 + padX), y2: Math.min(canvasRect.bottom - 2, y2 + padY), pixels: Math.max(x2 - x1, y2 - y1) }
  }, id)
}

async function closeup(page: Page, id: string, view: string) {
  await orient(page, view)
  await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settle(page)
  const close = page.getByRole('button', { name: 'Close Component Info', exact: true }); if (await close.isVisible()) await close.click()
  for (let pass = 0; pass < 4; pass++) {
    const rect = await targetRect(page, id); if (rect.pixels >= 360) break
    const before = (await nativeSceneEvidence(page)).frames
    await page.getByRole('button', { name: 'Zoom To Area', exact: true }).click()
    await page.mouse.move(rect.x1, rect.y1); await page.mouse.down(); await page.mouse.move(rect.x2, rect.y2, { steps: 6 }); await page.mouse.up()
    await expect.poll(async () => (await nativeSceneEvidence(page)).frames).toBeGreaterThan(before); await settle(page)
  }
  const result = await targetRect(page, id)
  expect(result.pixels, `${id} ${view} must occupy a useful native closeup`).toBeGreaterThanOrEqual(180)
  return result
}

async function capture(page: Page, info: TestInfo, name: string) {
  await settle(page)
  const clip = await workspaceCanvas(page).boundingBox(); if (!clip) throw Error('Missing visible native workspace.')
  const path = resolve(directory, `${name}.png`), png = await page.screenshot({ path, clip, timeout: 90_000, scale: 'css', animations: 'disabled', caret: 'hide' })
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  expect(width).toBeGreaterThanOrEqual(600); expect(height).toBeGreaterThanOrEqual(400)
  await info.attach(name, { path, contentType: 'image/png' }); return { name, path, width, height }
}

async function gpu(page: Page) {
  return workspaceCanvas(page).evaluate(element => {
    const probe = (element as GalleryCanvas).nativeSceneProbe; if (!probe) throw Error('Missing actual renderer statistics.')
    return { memory: { ...probe.memory }, render: { ...probe.render } }
  })
}

async function nativeMeasurements(page: Page, graph: CircuitGraph, api: Runtime) {
  const expected = graph.modules.filter(module => module.mount).map(module => {
    const part = api.getPartForType(module.type)!, board = graph.modules.find(board => board.id === module.mount!.boardId)!
    return { id: module.id, boardId: board.id, bodyMm: part.package.bodyMm, standoffMm: part.package.standoffMm, section: part.package.shape!.leadSection, contacts: module.mount!.contacts.map(binding => ({ ...binding, mechanics: api.boardContactMechanics(board.type, binding.contactId) })) }
  })
  return workspaceCanvas(page).evaluate((element, args) => {
    const probe = (element as GalleryCanvas).nativeSceneProbe; if (!probe) throw Error('Missing actual geometry.')
    const models = new Map<string, Object3D>(); probe.scene.traverse(object => { if (object.userData.kind === 'module') models.set(String(object.userData.id), object) })
    const bounds = (mesh: Mesh) => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox! }
    const verticalRayY = (mesh: Mesh, x: number, z: number) => {
      const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, hits: number[] = []
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2
        const ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), cx = p.getX(c), cz = p.getZ(c), denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
        if (Math.abs(denominator) < 1e-15) continue
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator
        if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7) hits.push(u * p.getY(a) + v * p.getY(b) + (1 - u - v) * p.getY(c))
      }
      return Math.max(...hits) / args.mm
    }
    const packages = args.expected.map(expected => {
      const model = models.get(expected.id)!, body = model.getObjectByName('package-body') as Mesh, board = models.get(expected.boardId)!
      if (!model || !body || !board) throw Error(`Missing rendered ${expected.id}.`)
      model.updateWorldMatrix(true, true); board.updateWorldMatrix(true, true)
      const inverse = board.matrixWorld.clone().invert(), bb = bounds(body), localSize = bb.max.clone().sub(bb.min).divideScalar(args.mm).toArray()
      let top = -Infinity
      const moduleInverse=model.matrixWorld.clone().invert()
      for (const child of model.children) {
        if (!(child as Mesh).isMesh || child.userData.physicalLead || child.userData.pinTarget || child.userData.pinHighlight) continue
        const box = bounds(child as Mesh)
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])top=Math.max(top,child.position.clone().set(x,y,z).applyMatrix4(child.matrixWorld).applyMatrix4(moduleInverse).y)
      }
      const leads = expected.contacts.map(binding => {
        const lead = model.getObjectByName(`package-lead-${binding.pinId}`)!.getObjectByName('lead-metal') as Mesh, positions = lead.geometry.getAttribute('position')
        let tipY = Infinity
        for (let i = 0; i < positions.count; i++) tipY = Math.min(tipY, lead.position.clone().fromBufferAttribute(positions, i).applyMatrix4(lead.matrixWorld).applyMatrix4(inverse).y)
        const tip = lead.position.clone().set(0, 0, 0); let tipVertices = 0
        for (let i = 0; i < positions.count; i++) { const point = lead.position.clone().fromBufferAttribute(positions, i).applyMatrix4(lead.matrixWorld).applyMatrix4(inverse); if (Math.abs(point.y - tipY) < 1e-7) { tip.add(point); tipVertices++ } }
        tip.divideScalar(tipVertices)
        return { pinId: binding.pinId, contactId: binding.contactId, insertionMm: (binding.mechanics.surface.y - tipY) / args.mm, tipFloorClearanceMm: (tipY - binding.mechanics.floor.y) / args.mm, cavityCenterErrorMm: Math.hypot(tip.x - binding.mechanics.tip.x, tip.z - binding.mechanics.tip.z) / args.mm }
      })
      const segments: { segment: string; color: string; emissiveIntensity: number; sizeMm: number[]; centerZmm: number; dpRadiusMm: number | null }[] = []
      model.traverse(object => { if (object.userData.segment) {
        const mesh = object as Mesh, material = mesh.material as MeshStandardMaterial, box = bounds(mesh), p = mesh.geometry.getAttribute('position')
        const dpRadiusMm = String(object.userData.segment).endsWith('.DP') ? Math.max(...Array.from({ length: p.count }, (_, i) => Math.hypot(p.getX(i), p.getZ(i)))) / args.mm : null
        segments.push({ segment: String(object.userData.segment), color: material.color.getHexString(), emissiveIntensity: material.emissiveIntensity, sizeMm: box.max.clone().sub(box.min).divideScalar(args.mm).toArray(), centerZmm: ((box.min.z + box.max.z) / 2 + mesh.position.z) / args.mm, dpRadiusMm })
      } })
      const detail = expected.id === 'SLIDE' ? { floorYmm: verticalRayY(body, 2.6 * args.mm, 0), slotInsideYmm: verticalRayY(body, 2.6 * args.mm, 1.29 * args.mm), slotOutsideYmm: verticalRayY(body, 2.6 * args.mm, 1.31 * args.mm), caseTopYmm: bb.max.y / args.mm, knobXmm: model.getObjectByName('package-switch-actuator')!.position.x / args.mm }
        : expected.id === 'DIP' ? { floorYmm: verticalRayY(body, -3.81 * args.mm, 1.7 * args.mm), on: model.getObjectByName('package-switch-on-marking')?.userData.text, numbers: [0, 1, 2, 3].map(i => model.getObjectByName(`package-switch-number-${i}`)?.userData.text) }
          : expected.id === 'TACTILE' ? { rivets: model.children.filter(child => child.name.startsWith('package-switch-rivet-')).length }
            : expected.id === 'BUZZER' ? { floorYmm: verticalRayY(body, 0, 0), mouthInsideYmm: verticalRayY(body, 1.49 * args.mm, 0), lidYmm: verticalRayY(body, 1.51 * args.mm, 0) } : {}
      return { id: expected.id, localSize, totalHeightMm: top / args.mm - expected.standoffMm, leads, segments, detail }
    })
    const wireGroup = probe.scene.getObjectByName('committed-wires')
    const wires = (wireGroup?.children ?? []).filter(object => (object as Mesh).isMesh).map(object => {
      const wire = object as Mesh, core = wire.children.find(child => child.userData.wireTerminal) as Mesh | undefined
      if (!core) throw Error('Wire is missing its real core.')
      const p = wire.geometry.getAttribute('position'), center = wire.position.clone().set(0, 0, 0)
      for (let i = 0; i < args.sides; i++) center.add(wire.position.clone().fromBufferAttribute(p, i)); center.divideScalar(args.sides)
      const radius = (i: number) => wire.position.clone().fromBufferAttribute(p, i).distanceTo(center) / args.mm
      const types: string[] = []; wire.traverse(child => { if ((child as Mesh).isMesh) types.push((child as Mesh).geometry.type) })
      const capStart = args.sides // first tube ring, then its annular cap's alternating outer/inner vertices
      return { source: wire.userData.source as string, destination: wire.userData.destination as string, invalid: wire.userData.invalidGeometry, diameterMm: radius(0) * 2, plasticCapInnerRadiusMm: Math.min(...Array.from({ length: args.sides }, (_, i) => radius(capStart + i * 2 + 1))), coreMinimumY: bounds(core).min.y, terminals: core.userData.terminals as { tip: { x: number; y: number; z: number }; junction: { x: number; y: number; z: number }; radius: number }[], geometryTypes: types, metalEmissive: (core.material as MeshStandardMaterial).emissive.getHex() }
    })
    return { packages, wires }
  }, { expected, mm: api.MM_TO_WORLD, sides: api.WIRE_RADIAL_SEGMENTS })
}

/** Diagnostic cutaway only: retain the real socket back/left walls and floor,
 * remove the front/right walls and housing, and restore all original geometry. */
async function cutaway(page: Page, enabled: boolean) {
  await workspaceCanvas(page).evaluate((element, enabled) => {
    const canvas = element as GalleryCanvas, probe = canvas.nativeSceneProbe; if (!probe) throw Error('Missing actual socket geometry.')
    if (!enabled) {
      for (const saved of canvas.galleryCutaway ?? []) { saved.object.visible = saved.visible; if (saved.mesh && saved.geometry) saved.mesh.geometry = saved.geometry; saved.cut?.dispose() }
      delete canvas.galleryCutaway; return
    }
    canvas.galleryCutaway = []
    probe.scene.traverse(object => {
      if (object.userData.kind !== 'module') return
      if (!String(object.userData.type).startsWith('BREADBOARD')) {
        canvas.galleryCutaway!.push({ object, visible: object.visible }); object.visible = false; return
      }
      for (const child of object.children) {
        const mesh = child as Mesh; if (!mesh.isMesh) continue
        if (child.userData.breadboardSockets) {
          const original = mesh.geometry, cut = original.clone(), index: number[] = []
          for (let i = 0; i < original.getAttribute('position').count; i++) if (i < 12 || i >= 36) index.push(i)
          cut.setIndex(index); mesh.geometry = cut; canvas.galleryCutaway!.push({ object: child, visible: child.visible, mesh, geometry: original, cut })
        } else { canvas.galleryCutaway!.push({ object: child, visible: child.visible }); child.visible = false }
      }
    })
  }, enabled)
}

test('contact and continuous-wire gallery retains native closeups, cavity evidence and stable GPU resources across ten cycles', async ({ page }, info) => {
  test.setTimeout(900_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1920, height: 1080 }); await observeGallery(page); await page.goto('/'); await sceneReady(page)
  const api = await runtime(), graph = fixture(api), screenshots: unknown[] = []
  await open(page, graph); await orient(page, 'TOP-FRONT-RIGHT'); await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settle(page)
  expect(await exportedNativeGraph(page)).toEqual(JSON.parse(JSON.stringify(graph)))
  const native = await nativeMeasurements(page, graph, api)
  await writeFile(resolve(directory, 'native-partial.json'), JSON.stringify(native, null, 2))
  for (const measured of native.packages) {
    const part = api.getPartForType(cases.find(item => item[0] === measured.id)![1])!
    const expectedCaseHeight = part.package.shape!.caseHeightMm ?? part.package.bodyMm.y
    expect(measured.localSize[0]).toBeCloseTo(part.package.bodyMm.x, 4); expect(measured.localSize[2]).toBeCloseTo(part.package.bodyMm.z, 4)
    expect(measured.localSize[1]).toBeCloseTo(measured.id === 'SLIDE' ? 6.4 - .8 : expectedCaseHeight, 4)
    expect(measured.totalHeightMm).toBeCloseTo(measured.id === 'SLIDE' ? 10.4 : part.package.bodyMm.y, 4)
    for (const lead of measured.leads) { expect(lead.insertionMm, `${measured.id}.${lead.pinId}`).toBeCloseTo(3, 4); expect(lead.tipFloorClearanceMm).toBeCloseTo(.5, 4); expect(lead.cavityCenterErrorMm).toBeLessThan(1e-4) }
    for (const segment of measured.segments) { expect(segment.color).toBe('d7d6c8'); expect(segment.emissiveIntensity).toBe(0); if (segment.segment.endsWith('.a')) expect(segment.sizeMm[2]).toBeCloseTo(1.5, 4); if (segment.segment.endsWith('.DP')) { expect(segment.sizeMm[0]).toBeCloseTo(1.5, 4); expect(segment.sizeMm[2]).toBeCloseTo(1.5, 4); expect(segment.dpRadiusMm).toBeCloseTo(.75, 4) } }
    if (measured.segments.length) expect(Math.max(...measured.segments.map(segment => segment.centerZmm + segment.sizeMm[2]! / 2)) - Math.min(...measured.segments.map(segment => segment.centerZmm - segment.sizeMm[2]! / 2))).toBeCloseTo(14.22, 4)
  }
  const slide = native.packages.find(item => item.id === 'SLIDE')!, tactile = native.packages.find(item => item.id === 'TACTILE')!, dip = native.packages.find(item => item.id === 'DIP')!, buzzer = native.packages.find(item => item.id === 'BUZZER')!
  expect(slide.detail.caseTopYmm! - slide.detail.floorYmm!).toBeGreaterThan(.5); expect(slide.detail.knobXmm).toBeCloseTo(1.1, 5)
  expect(slide.detail.slotInsideYmm).toBeCloseTo(slide.detail.floorYmm!, 4); expect(slide.detail.slotOutsideYmm).toBeCloseTo(slide.detail.caseTopYmm!, 4)
  expect(tactile.detail.rivets).toBe(4); expect(dip.detail.floorYmm).toBeCloseTo(2.7, 4); expect(dip.detail.on).toBe('ON'); expect(dip.detail.numbers).toEqual(['1', '2', '3', '4'])
  expect(buzzer.detail.lidYmm! - buzzer.detail.floorYmm!).toBeCloseTo(1.5, 4)
  expect(buzzer.detail.mouthInsideYmm).toBeCloseTo(buzzer.detail.floorYmm!, 4)
  expect(native.wires).toHaveLength(3)
  for (const wire of native.wires) {
    const connection = graph.connections.find(item => item.source === wire.source && item.destination === wire.destination)!, visual = connection.metadata!.wireVisual as { thickness: number }
    expect(wire.invalid).toBe(false); expect(wire.diameterMm).toBeCloseTo(visual.thickness / api.MM_TO_WORLD, 4); expect(wire.geometryTypes.every(type => type === 'BufferGeometry')).toBe(true); expect(wire.metalEmissive).toBe(0)
    expect(wire.plasticCapInnerRadiusMm).toBeCloseTo(wire.terminals[0]!.radius / api.MM_TO_WORLD, 4)
    expect(wire.coreMinimumY).toBeCloseTo(Math.min(...wire.terminals.map(terminal => terminal.tip.y)), 6)
    for (const [index, endpoint] of [wire.source, wire.destination].entries()) {
      const split = endpoint.indexOf('.'), board = graph.modules.find(module => module.id === endpoint.slice(0, split))!, mechanics = api.boardContactMechanics(board.type, endpoint.slice(split + 1).replace(/^contact:/, '')), terminal = wire.terminals[index]!
      expect(terminal.tip.y - (board.position!.y ?? 0)).toBeCloseTo(mechanics.tip.y, 6); expect(terminal.junction.y - (board.position!.y ?? 0)).toBeCloseTo(mechanics.insulationEnd.y, 6)
    }
  }
  screenshots.push(await capture(page, info, 'gallery-before-cycles')); const before = await gpu(page), cycles: unknown[] = []
  for (let cycle = 0; cycle < 10; cycle++) {
    const extra: CircuitModule[] = cases.map(([id, type], index) => ({ id: `CYCLE_${cycle}_${id}`, type, physicalDescriptor: api.physicalDescriptorForPart(api.getPartForType(type)!), position: { x: -9 + index * 3, y: .309, z: 6 }, properties: { ...api.getPartForType(type)!.editor.defaults } }))
    extra.push({ id: `LABEL_CYCLE_${cycle}`, type: 'LABEL', position: { x: 0, y: .33 + .15 * api.MM_TO_WORLD, z: -.5 }, properties: { version: 1, text: `Nhãn ${cycle + 1}\nĐiện áp 5 V`, fontSizeMm: 3, textColor: '#20252A', backgroundColor: '#FAFAF7', paddingMm: 1, boardId: 'BB1' } })
    await open(page, { schema_version: '1.2', circuit_id: graph.circuit_id, metadata: graph.metadata, modules: [...graph.modules, ...extra], connections: graph.connections })
    await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settle(page); const created = await gpu(page)
    expect(created.memory.geometries).toBeGreaterThan(before.memory.geometries)
    await open(page, graph); await orient(page, 'TOP-FRONT-RIGHT'); await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settle(page); const removed = await gpu(page)
    expect(removed.memory, `GPU memory after native add/remove cycle ${cycle + 1}`).toEqual(before.memory)
    expect(removed.render.calls, `same-scene draw calls after cycle ${cycle + 1}`).toBe(before.render.calls)
    cycles.push({ cycle: cycle + 1, created, removed })
  }
  const after = await gpu(page); screenshots.push(await capture(page, info, 'gallery-after-cycles'))
  for (const [id] of cases) {
    const framing = await closeup(page, id, ['SLIDE', 'DIP', 'SINGLE', 'DOUBLE', 'QUAD'].includes(id) ? 'TOP' : 'TOP-FRONT-RIGHT')
    screenshots.push({ ...await capture(page, info, `${id.toLowerCase()}-native-detail`), framing })
  }
  for (const id of ['SLIDE', 'DIP']) {
    const framing = await closeup(page, id, 'TOP-FRONT-RIGHT')
    screenshots.push({ ...await capture(page, info, `${id.toLowerCase()}-native-oblique`), framing })
  }
  await cutaway(page, true)
  try {
    const framing = await closeup(page, 'WIRES', 'TOP-FRONT-RIGHT'); screenshots.push({ ...await capture(page, info, 'wire-core-and-socket-floor-cutaway'), framing })
    const terminalFraming = await closeup(page, 'WIRE-END', 'TOP-FRONT-RIGHT'); screenshots.push({ ...await capture(page, info, 'wire-terminal-tip-floor-and-insulation-annulus'), framing: terminalFraming })
  }
  finally { await cutaway(page, false) }
  await orient(page, 'TOP-FRONT-RIGHT'); await page.getByRole('button', { name: 'Zoom To View Entire Circuit', exact: true }).click(); await settle(page)
  expect((await gpu(page)).memory).toEqual(before.memory)
  expect(await exportedNativeGraph(page)).toEqual(JSON.parse(JSON.stringify(graph))); expect((await nativeSceneEvidence(page)).handles).toBe(false); expect(errors).toEqual([])
  const report = JSON.stringify({ baselineKind: 'warm-current-scene-before-and-after-ten-add-remove-cycles; not a historical-renderer comparison', native, gpu: { before, after, cycles }, screenshots, graph }, null, 2)
  await writeFile(resolve(directory, 'native-evidence.json'), report); await info.attach('contacts-wires-native-evidence', { body: Buffer.from(report), contentType: 'application/json' })
})

test('native display face closeups retain real OFF diffusers and package bounds', async ({ page }, info) => {
  test.setTimeout(240_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1920, height: 1080 }); await observeGallery(page); await page.goto('/'); await sceneReady(page)
  const api = await runtime(), graph = fixture(api), screenshots: unknown[] = []
  await open(page, graph)
  const native = await nativeMeasurements(page, graph, api)
  for (const id of ['SINGLE', 'DOUBLE', 'QUAD']) {
    const measured = native.packages.find(item => item.id === id)!, part = api.getPartForType(cases.find(item => item[0] === id)![1])!
    expect(measured.totalHeightMm).toBeCloseTo(part.package.bodyMm.y, 4)
    expect(measured.segments).toHaveLength((part.package.digits ?? 1) * 8)
    for (const segment of measured.segments) { expect(segment.color).toBe('d7d6c8'); expect(segment.emissiveIntensity).toBe(0) }
    const framing = await closeup(page, id, 'TOP')
    screenshots.push({ ...await capture(page, info, `${id.toLowerCase()}-native-final`), framing })
  }
  await cutaway(page, true)
  try {
    const framing = await closeup(page, 'WIRE-END', 'TOP-FRONT-RIGHT')
    screenshots.push({ ...await capture(page, info, 'wire-terminal-unoccluded-native-final'), framing })
  } finally { await cutaway(page, false) }
  expect(await exportedNativeGraph(page)).toEqual(JSON.parse(JSON.stringify(graph))); expect(errors).toEqual([])
  const report = JSON.stringify({ native, screenshots, graph }, null, 2)
  await writeFile(resolve(directory, 'display-face-native-evidence.json'), report)
  await info.attach('native-display-face-evidence', { body: Buffer.from(report), contentType: 'application/json' })
})
