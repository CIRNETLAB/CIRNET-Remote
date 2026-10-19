import { Color, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three'

const DEFAULT_VIEW_DISTANCE = Math.hypot(11, 10)
const GRID_HALF_SIZE = 150
const LOCAL_FADE_END = 38

export function createTechnicalGrid() {
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: {
      minorStep: { value: 0.5 }, majorStep: { value: 2.5 }, minorVisibility: { value: 1 },
      focus: { value: new Vector2() }, fadeScale: { value: 1 },
      minorColor: { value: new Color('#263a49') }, majorColor: { value: new Color('#3b5260') },
    },
    vertexShader: `
      varying vec3 world;
      varying vec2 physicalClipDepth;
      void main() {
        vec4 positionWorld = modelMatrix * vec4(position, 1.0);
        world = positionWorld.xyz;
        gl_Position = projectionMatrix * viewMatrix * positionWorld;
        // Keep X/Y/W clipping and perspective, independently of model depth
        // planes. A constant carrier Z also handles vertices behind the eye
        // without reversed clamp bounds. Restore physical depth per fragment
        // so opaque models still occlude the grid normally.
        physicalClipDepth = gl_Position.zw;
        gl_Position.z = 0.0;
      }
    `,
    fragmentShader: `
      varying vec3 world;
      varying vec2 physicalClipDepth;
      uniform float minorStep, majorStep, minorVisibility, fadeScale;
      uniform vec2 focus;
      uniform vec3 minorColor, majorColor;
      float grid(float stepSize, float width) {
        vec2 cell = world.xz / stepSize;
        vec2 pixels = abs(fract(cell + 0.5) - 0.5) / max(fwidth(cell), vec2(0.00001));
        return 1.0 - smoothstep(width * 0.5, width * 0.5 + 1.0, min(pixels.x, pixels.y));
      }
      void main() {
        vec2 footprint = max(fwidth(world.xz), vec2(0.00001));
        float cellPixels = minorStep / max(footprint.x, footprint.y);
        float minor = grid(minorStep, 0.45) * minorVisibility * smoothstep(6.0, 14.0, cellPixels);
        float major = grid(majorStep, 0.8);
        float distanceFade = 1.0 - smoothstep(12.0, 52.0, distance(cameraPosition, world) / fadeScale);
        float localFade = 1.0 - smoothstep(8.0, 38.0, distance(world.xz, focus) / fadeScale);
        float fade = distanceFade * localFade;
        vec2 axisPixels = abs(world.xz) / footprint;
        float axis = (1.0 - smoothstep(0.3, 1.3, min(axisPixels.x, axisPixels.y))) * 0.12;
        float alpha = max(max(minor * 0.28, major * 0.48), axis) * fade;
        if (alpha < 0.002) discard;
        gl_FragDepth = clamp(0.5 * physicalClipDepth.x / physicalClipDepth.y + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(minorColor, majorColor, step(minor * 0.28, major * 0.48)), alpha);
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new Mesh(new PlaneGeometry(300, 300), material)
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = -0.015; mesh.userData.ignorePick = true
  // CPU frustum depth culling cannot describe the helper's custom depth clamp.
  mesh.frustumCulled = false
  mesh.raycast = () => {}
  return mesh
}

// Global zoom suppression complements per-fragment derivative filtering toward the horizon.
export function updateTechnicalGrid(grid: ReturnType<typeof createTechnicalGrid>, camera: PerspectiveCamera, target: Vector3, height: number) {
  const distance = Math.max(0.1, camera.position.distanceTo(target))
  const pixels = 0.5 * height * camera.zoom / (2 * Math.tan(camera.fov * Math.PI / 360) * distance)
  const t = Math.min(1, Math.max(0, (pixels - 6) / 8))
  grid.material.uniforms.minorVisibility.value = t * t * (3 - 2 * t)
  grid.material.uniforms.focus.value.set(target.x, target.z)
  // Retain the original default-view fade, widening it with the camera alone.
  // Selection, model bounds, fit reference and adaptive clips do not drive it.
  const fadeScale = Math.max(1, distance / DEFAULT_VIEW_DISTANCE)
  grid.material.uniforms.fadeScale.value = fadeScale
  // Cover the entire nonzero fade footprint before a finite plane edge can
  // appear. Scaling the carrier leaves the world-space lattice unchanged.
  const extent = Math.max(1, (LOCAL_FADE_END * fadeScale + 20) / GRID_HALF_SIZE)
  grid.scale.set(extent, extent, 1)
  // Follow navigation without moving the world-aligned lattice or exposing plane edges.
  grid.position.x = Math.round(target.x / 20) * 20; grid.position.z = Math.round(target.z / 20) * 20
}
