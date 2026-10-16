import { InstancedMesh,Mesh,Texture,type Object3D,type BufferGeometry,type Material } from 'three'

export function disposeObject(root: Object3D) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>()
  root.traverse((object) => {
    delete object.userData.onVisualChange
    if (object instanceof InstancedMesh) object.dispose()
    const renderable = object as Mesh
    if (renderable.geometry) geometries.add(renderable.geometry)
    const owned = renderable.material ? (Array.isArray(renderable.material) ? renderable.material : [renderable.material]) : []
    owned.forEach((material) => materials.add(material))
  })
  // Factories share materials within a model; maps can also be shared across
  // material slots. Release every owned resource once, including PBR maps.
  for (const material of materials) for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value)
  geometries.forEach((geometry) => geometry.dispose())
  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
}

