import { AmbientLight, Box3, DirectionalLight, Group, InstancedMesh, Matrix4, Mesh, NoToneMapping, OrthographicCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, type Object3D } from 'three'
import { getDefinition } from '../data/editorCatalog'
import { getPartForType } from '../data/partCatalog'
import { normalizeComponentProperties } from '../data/componentProperties'
import { isLeadEditableType, readLeadProperties } from '../data/leadProperties'
import type { CircuitModule } from '../types/circuit'
import { buildComponent, disposeObject } from './ComponentModel'
import { supplyControlValue } from './PowerSupplyModel'
import { createStudioEnvironment } from './StudioEnvironment'

export interface PackageThumbnailRenderer {
  /** Capture must finish before another model can use the shared canvas. */
  render(model: Group): string | Promise<string>
  dispose(): void
}
export type PackageThumbnailPriority = 'high' | 'visible' | 'preload'
export interface PackageThumbnailRequest { priority?: PackageThumbnailPriority }
export interface PackageThumbnailLease { ready: Promise<string | null>; release(): void; setPriority?(priority: PackageThumbnailPriority): void }
export interface PackageThumbnailCache {
  acquire(type: string, properties?: Record<string, unknown>, request?: PackageThumbnailRequest): PackageThumbnailLease
  dispose?(): void
}
/** Schedule one deferred capture; the returned function cancels a pending task. */
export type PackageThumbnailScheduler = (task: () => void, priority: PackageThumbnailPriority) => (() => void)
export interface PackageThumbnailCacheOptions {
  createRenderer?: () => PackageThumbnailRenderer | null
  maxEntries?: number
  scheduleTask?: PackageThumbnailScheduler
  /** Retain the single context across short visibility gaps, then release it. */
  idleDelayMs?: number
}
export const packageThumbnailCacheKey = Symbol.for('netcircuit.package-thumbnails')

interface Entry {
  module?: CircuitModule
  refs: number
  priorities: Map<symbol, PackageThumbnailPriority>
  order: number
  state: 'queued' | 'rendering' | 'complete'
  ready: Promise<string | null>
  resolve: (image: string | null) => void
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]))
  return value
}

const priorityRank: Record<PackageThumbnailPriority, number> = { high: 0, visible: 1, preload: 2 }

/** Only properties actually read by the model factories define an image. Keep
 * this projection beside the cache; editor graph metadata must not bust it. */
function visualProperties(type: string, properties: Record<string, unknown>): Record<string, unknown> {
  const definition = getDefinition(type)!, part = getPartForType(type), visual: Record<string, unknown> = {}
  const copy = (keys: string[]) => { for (const key of keys) visual[key] = properties[key] ?? part?.editor.defaults[key] ?? definition.defaults[key] }
  if (part?.package.family === 'axial' && (part.package.visualVariant === 'resistor' || part.function === 'resistor')) copy(['resistanceOhms', 'powerWatts', 'tolerancePercent'])
  if (part?.package.family === 'radial-capacitor') copy(['capacitanceFarads', 'voltageRatingVolts'])
  if (isLeadEditableType(type)) Object.assign(visual, readLeadProperties(properties))
  if (part?.package.family === 'switch') {
    copy((part.internalConnections ?? []).flatMap(connection => connection.when ? [connection.when.property] : []))
    if (part.package.visualVariant === 'toggle') copy(['state'])
  }
  if (definition.visual === 'supply') {
    visual[type === 'DC_SUPPLY' ? 'voltage' : 'voltage_v'] = supplyControlValue(properties, 'voltage_v', type)
    visual.power_on = supplyControlValue(properties, 'power_on', type)
    if (type !== 'DC_SUPPLY') visual.current_limit_a = supplyControlValue(properties, 'current_limit_a', type)
  } else if (!part) {
    if (definition.visual === 'button' || definition.visual === 'toggle') visual.state = !!properties.state
    if (definition.visual === 'dip') visual.value = Number(properties.value ?? 0) & 15
  }
  return visual
}

/** Idle work never starts in the input/Vue microtask turn. Where idle callbacks
 * are absent, wait until after a frame so input and paint can finish first. */
