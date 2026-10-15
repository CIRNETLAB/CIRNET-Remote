import { Mesh, MeshStandardMaterial, PMREMGenerator, type Object3D, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Structure was authored under the workspace's direct lights, before PMREM.
 * Keep that material response without changing scene lights or other groups.
 * Applied in the shared component factory, so previews use the same response. */
export function preserveStructureLighting(model: Object3D) {
  if (!['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100', 'POWER_SUPPLY', 'DC_SUPPLY'].includes(model.userData.type)) return
  model.traverse(object => {
    if (!(object instanceof Mesh)) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) material.envMapIntensity = 0
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
