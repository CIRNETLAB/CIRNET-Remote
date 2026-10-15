import { Mesh, MeshStandardMaterial, PMREMGenerator, type Material, type MeshStandardMaterialParameters, type Object3D, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Paint and moulded plastic are dielectric, including paint over a metal case.
 * A broad lobe and restrained indirect response avoid a hard travelling studio
 * highlight. Exposed metal uses its separate authored material instead. */
export function createCoatingMaterial(parameters: MeshStandardMaterialParameters) {
  return new MeshStandardMaterial({
    ...parameters,
    metalness: 0,
    roughness: Math.max(parameters.roughness ?? .8, .8),
    envMapIntensity: Math.min(parameters.envMapIntensity ?? .3, .3),
  })
}

/** Instrument artwork sits only .001–.0045 in front of its backing. At the
 * workbench's distant views that gap can share a depth value. Bias the existing
 * surface in depth space; keep its geometry, texture and normal occlusion. */
export function stabilizeThinSurface<T extends Material>(material: T): T {
  material.polygonOffset = true
  material.polygonOffsetFactor = -1
  material.polygonOffsetUnits = -2
  return material
}

/** Breadboard ABS keeps a faint studio response rather than disabling the
 * environment for Structure, which would also remove real metal reflections.
 * This runs in the shared model factory; scene lights remain untouched. */
export function preserveStructureLighting(model: Object3D) {
  if (!['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100'].includes(model.userData.type)) return
  model.traverse(object => {
    if (!(object instanceof Mesh)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) {
        material.envMapIntensity = .12
        material.roughness = Math.max(material.roughness, .92)
      }
    }
  })
}

/** One neutral prefiltered reflection resource per renderer, owned by its scene. */
export function createStudioEnvironment(renderer: WebGLRenderer) {
  const generator = new PMREMGenerator(renderer), room = new RoomEnvironment()
  const target = generator.fromScene(room, .04)
  room.dispose(); generator.dispose()
  let disposed = false
  return { texture: target.texture, dispose() { if (!disposed) { disposed = true; target.dispose() } } }
}