const schedulePackageThumbnailTask: PackageThumbnailScheduler = (task, priority) => {
  let canceled = false
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const timeout = { high: 50, visible: 150, preload: 500 }[priority], expires = performance.now() + timeout
    const run = (deadline: IdleDeadline) => {
      if (canceled) return
      const remaining = expires - performance.now()
      if (!deadline.didTimeout && deadline.timeRemaining() < 4 && remaining > 0) {
        handle = window.requestIdleCallback(run, { timeout: Math.max(1, remaining) })
      } else task()
    }
    let handle = window.requestIdleCallback(run, { timeout })
    return () => { canceled = true; window.cancelIdleCallback(handle) }
  }
  let frame: number | undefined, timer: ReturnType<typeof setTimeout> | undefined
  const afterPaint = () => { frame = undefined; timer = setTimeout(() => { if (!canceled) task() }, 0) }
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(afterPaint)
  else afterPaint()
  return () => {
    canceled = true
    if (frame !== undefined) window.cancelAnimationFrame(frame)
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Only geometry that contributes to the image participates in framing. In
 * particular, Three's setFromObject also includes invisible picking meshes. */
function renderedModelCorners(model: Object3D): Vector3[] {
  const points: Vector3[] = [], instance = new Matrix4(), world = new Matrix4()
  model.updateWorldMatrix(true, true)
  const visit = (object: Object3D) => {
    if (!object.visible || object.userData.pinLabel || object.userData.pinHighlight || object.userData.thumbnailOverlay) return
    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (materials.some(material => material.visible && (!material.transparent || material.opacity > 0))) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
        const bounds = object.geometry.boundingBox
        if (bounds && !bounds.isEmpty()) {
          const count = object instanceof InstancedMesh ? object.count : 1
          for (let index = 0; index < count; index++) {
            if (object instanceof InstancedMesh) { object.getMatrixAt(index, instance); world.multiplyMatrices(object.matrixWorld, instance) }
            else world.copy(object.matrixWorld)
            for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(new Vector3(x, y, z).applyMatrix4(world))
          }
        }
      }
    }
    object.children.forEach(visit)
  }
  visit(model)
  return points
}

export function getRenderedModelBounds(model: Object3D): Box3 {
  return new Box3().setFromPoints(renderedModelCorners(model))
}

/** Fit projected geometry rather than an inflated world AABB; the projected
 * silhouette can be asymmetric even when a world-space box is centered. */
export function fitPackageThumbnailCamera(model: Object3D, camera: OrthographicCamera, aspect: number): void {
  const points = renderedModelCorners(model), bounds = new Box3().setFromPoints(points)
  if (bounds.isEmpty()) bounds.setFromCenterAndSize(new Vector3(), new Vector3(.1, .1, .1))
  const center = bounds.getCenter(new Vector3()), radius = Math.max(bounds.getSize(new Vector3()).length() / 2, .05)
  camera.position.copy(center).addScaledVector(new Vector3(.95, 1.35, 1.45).normalize(), radius * 4)
  camera.lookAt(center); camera.updateMatrixWorld(true)
  const projected = new Box3().setFromPoints(points.map(point => point.clone().applyMatrix4(camera.matrixWorldInverse)))
  if (projected.isEmpty()) projected.setFromCenterAndSize(new Vector3(0, 0, -radius * 4), new Vector3(.1, .1, .1))
  const size = projected.getSize(new Vector3()), middle = projected.getCenter(new Vector3())
  const halfHeight = Math.max(size.y / 2, size.x / (2 * aspect), .05) * 1.15
  camera.position.add(new Vector3(middle.x, middle.y, 0).applyQuaternion(camera.quaternion))
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight
  camera.near = Math.max(.0001, -projected.max.z * .5); camera.far = Math.max(camera.near + 1, -projected.min.z * 1.5)
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix()
}

/** Match the workspace's direct lights and studio intensity; the transparent
 * preview canvas does not introduce its own brighter photographic lighting. */
export function createPackageThumbnailScene(): Scene {
  const scene = new Scene(); scene.environmentIntensity = .55
  scene.add(new AmbientLight('#c9def4', 1.1))
  const key = new DirectionalLight('#fff5dc', 1.9); key.position.set(-5, 10, 5); scene.add(key)
  const fill = new DirectionalLight('#a8c7e8', .75); fill.position.set(6, 8, -6); scene.add(fill)
  return scene
}

