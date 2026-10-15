import { PMREMGenerator, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** One neutral prefiltered reflection resource per renderer, owned by its scene. */
export function createStudioEnvironment(renderer: WebGLRenderer) {
  const generator = new PMREMGenerator(renderer), room = new RoomEnvironment()
  const target = generator.fromScene(room, .04)
  room.dispose(); generator.dispose()
  let disposed = false
  return { texture: target.texture, dispose() { if (!disposed) { disposed = true; target.dispose() } } }
}
