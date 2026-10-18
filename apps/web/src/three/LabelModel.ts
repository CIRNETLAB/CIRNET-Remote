import { ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Shape } from 'three'
import type { CircuitModule } from '../types/circuit'
import { MM_TO_WORLD as mm } from '../data/partCatalog'
import { normalizeLabelProperties } from '../data/labelProperties'
import { labelTextureCache, type LabelBitmapLease } from './LabelTextCache'

const fontObservers = new Set<() => void>()
let fontEpoch = 0, watchedFonts: FontFaceSet | null = null
function fontsChanged() { fontEpoch++; for (const refresh of fontObservers) refresh() }
function observeFonts(refresh: () => void) {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  fontObservers.add(refresh)
  if (fonts && !watchedFonts) {
    watchedFonts = fonts; fonts.addEventListener('loadingdone', fontsChanged)
    if (fonts.status === 'loading') void fonts.ready.then(() => { if (watchedFonts === fonts) fontsChanged() })
  }
  return () => {
    fontObservers.delete(refresh)
    if (!fontObservers.size && watchedFonts) { watchedFonts.removeEventListener('loadingdone', fontsChanged); watchedFonts = null }
  }
}
function sheetGeometry(width: number, depth: number) {
  const x = width / 2, z = depth / 2, r = Math.min(.3 * mm, x, z), shape = new Shape()
  shape.moveTo(-x + r, -z); shape.lineTo(x - r, -z); shape.absarc(x - r, -z + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(x, z - r); shape.absarc(x - r, z - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-x + r, z); shape.absarc(-x + r, z - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-x, -z + r); shape.absarc(-x + r, -z + r, r, Math.PI, Math.PI * 1.5, false)
  const geometry = new ExtrudeGeometry(shape, { depth: .1 * mm, bevelEnabled: false, curveSegments: 8 })
  geometry.rotateX(-Math.PI / 2); return geometry
}
interface LabelState { module: CircuitModule; sheet: Mesh; ink: Mesh<PlaneGeometry, MeshBasicMaterial>; lease: LabelBitmapLease | null; width: number; depth: number; disposed: boolean; unobserve(): void }
const states = new WeakMap<Group, LabelState>()

/** A note is a real board-plane sheet; its group pose is the document pose. */
export function addLabelModel(group: Group, module: CircuitModule) {
  const sheet = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: '#FAFAF7', roughness: .55, metalness: 0 }))
  sheet.name = 'label-sheet'; sheet.userData.selectionSurface = true; sheet.receiveShadow = true
  const ink = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }))
  ink.name = 'label-text'; ink.rotation.x = -Math.PI / 2; ink.position.y = .105 * mm
  ink.userData.ignorePick = true; ink.userData.selectionSurface = false
  group.add(sheet, ink)
  const state: LabelState = { module, sheet, ink, lease: null, width: 0, depth: 0, disposed: false, unobserve() {} }
  states.set(group, state)
  state.unobserve = observeFonts(() => { if (!state.disposed) { updateLabelModel(group, state.module); group.userData.onVisualChange?.() } })
  group.userData.releaseSharedResources = () => {
    if (state.disposed) return
    state.disposed = true; state.unobserve(); state.ink.material.map = null; state.lease?.release(); state.lease = null; states.delete(group)
  }
  updateLabelModel(group, module)
}

/** Edit only this note's texture/owned geometry, leaving other scene models live. */
export function updateLabelModel(group: Group, module: CircuitModule): boolean {
  const state = states.get(group)
  if (!state || state.disposed) return false
  const properties = normalizeLabelProperties(module.properties), lease = labelTextureCache.acquire({ ...properties }, fontEpoch)
  const width = lease.layout.widthMm * mm, depth = lease.layout.heightMm * mm
  const resized = Math.abs(width - state.width) > 1e-10 || Math.abs(depth - state.depth) > 1e-10
  if (resized) {
    state.sheet.geometry.dispose(); state.sheet.geometry = sheetGeometry(width, depth)
    state.ink.geometry.dispose(); state.ink.geometry = new PlaneGeometry(width, depth)
    state.width = width; state.depth = depth
    group.userData.visualGeometryRevision = (group.userData.visualGeometryRevision ?? 0) + 1
  }
  ;(state.sheet.material as MeshStandardMaterial).color.set(properties.backgroundColor)
  state.ink.material.map = lease.texture; state.ink.material.needsUpdate = true; state.ink.visible = !!lease.texture
  state.lease?.release(); state.lease = lease; state.module = module
  group.userData.labelText = properties.text
  group.userData.labelLayout = lease.layout
  group.userData.visualBounds = [[-width / 2, 0, -depth / 2], [width / 2, .105 * mm, depth / 2]]
  return resized
}