/** Cached CPU images outlive cards. Every capture owns one transient model and
 * reuses the same lazy renderer, including across short offscreen lease gaps. */
export function createPackageThumbnailCache(options: PackageThumbnailCacheOptions = {}): PackageThumbnailCache {
  const entries = new Map<string, Entry>()
  const maxEntries = Math.max(1, options.maxEntries ?? 256), idleDelayMs = Math.max(0, options.idleDelayMs ?? 30_000)
  const scheduleTask = options.scheduleTask ?? schedulePackageThumbnailTask
  let renderer: PackageThumbnailRenderer | null = null, failed = false, disposed = false, refs = 0, running = false, sequence = 0
  let cancelTask: (() => void) | undefined, scheduledPriority: PackageThumbnailPriority | undefined, idleTimer: ReturnType<typeof setTimeout> | undefined

  const clearIdle = () => { if (idleTimer !== undefined) { clearTimeout(idleTimer); idleTimer = undefined } }
  const disposeRenderer = () => { const owned = renderer; renderer = null; owned?.dispose() }
  const idle = () => {
    if (running || !renderer) return
    if (disposed) { disposeRenderer(); return }
    if (refs > 0 || idleTimer !== undefined) return
    if (idleDelayMs === 0) { disposeRenderer(); return }
    idleTimer = setTimeout(() => { idleTimer = undefined; if (!running && refs === 0) disposeRenderer() }, idleDelayMs)
    // A headless test/SSR process need not remain alive for an unused GPU cache.
    if (typeof idleTimer === 'object' && 'unref' in idleTimer) idleTimer.unref()
  }
  const trim = () => {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries) break
      if (entry.refs === 0 && entry.state === 'complete') entries.delete(key)
    }
  }
  const entryPriority = (entry: Entry): PackageThumbnailPriority => {
    let highest: PackageThumbnailPriority = 'preload'
    for (const priority of entry.priorities.values()) if (priorityRank[priority] < priorityRank[highest]) highest = priority
    return highest
  }
  const nextEntry = () => {
    let next: Entry | undefined
    for (const entry of entries.values()) {
      if (entry.state !== 'queued' || entry.refs === 0) continue
      if (!next || priorityRank[entryPriority(entry)] < priorityRank[entryPriority(next)] || entryPriority(entry) === entryPriority(next) && entry.order < next.order) next = entry
    }
    return next
  }
  const cancelScheduled = () => { cancelTask?.(); cancelTask = undefined; scheduledPriority = undefined }
  const complete = (entry: Entry, image: string | null) => { entry.module = undefined; entry.state = 'complete'; entry.resolve(image) }
  const settleFallbacks = () => {
    cancelScheduled()
    for (const entry of entries.values()) if (entry.state === 'queued') complete(entry, null)
  }
  const capture = async (entry: Entry) => {
    running = true; entry.state = 'rendering'
    let model: Group | undefined, image: string | null = null
    try {
      if (!renderer) {
        try { renderer = (options.createRenderer ?? createWebGLThumbnailRenderer)() }
        catch { failed = true }
        if (!renderer) failed = true
      }
      if (renderer && !disposed) {
        // Factory errors affect this image, whereas context/capture failures
        // permanently disable GPU retries for the lifetime of this cache.
        model = buildComponent(entry.module!)
        try {
          image = await renderer.render(model)
        } catch {
          failed = true; disposeRenderer()
        }
      }
    } catch {
      // Invalid model data falls back without poisoning other component types.
    } finally {
      if (model) disposeObject(model)
      running = false; complete(entry, image)
      if (failed) settleFallbacks()
      trim(); schedule(); idle()
    }
  }
  const schedule = () => {
    if (running || disposed || failed) return
    const next = nextEntry()
    if (!next) { cancelScheduled(); return }
    const priority = entryPriority(next)
    if (cancelTask && scheduledPriority === priority) return
    cancelScheduled(); scheduledPriority = priority
    cancelTask = scheduleTask(() => {
      cancelTask = undefined; scheduledPriority = undefined
      const requested = nextEntry()
      if (requested && !disposed && !failed) void capture(requested)
    }, priority)
  }

  return {
    acquire(type, properties, request) {
      const definition = getDefinition(type), descriptor = getPartForType(type)
      if (!definition || disposed) return { ready: Promise.resolve(null), release() {} }
      let module: CircuitModule, key: string
      try {
        // Snapshot reactive draft data without retaining or mutating an instance
        // or the shared descriptor defaults. Legacy input normalizes at this boundary.
        const effective = normalizeComponentProperties(type, { ...(descriptor?.editor.defaults ?? definition.defaults), ...normalizeComponentProperties(type, properties) })
        const snapshot = JSON.stringify(stableValue(visualProperties(type, effective)))
        module = { id: 'thumbnail', type, properties: JSON.parse(snapshot) as Record<string, unknown> }
        key = JSON.stringify([type, descriptor?.id ?? definition.partDefinitionId, descriptor?.revision ?? definition.partRevision, descriptor?.package.id, descriptor?.package.revision, snapshot])
      } catch { return { ready: Promise.resolve(null), release() {} } }
      let entry = entries.get(key)
      if (!entry) {
        if (failed) return { ready: Promise.resolve(null), release() {} }
        let resolve!: Entry['resolve']
        const ready = new Promise<string | null>(done => { resolve = done })
        entry = { module, ready, resolve, refs: 0, priorities: new Map(), order: sequence++, state: 'queued' }
      } else entries.delete(key)
      entries.set(key, entry)
      clearIdle()
      entry.refs++; refs++
      const owned = entry, token = Symbol()
      entry.priorities.set(token, request?.priority ?? 'high')
      let released = false
      if (entry.state === 'queued') schedule()
      trim()
      return {
        ready: entry.ready.then(image => released || disposed ? null : image),
        release() {
          if (released) return
          released = true; owned.priorities.delete(token); owned.refs--; refs--
          if (owned.refs === 0 && owned.state === 'queued') { entries.delete(key); complete(owned, null) }
          trim(); schedule(); idle()
        },
        setPriority(priority) {
          if (released || disposed || owned.state !== 'queued') return
          owned.priorities.set(token, priority); schedule()
        },
      }
    },
    dispose() {
      if (disposed) return
      disposed = true; cancelScheduled(); clearIdle(); settleFallbacks(); entries.clear()
      if (!running) disposeRenderer()
    },
  }
}

