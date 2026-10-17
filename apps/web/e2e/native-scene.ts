import { expect, type Page } from '@playwright/test'
import type { Camera, Object3D, WebGLRenderer } from 'three'
import { readFileSync } from 'node:fs'
import type { BreadboardTopology } from '../src/electrical/BreadboardTopology'
import { parseStructural } from '../src/contracts/structural'

interface NativeSceneProbe { scene: Object3D; camera: Camera; frames: number; trustedPointerDowns: number; trustedContextMenus: number }
type ProbedCanvas = HTMLCanvasElement & { nativeSceneProbe?: NativeSceneProbe }
const topologies=JSON.parse(readFileSync(new URL('../src/data/breadboardTopologies.json',import.meta.url),'utf8')) as {profiles:BreadboardTopology[]}
export const workspaceCanvas = (page: Page) => page.getByLabel('Three-dimensional circuit workspace', { exact: true })

/** Observe Three's own devtools event and every original native render. This
 * test probe supplies coordinates only; all edits use the actual pointer UI. */
export async function observeNativeScene(page: Page) {
  await page.addInitScript(() => {
    const events = new EventTarget()
    Object.defineProperty(window, '__THREE_DEVTOOLS__', { configurable: true, value: events })
    const isRenderer = (value: unknown): value is WebGLRenderer => value !== null && typeof value === 'object' && 'isWebGLRenderer' in value && value.isWebGLRenderer === true && 'domElement' in value && value.domElement instanceof HTMLCanvasElement && 'render' in value && typeof value.render === 'function'
    events.addEventListener('observe', event => {
      const value: unknown = (event as CustomEvent<unknown>).detail
      if (!isRenderer(value)) return
      const renderer = value, canvas = renderer.domElement as ProbedCanvas
      if (canvas.getAttribute('aria-label') !== 'Three-dimensional circuit workspace') return
      const original = renderer.render.bind(renderer)
      let trustedPointerDowns = 0, trustedContextMenus = 0
      window.addEventListener('pointerdown', event => { if (event.target === canvas && event.isTrusted) trustedPointerDowns++ }, { capture: true })
      window.addEventListener('contextmenu', event => { if (event.target === canvas && event.isTrusted) trustedContextMenus++ }, { capture: true })
      renderer.render = (scene, camera) => {
        original(scene, camera)
        if (!scene.getObjectByName('flexible-edit-handles')) return
        canvas.nativeSceneProbe = { scene, camera, frames: (canvas.nativeSceneProbe?.frames ?? 0) + 1, trustedPointerDowns, trustedContextMenus }
      }
    })
  })
}

export async function sceneReady(page: Page) {
  await expect.poll(() => workspaceCanvas(page).evaluate(element => (element as ProbedCanvas).nativeSceneProbe?.frames ?? 0)).toBeGreaterThan(0)
}

export async function projectContact(page: Page, boardId: string, contactId: string) {
  const contact = topologies.profiles.find(profile=>profile.moduleTypes.includes('BREADBOARD'))?.contacts.find(contact=>contact.contactId===contactId)
  if (!contact) throw new Error(`Unknown canonical test contact ${contactId}`)
  return workspaceCanvas(page).evaluate((element, args) => {
    const canvas = element as ProbedCanvas, probe = canvas.nativeSceneProbe
    if (!probe) throw new Error('The actual workspace renderer has not rendered yet.')
    let board: Object3D | undefined
    probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === args.boardId) board = object })
    if (!board) throw new Error('The rendered breadboard is missing.')
    board.updateWorldMatrix(true, false)
    const point = board.position.clone().fromArray(args.position).applyMatrix4(board.matrixWorld).project(probe.camera), rect = canvas.getBoundingClientRect()
    if (Math.abs(point.x) >= 1 || Math.abs(point.y) >= 1 || Math.abs(point.z) >= 1) throw new Error('The requested hole is outside the actual camera.')
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  }, { boardId, position: [...contact.localPosition] })
}

export async function projectFlexibleHandle(page: Page, name: 'pin-0' | 'pin-1' | 'lift' | 'tilt') {
  return workspaceCanvas(page).evaluate((element, name) => {
    const canvas = element as ProbedCanvas, probe = canvas.nativeSceneProbe
    if (!probe) throw new Error('The actual scene probe is unavailable.')
    const handles = probe.scene.getObjectByName('flexible-edit-handles'), marker = handles?.children.find(object => object.userData.flexibleHandle === name)
    if (!handles?.visible || !marker) throw new Error('The actual flexible editing handle is unavailable.')
    const point = marker.getWorldPosition(marker.position.clone()).project(probe.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  }, name)
}

export async function projectModuleCenter(page: Page, id: string) {
  return workspaceCanvas(page).evaluate((element, id) => {
    const canvas = element as ProbedCanvas, probe = canvas.nativeSceneProbe
    if (!probe) throw new Error('The actual scene probe is unavailable.')
    let model: Object3D | undefined
    probe.scene.traverse(object => { if (object.userData.kind === 'module' && object.userData.id === id) model = object })
    if (!model) throw new Error('The actual rendered module is unavailable.')
    const point = model.getWorldPosition(model.position.clone()).project(probe.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  }, id)
}

export async function nativeSceneEvidence(page: Page) {
  return workspaceCanvas(page).evaluate(element => {
    const probe = (element as ProbedCanvas).nativeSceneProbe
    if (!probe) throw new Error('Missing native renderer evidence.')
    let preview = false, handles = false
    probe.scene.traverse(object => { if (object.userData.id === 'PLACE') preview = true; if (object.name === 'flexible-edit-handles') handles = object.visible })
    return { frames: probe.frames, trustedPointerDowns: probe.trustedPointerDowns, trustedContextMenus: probe.trustedContextMenus, camera: probe.camera.quaternion.toArray(), preview, handles }
  })
}

export async function exportedNativeGraph(page: Page) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export circuit JSON', exact: true }).click()
  const stream = await (await pending).createReadStream()
  if (!stream) throw new Error('The circuit JSON download is unavailable.')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return parseStructural('AnySupportedCircuitGraph', JSON.parse(Buffer.concat(chunks).toString('utf8')))
}
