import { AmbientLight, Box3, DirectionalLight, Group, InstancedMesh, Matrix4, Mesh, NoToneMapping, OrthographicCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer, type Object3D } from 'three'
import { getDefinition } from '../data/editorCatalog'
import { getPartForType } from '../data/partCatalog'
import { normalizeComponentProperties } from '../data/componentProperties'
import type { CircuitModule } from '../types/circuit'
import { buildComponent, disposeObject } from './ComponentModel'
import { createStudioEnvironment } from './StudioEnvironment'

export interface PackageThumbnailRenderer {
  /** Capture must finish before another model can use the shared canvas. */
  render(model: Group): string | Promise<string>
  dispose(): void
}
export interface PackageThumbnailLease { ready: Promise<string | null>; release(): void }
export interface PackageThumbnailCache { acquire(type: string, properties?: Record<string, unknown>): PackageThumbnailLease }
export const packageThumbnailCacheKey = Symbol.for('netcircuit.package-thumbnails')

interface Entry {
  module: CircuitModule
  refs: number
  state: 'queued' | 'rendering' | 'complete'
  ready: Promise<string | null>
  resolve: (image: string | null) => void
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]))
  return value
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

/** Cached CPU images outlive cards. One lazily created GPU renderer serves all
 * active leases, and is released after its final capture and final lease. */
export function createPackageThumbnailCache(options: { createRenderer?: () => PackageThumbnailRenderer | null; maxEntries?: number } = {}): PackageThumbnailCache {
  const entries = new Map<string, Entry>()
  const maxEntries = Math.max(1, options.maxEntries ?? 256)
  let renderer: PackageThumbnailRenderer | null = null, rendererAttempted = false, refs = 0, running = false

  const disposeRenderer = () => { const owned = renderer; renderer = null; owned?.dispose() }
  const idle = () => { if (!running && refs === 0) { disposeRenderer(); rendererAttempted = false } }
  const trim = () => {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries) break
      if (entry.refs === 0 && entry.state === 'complete') entries.delete(key)
    }
  }
  const drain = async () => {
    let captured = false
    try {
      for (const entry of entries.values()) {
        if (entry.state !== 'queued' || entry.refs === 0) continue
        // Rendering/toDataURL is synchronous in browsers. Yield between models
        // so palette input/unmount can cancel pending work before another capture.
        // This schedules tasks only while requested images remain in the queue.
        if (captured) await new Promise<void>(resolve => setTimeout(resolve, 0))
        if (entry.state !== 'queued' || entry.refs === 0) continue
        entry.state = 'rendering'
        let model: Group | undefined, image: string | null = null
        try {
          if (!rendererAttempted) {
            rendererAttempted = true
            renderer = (options.createRenderer ?? createWebGLThumbnailRenderer)()
          }
          if (renderer) {
            model = buildComponent(entry.module)
            captured = true
            image = await renderer.render(model)
          }
        } catch {
          // A lost/unsupported context gets one attempt per lease lifetime,
          // rather than creating a new context for each card in the queue.
          disposeRenderer()
        } finally {
          if (model) disposeObject(model)
          entry.state = 'complete'
          entry.resolve(image)
        }
      }
    } finally { running = false; trim(); idle() }
  }
  const schedule = () => {
    if (running) return
    running = true
    void Promise.resolve().then(drain)
  }

  return {
    acquire(type, properties) {
      const definition = getDefinition(type), descriptor = getPartForType(type)
      if (!definition) return { ready: Promise.resolve(null), release() {} }
      let module: CircuitModule, key: string
      try {
        // Snapshot reactive draft data without retaining or mutating an instance
        // or the shared descriptor defaults. Legacy input normalizes at this boundary.
        const effective = normalizeComponentProperties(type, { ...(descriptor?.editor.defaults ?? definition.defaults), ...normalizeComponentProperties(type, properties) })
        const snapshot = JSON.stringify(stableValue(effective))
        module = { id: 'thumbnail', type, properties: JSON.parse(snapshot) as Record<string, unknown> }
        key = JSON.stringify([type, descriptor?.id ?? definition.partDefinitionId, descriptor?.revision ?? definition.partRevision, descriptor?.package.id, descriptor?.package.revision, snapshot])
      } catch { return { ready: Promise.resolve(null), release() {} } }
      let entry = entries.get(key)
      if (!entry) {
        let resolve!: Entry['resolve']
        const ready = new Promise<string | null>(done => { resolve = done })
        entry = { module, ready, resolve, refs: 0, state: 'queued' }
      } else entries.delete(key)
      entries.set(key, entry)
      entry.refs++; refs++
      const owned = entry
      let released = false
      if (entry.state === 'queued') schedule()
      trim()
      return {
        ready: entry.ready.then(image => released ? null : image),
        release() {
          if (released) return
          released = true; owned.refs--; refs--
          if (owned.refs === 0 && owned.state === 'queued') { entries.delete(key); owned.resolve(null) }
          trim(); idle()
        },
      }
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
        scene.add(model)
        try {
          fitPackageThumbnailCamera(model, camera, aspect)
          ownedRenderer.render(scene, camera)
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