/** Browser boundary kept separate from queue/cache behavior for headless tests. */
function createWebGLThumbnailRenderer(): PackageThumbnailRenderer | null {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || typeof WebGL2RenderingContext === 'undefined') return null
  let renderer: WebGLRenderer | undefined, environment: ReturnType<typeof createStudioEnvironment> | undefined
  try {
    const width = 256, height = 192, aspect = width / height
    renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1); renderer.setSize(width, height, false)
    renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = NoToneMapping; renderer.toneMappingExposure = 1
    renderer.setClearColor(0x000000, 0)
    const scene = createPackageThumbnailScene(), camera = new OrthographicCamera(-aspect, aspect, 1, -1, .01, 100)
    environment = createStudioEnvironment(renderer)
    scene.environment = environment.texture
    const ownedRenderer = renderer, ownedEnvironment = environment
    let disposed = false
    return {
      render(model) {
        if (ownedRenderer.getContext().isContextLost()) throw new Error('Thumbnail WebGL context was lost.')
        scene.add(model)
        try {
          fitPackageThumbnailCamera(model, camera, aspect)
          ownedRenderer.render(scene, camera)
          if (ownedRenderer.getContext().isContextLost()) throw new Error('Thumbnail WebGL context was lost.')
          return ownedRenderer.domElement.toDataURL('image/png')
        } finally { scene.remove(model) }
      },
      dispose() {
        if (disposed) return
        disposed = true; scene.environment = null
        ownedEnvironment.dispose(); ownedRenderer.dispose(); ownedRenderer.forceContextLoss()
      },
    }
  } catch {
    environment?.dispose(); renderer?.dispose(); renderer?.forceContextLoss()
    return null
  }
}

export const packageThumbnails = createPackageThumbnailCache()
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('pagehide', event => { if (!event.persisted) packageThumbnails.dispose?.() })
