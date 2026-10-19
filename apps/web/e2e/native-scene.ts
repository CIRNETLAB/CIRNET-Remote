import { fileCommand } from './workbench-ui'
import { expect, type Page } from '@playwright/test'
import type { Camera, Object3D, WebGLRenderer, Mesh } from 'three'
import { readFileSync } from 'node:fs'
import type { BreadboardTopology } from '../src/electrical/BreadboardTopology'
import { parseStructural } from '../src/contracts/structural'

interface NativeSceneProbe { scene: Object3D; camera: Camera; frames: number; trustedPointerDowns: number; trustedContextMenus: number;memory:{geometries:number;textures:number}; target?: number[] }
type ProbedCanvas = HTMLCanvasElement & { nativeSceneProbe?: NativeSceneProbe }
const topologies=JSON.parse(readFileSync(new URL('../src/data/breadboardTopologies.json',import.meta.url),'utf8')) as {profiles:BreadboardTopology[]}
export const workspaceCanvas = (page: Page) => page.getByLabel('Three-dimensional circuit workspace', { exact: true })

/** Observe Three's own devtools event and every original native render. This
 * test probe supplies coordinates only; all edits use the actual pointer UI. */
export async function observeNativeScene(page: Page) {
  await page.addInitScript(() => {
    // Count live, repeatable global registrations while always calling the real
    // browser APIs. Once-only listeners are excluded because native dispatch
    // removes them internally without calling removeEventListener.
    const globalListeners = new Map<EventTarget, Map<string, Set<EventListenerOrEventListenerObject>>>()
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener
    const key = (type: string, options?: boolean | EventListenerOptions) => type + ':' + String(typeof options === 'boolean' ? options : !!options?.capture)
    EventTarget.prototype.addEventListener = function(type, callback, options) {
      if (callback && (this === window || this === document) && !(typeof options === 'object' && options?.once)) {
        let target = globalListeners.get(this); if (!target) { target = new Map(); globalListeners.set(this, target) }
        const name = key(type, options); let callbacks = target.get(name)
        if (!callbacks) { callbacks = new Set(); target.set(name, callbacks) }
        callbacks.add(callback)
      }
      add.call(this, type, callback, options)
    }
    EventTarget.prototype.removeEventListener = function(type, callback, options) {
      if (callback) globalListeners.get(this)?.get(key(type, options))?.delete(callback)
      remove.call(this, type, callback, options)
    }
    Object.defineProperty(window, 'nativeGlobalListenerCounts', { value: () => Object.fromEntries([...globalListeners].flatMap(([target, entries]) => [...entries].map(([name, callbacks]) => [(target === window ? 'window:' : 'document:') + name, callbacks.size])).filter(([, size]) => Number(size) > 0)) })
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
      const observedCameras = new WeakSet<Camera>()
      let target: number[] | undefined
      window.addEventListener('pointerdown', event => { if (event.target === canvas && event.isTrusted) trustedPointerDowns++ }, { capture: true })
      window.addEventListener('contextmenu', event => { if (event.target === canvas && event.isTrusted) trustedContextMenus++ }, { capture: true })
      renderer.render = (scene, camera) => {
        original(scene, camera)
        if (!scene.getObjectByName('flexible-edit-handles')) return
        if (!observedCameras.has(camera)) {
          observedCameras.add(camera)
          const lookAt = camera.lookAt.bind(camera)
          camera.lookAt = (x, y?: number, z?: number) => {
            target = typeof x === 'number' ? [x, y!, z!] : x.toArray()
            if (typeof x === 'number') lookAt(x, y!, z!); else lookAt(x)
          }
        }
        canvas.nativeSceneProbe = { scene, camera, frames: (canvas.nativeSceneProbe?.frames ?? 0) + 1, trustedPointerDowns, trustedContextMenus,memory:{...renderer.info.memory}, target }
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

export async function projectFlexibleHandle(page: Page, name: 'pin-0' | 'pin-1') {
  return workspaceCanvas(page).evaluate((element, name) => {
    const canvas = element as ProbedCanvas, probe = canvas.nativeSceneProbe
    if (!probe) throw new Error('The actual scene probe is unavailable.')
    const handles = probe.scene.getObjectByName('flexible-edit-handles'), marker = handles?.children.find(object => object.userData.flexibleHandle === name)
    if (!handles?.visible || !marker) throw new Error('The actual flexible editing handle is unavailable.')
    const point = marker.getWorldPosition(marker.position.clone()).project(probe.camera), rect = canvas.getBoundingClientRect()
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 }
  }, name)
}

/** Coordinates previously occupied by body-pose handles; no live hit target is queried. */
export async function projectFormerBodyHandle(page:Page,id:string,name:'lift'|'tilt'){
 return workspaceCanvas(page).evaluate((element,{id,name})=>{
  const canvas=element as ProbedCanvas,probe=canvas.nativeSceneProbe;if(!probe)throw Error('Missing native scene.')
  let model:Object3D|undefined;probe.scene.traverse(object=>{if(object.userData.kind==='module'&&object.userData.id===id)model=object})
  if(!model)throw Error('Missing module.')
  const point=model.getWorldPosition(model.position.clone());point.y+=name==='lift'?.16:.08;if(name==='tilt')point.x+=.16;point.project(probe.camera)
  const rect=canvas.getBoundingClientRect();return{x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2}
 },{id,name})
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

export async function nativeComponentBody(page:Page,id:string){
 return workspaceCanvas(page).evaluate((element,id)=>{
  const probe=(element as ProbedCanvas).nativeSceneProbe;if(!probe)throw Error('Missing native renderer.')
  let model:Object3D|undefined;probe.scene.traverse(object=>{if(object.userData.kind==='module'&&object.userData.id===id)model=object})
  const body=model?.getObjectByName('package-body') as Mesh|undefined;if(!model||!body?.geometry)throw Error('Missing rendered component body geometry.')
  body.geometry.computeBoundingBox();const bounds=body.geometry.boundingBox!
  return{model:model.uuid,body:body.geometry.uuid,size:bounds.max.clone().sub(bounds.min).toArray()}
 },id)
}

export async function nativeSceneEvidence(page: Page) {
  return workspaceCanvas(page).evaluate(element => {
    const probe = (element as ProbedCanvas).nativeSceneProbe
    if (!probe) throw new Error('Missing native renderer evidence.')
    let preview = false, handles = false;let handleNames:string[]=[]
    probe.scene.traverse(object => { if (object.userData.id === 'PLACE') preview = true; if (object.name === 'flexible-edit-handles'){handles = object.visible;handleNames=object.children.map(marker=>String(marker.userData.flexibleHandle))} })
    return { frames: probe.frames, trustedPointerDowns: probe.trustedPointerDowns, trustedContextMenus: probe.trustedContextMenus, camera: probe.camera.quaternion.toArray(), preview, handles, handleNames,memory:probe.memory }
  })
}

/** Read native identities and camera pose without issuing layout or camera commands. */
export async function nativeShellEvidence(page: Page) {
  return workspaceCanvas(page).evaluate(element => {
    const canvas = element as ProbedCanvas, probe = canvas.nativeSceneProbe
    if (!probe) throw new Error('Missing actual renderer evidence.')
    const resources: unknown[] = []
    probe.scene.traverse(object => {
      if (object.userData.kind !== 'module' && object.name !== 'committed-wires') return
      object.traverse(child => {
        const mesh = child as Mesh
        if (!mesh.isMesh) return
        resources.push({ mesh: mesh.uuid, geometry: mesh.geometry.uuid, material: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.uuid) })
      })
    })
    const rect = canvas.getBoundingClientRect(), gl = canvas.getContext('webgl2')
    return { scene: probe.scene.uuid, camera: probe.camera.uuid, position: probe.camera.position.toArray(), quaternion: probe.camera.quaternion.toArray(), projection: [...probe.camera.projectionMatrix.elements],
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, resources, memory: probe.memory,
      graphics: { dpr: devicePixelRatio, drawingBuffer: [canvas.width, canvas.height], depthBits: gl?.getParameter(gl.DEPTH_BITS) },
      globalListeners: (window as unknown as { nativeGlobalListenerCounts: () => Record<string, number> }).nativeGlobalListenerCounts() }
  })
}

export async function exportedNativeGraph(page: Page) {
  const pending = page.waitForEvent('download')
  await fileCommand(page, 'Export')
  const stream = await (await pending).createReadStream()
  if (!stream) throw new Error('The circuit JSON download is unavailable.')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return parseStructural('AnySupportedCircuitGraph', JSON.parse(Buffer.concat(chunks).toString('utf8')))
}
