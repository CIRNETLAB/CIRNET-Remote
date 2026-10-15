import { Box3, BoxGeometry, CanvasTexture, CylinderGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, SphereGeometry, Sprite, SpriteMaterial, Texture, Vector3, type BufferGeometry, type Material } from 'three'
import { getDefinition, type LogicalPort } from '../data/editorCatalog'
import type { CircuitModule } from '../types/circuit'
import { addBreadboardHousing } from './BreadboardHousing'
import { getBreadboardGeometrySpec } from '../geometry/BreadboardGeometrySpec'
import { addPowerSupplyModel, applyPowerSupplyControls } from './PowerSupplyModel'
import { addOscilloscopeModel } from './OscilloscopeModel'
import { addFunctionGeneratorModel } from './FunctionGeneratorModel'
import { getPartForType } from '../data/partCatalog'
import { addPackageModel, packagePinAnchor } from './PackageModel'

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

function createBreadboardTexture(type: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const width = 2400
  const height = 710
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const [w, , d] = getBreadboardGeometrySpec(type)!.size
  const pitch = 0.13
  const spanX = 62 * pitch

  const toPx = (wx: number, wz: number): [number, number] => [
    ((wx + w / 2) / w) * width,
    ((wz + d / 2) / d) * height
  ]

  // Clean off-white ABS plastic surface
  ctx.fillStyle = '#fafbfc'
  ctx.fillRect(0, 0, width, height)

  // Outer plastic beveled border
  ctx.lineWidth = 3
  ctx.strokeStyle = '#cbd5e1'
  ctx.strokeRect(1, 1, width - 2, height - 2)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#e2e8f0'
  ctx.strokeRect(4, 4, width - 8, height - 8)

  // Modular strip seams (dividing top bus, middle terminal block, bottom bus)
  const [, cySeamTop] = toPx(0, -0.93)
  const [, cySeamBot] = toPx(0, 0.93)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#d1d5db'
  ctx.beginPath(); ctx.moveTo(width * 0.01, cySeamTop); ctx.lineTo(width * 0.99, cySeamTop); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(width * 0.01, cySeamBot); ctx.lineTo(width * 0.99, cySeamBot); ctx.stroke()

  // Center trough / groove channel (IC divider between rows E and F)
  const [, cyTrough] = toPx(0, 0)
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(width * 0.015, cyTrough - 16, width * 0.97, 32)
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.strokeRect(width * 0.015, cyTrough - 16, width * 0.97, 32)
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(width * 0.015, cyTrough); ctx.lineTo(width * 0.985, cyTrough); ctx.stroke()

  // Power distribution lines: Red (+) and Cobalt Blue (-)
  // Top rail: Red at -1.25, Blue at -0.98
  // Bottom rail: Red at +0.98, Blue at +1.25
  const [, cyTopRed] = toPx(0, -1.25)
  const [, cyTopBlue] = toPx(0, -0.98)
  const [, cyBotRed] = toPx(0, 0.98)
  const [, cyBotBlue] = toPx(0, 1.25)

  const lineStartX = width * 0.038
  const lineEndX = width * 0.962

  ctx.lineWidth = 5
  ctx.strokeStyle = '#dc2626'
  ctx.beginPath(); ctx.moveTo(lineStartX, cyTopRed); ctx.lineTo(lineEndX, cyTopRed); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(lineStartX, cyBotRed); ctx.lineTo(lineEndX, cyBotRed); ctx.stroke()

  ctx.strokeStyle = '#0284c7'
  ctx.beginPath(); ctx.moveTo(lineStartX, cyTopBlue); ctx.lineTo(lineEndX, cyTopBlue); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(lineStartX, cyBotBlue); ctx.lineTo(lineEndX, cyBotBlue); ctx.stroke()

  // Polarity markings (+ and -) bold, large, high-contrast
  ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const sx of [width * 0.022, width * 0.978]) {
    ctx.fillStyle = '#dc2626'; ctx.fillText('+', sx, cyTopRed)
    ctx.fillStyle = '#0284c7'; ctx.fillText('-', sx, cyTopBlue)
    ctx.fillStyle = '#dc2626'; ctx.fillText('+', sx, cyBotRed)
    ctx.fillStyle = '#0284c7'; ctx.fillText('-', sx, cyBotBlue)
  }

  // 63 column coordinates with uniform pitch
  const colsX: number[] = []
  for (let i = 0; i < 63; i++) colsX.push(-spanX / 2 + i * pitch)

  // Column numbers (1, 5, 10, ... 60, 63) bold and crisp
  const [, cyNumTop] = toPx(0, -0.83)
  const [, cyNumBot] = toPx(0, 0.83)
  ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = '#0f172a'
  for (let i = 0; i < 63; i++) {
    const colNum = i + 1
    if (colNum === 1 || colNum % 5 === 0 || colNum === 63) {
      const [cx] = toPx(colsX[i], 0)
      ctx.fillText(String(colNum), cx, cyNumTop)
      ctx.fillText(String(colNum), cx, cyNumBot)
    }
  }

  // Row letters: Upper strip A-E, Lower strip F-J
  const rowZUpper = [-pitch * 5.5, -pitch * 4.5, -pitch * 3.5, -pitch * 2.5, -pitch * 1.5]
  const rowZLower = [pitch * 1.5, pitch * 2.5, pitch * 3.5, pitch * 4.5, pitch * 5.5]
  const lettersUpper = ['A', 'B', 'C', 'D', 'E']
  const lettersLower = ['F', 'G', 'H', 'I', 'J']

  for (const labelX of [colsX[0] - 0.28, colsX[62] + 0.28]) {
    const [cx] = toPx(labelX, 0)
    for (let r = 0; r < 5; r++) {
      const [, cyU] = toPx(0, rowZUpper[r])
      ctx.fillText(lettersUpper[r], cx, cyU)
      const [, cyL] = toPx(0, rowZLower[r])
      ctx.fillText(lettersLower[r], cx, cyL)
    }
  }

  // Socket openings, bevels and cavity floors are rendered as real geometry.

  const texture = new CanvasTexture(canvas)
  texture.anisotropy = 16
  texture.needsUpdate = true
  return texture
}

function createBreadboard630Texture(type: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const width = 2400
  const height = 496
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const [w, , d] = getBreadboardGeometrySpec(type)!.size
  const pitch = 0.13
  const spanX = 62 * pitch

  const toPx = (wx: number, wz: number): [number, number] => [
    ((wx + w / 2) / w) * width,
    ((wz + d / 2) / d) * height
  ]

  // Clean off-white ABS plastic surface
  ctx.fillStyle = '#fafbfc'
  ctx.fillRect(0, 0, width, height)

  // Outer plastic beveled border
  ctx.lineWidth = 3
  ctx.strokeStyle = '#cbd5e1'
  ctx.strokeRect(1, 1, width - 2, height - 2)
  ctx.lineWidth = 2
  ctx.strokeStyle = '#e2e8f0'
  ctx.strokeRect(4, 4, width - 8, height - 8)

  // Center trough / groove channel (IC divider between rows E and F)
  const [, cyTrough] = toPx(0, 0)
  ctx.fillStyle = '#e2e8f0'
  ctx.fillRect(width * 0.015, cyTrough - 16, width * 0.97, 32)
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.strokeRect(width * 0.015, cyTrough - 16, width * 0.97, 32)
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(width * 0.015, cyTrough); ctx.lineTo(width * 0.985, cyTrough); ctx.stroke()

  // 63 column coordinates with uniform pitch
  const colsX: number[] = []
  for (let i = 0; i < 63; i++) colsX.push(-spanX / 2 + i * pitch)

  // Column numbers (1, 5, 10, ... 60, 63) bold and crisp at top and bottom margins
  const [, cyNumTop] = toPx(0, -0.82)
  const [, cyNumBot] = toPx(0, 0.82)
  ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0f172a'
  for (let i = 0; i < 63; i++) {
    const colNum = i + 1
    if (colNum === 1 || colNum % 5 === 0 || colNum === 63) {
      const [cx] = toPx(colsX[i], 0)
      ctx.fillText(String(colNum), cx, cyNumTop)
      ctx.fillText(String(colNum), cx, cyNumBot)
    }
  }

  // Row letters: Upper strip A-E, Lower strip F-J
  const rowZUpper = [-pitch * 5.5, -pitch * 4.5, -pitch * 3.5, -pitch * 2.5, -pitch * 1.5]
  const rowZLower = [pitch * 1.5, pitch * 2.5, pitch * 3.5, pitch * 4.5, pitch * 5.5]
  const lettersUpper = ['A', 'B', 'C', 'D', 'E']
  const lettersLower = ['F', 'G', 'H', 'I', 'J']

  for (const labelX of [colsX[0] - 0.28, colsX[62] + 0.28]) {
    const [cx] = toPx(labelX, 0)
    for (let r = 0; r < 5; r++) {
      const [, cyU] = toPx(0, rowZUpper[r])
      ctx.fillText(lettersUpper[r], cx, cyU)
      const [, cyL] = toPx(0, rowZLower[r])
      ctx.fillText(lettersLower[r], cx, cyL)
    }
  }

  // Socket openings, bevels and cavity floors are rendered as real geometry.

  const texture = new CanvasTexture(canvas)
  texture.anisotropy = 16
  texture.needsUpdate = true
  return texture
}

function createBreadboard100Texture(type: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const width = 2400
  const height = 140
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const [w, , d] = getBreadboardGeometrySpec(type)!.size
  const pitch = 0.13
  const spanX = 62 * pitch

  const toPx = (wx: number, wz: number): [number, number] => [
    ((wx + w / 2) / w) * width,
    ((wz + d / 2) / d) * height
  ]

  // Clean off-white ABS plastic surface
  ctx.fillStyle = '#fafbfc'
  ctx.fillRect(0, 0, width, height)

  // Outer plastic beveled border
  ctx.lineWidth = 2
  ctx.strokeStyle = '#cbd5e1'
  ctx.strokeRect(1, 1, width - 2, height - 2)
  ctx.lineWidth = 1
  ctx.strokeStyle = '#e2e8f0'
  ctx.strokeRect(3, 3, width - 6, height - 6)

  // Power distribution lines: Top Red (+), Bottom Blue (-)
  const [, cyRed] = toPx(0, -0.18)
  const [, cyBlue] = toPx(0, 0.18)

  const lineStartX = width * 0.038
  const lineEndX = width * 0.962

  ctx.lineWidth = 5
  ctx.strokeStyle = '#dc2626'
  ctx.beginPath(); ctx.moveTo(lineStartX, cyRed); ctx.lineTo(lineEndX, cyRed); ctx.stroke()

  ctx.strokeStyle = '#0284c7'
  ctx.beginPath(); ctx.moveTo(lineStartX, cyBlue); ctx.lineTo(lineEndX, cyBlue); ctx.stroke()

  // Polarity markings (+ and -) bold, large, high-contrast
  ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const sx of [width * 0.022, width * 0.978]) {
    ctx.fillStyle = '#dc2626'; ctx.fillText('+', sx, cyRed)
    ctx.fillStyle = '#0284c7'; ctx.fillText('-', sx, cyBlue)
  }

  // Socket openings, bevels and cavity floors are rendered as real geometry.

  const texture = new CanvasTexture(canvas)
  texture.anisotropy = 16
  texture.needsUpdate = true
  return texture
}

export function portAnchor(type: string, port: LogicalPort): Vector3 {
  const physical = packagePinAnchor(type, port.id)
  if (physical) return physical
  const definition = getDefinition(type)!
  const side = port.direction === 'output' || (port.direction === 'inout' && definition.ports.indexOf(port) % 2 === 1) ? 1 : -1
  const peers = definition.ports.filter((item) => (item.direction === 'output' || (item.direction === 'inout' && definition.ports.indexOf(item) % 2 === 1) ? 1 : -1) === side)
  return new Vector3(side * (definition.size[0] / 2 + 0.2), definition.size[1] + 0.16, ((peers.indexOf(port) + 1) / (peers.length + 1) - 0.5) * definition.size[2])
}

export function buildComponent(module: CircuitModule): Group {
  const definition = getDefinition(module.type)
  const part = getPartForType(module.type)
  const [w, h, d] = definition?.size ?? [1.5, 0.5, 1]
  const group = new Group()
  group.userData = { kind: 'module', id: module.id, type: module.type, size: [w, h, d], signature: JSON.stringify([module.type, module.properties]) }
  const material = (color: string) => new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.12 })
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => {
    const mesh = new Mesh(new BoxGeometry(sx, sy, sz), material(color)); mesh.userData.selectionSurface = true; mesh.position.set(x, y, z); group.add(mesh); return mesh
  }
  const cylinder = (radius: number, height: number, color: string) => { const mesh = new Mesh(new CylinderGeometry(radius, radius, height, 20), material(color)); mesh.userData.selectionSurface = true; return mesh }
  const color = definition?.color ?? '#72829a'

  if (part) {
    addPackageModel(group, module, part)
  } else if (definition?.visual === 'resistor') {
    const body = cylinder(0.23, w * 0.7, color); body.rotation.z = Math.PI / 2; body.position.y = h / 2 + 0.08; group.add(body)
    for (const [x, band] of [[-0.4, '#6c4434'], [-0.15, '#272528'], [0.15, '#b64137'], [0.4, '#c8a150']] as const) {
      const ring = cylinder(0.23, 0.07, band)
      // Flush paint bands retain the body silhouette; offset their depth to avoid flicker.
      ring.material.polygonOffset = true; ring.material.polygonOffsetFactor = -1; ring.material.polygonOffsetUnits = -1
      ring.userData.selectionSurface = false; ring.rotation.z = Math.PI / 2; ring.position.set(x, h / 2 + 0.08, 0); group.add(ring)
    }
  } else if (definition?.visual === 'capacitor' || definition?.visual === 'led') {
    const body = cylinder(w * 0.35, h, color); body.position.y = h / 2 + 0.05; group.add(body)
    if (definition.visual === 'led') { const dome = new Mesh(new SphereGeometry(w * 0.35, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), material(color)); dome.userData.selectionSurface = true; dome.position.y = h; group.add(dome) }
  } else if (definition?.visual === 'breadboard') {
    addBreadboardHousing(group, module.type, color, createBreadboardTexture(module.type))
  } else if (definition?.visual === 'breadboard_630') {
    addBreadboardHousing(group, module.type, color, createBreadboard630Texture(module.type))
  } else if (definition?.visual === 'breadboard_100') {
    addBreadboardHousing(group, module.type, color, createBreadboard100Texture(module.type))
  } else if (definition?.visual === 'supply') {
    addPowerSupplyModel(group, [w, h, d])
  } else if (definition?.visual === 'oscilloscope') {
    addOscilloscopeModel(group)
  } else if (definition?.visual === 'generator') {
    addFunctionGeneratorModel(group)
  } else {
    box(0, h / 2 + 0.02, 0, w, h, d, color)
    if (definition?.visual === 'button') box(0, h + 0.12, 0, w * 0.65, 0.25, d * 0.65, module.properties?.state ? '#d7b58e' : '#835f87')
    if (definition?.visual === 'toggle') { const lever = box(0, h + 0.25, 0, 0.15, 0.55, 0.2, '#c0d1db'); lever.rotation.z = module.properties?.state ? -0.4 : 0.4 }
    if (definition?.visual === 'dip') for (let i = 0; i < 4; i++) box((i - 1.5) * 0.38, h + 0.08, ((Number(module.properties?.value ?? 0) >> i) & 1) ? -0.2 : 0.2, 0.22, 0.18, 0.3, '#e6dac4')
    if (definition?.visual === 'display' || definition?.visual === 'clock') box(0, h + 0.02, 0, w * 0.72, 0.04, d * 0.65, '#152a2e')
    if (definition?.visual === 'segment') {
      for (const [x, z, sx, sz] of [[0, -0.6, 0.6, 0.1], [0, 0, 0.6, 0.1], [0, 0.6, 0.6, 0.1], [-0.35, -0.3, 0.1, 0.45], [0.35, -0.3, 0.1, 0.45], [-0.35, 0.3, 0.1, 0.45], [0.35, 0.3, 0.1, 0.45]]) box(x, h + 0.04, z, sx, 0.025, sz, '#683839')
    }
  }
  for (const port of part ? [] : definition?.ports ?? []) {
    const anchor = new Mesh(new SphereGeometry(0.115, 12, 8), material(port.direction === 'output' ? '#ddb56d' : port.direction === 'input' ? '#69cbbb' : '#96bde6'))
    anchor.position.copy(portAnchor(module.type, port))
    anchor.userData = { kind: 'port', id: module.id, endpoint: `${module.id}.${port.id}` }
    group.add(anchor)
  }
  if (!part && typeof document !== 'undefined' && !definition?.visual?.startsWith('breadboard') && definition?.visual !== 'supply' && definition?.visual !== 'oscilloscope' && definition?.visual !== 'generator') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80
    const context = canvas.getContext('2d')
    if (context) {
      context.fillStyle = '#172332e8'; context.fillRect(0, 0, 512, 80)
      context.fillStyle = '#d5e8ee'; context.textAlign = 'center'; context.font = '36px Segoe UI'; context.fillText(module.id + (definition?.visualOnly ? ' · visual' : ''), 256, 53, 500)
      const label = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false, transparent: true }))
      // Three's default Sprite geometry is global. Each disposable model owns
      // its label geometry so removal cannot invalidate other live labels.
      label.geometry = label.geometry.clone()
      label.position.set(0, h + 0.7, 0); label.scale.set(3.2, 0.5, 1); label.userData.ignorePick = true; group.add(label)
    }
  }
  // Cache unposed visual bounds once, before rotation/translation. Projecting a
  // world AABB again after yaw needlessly inflates the silhouette of tall models.
  const visualBounds = new Box3().setFromObject(group)
  group.userData.visualBounds = [visualBounds.min.toArray(), visualBounds.max.toArray()]
  applyPose(group, module)
  return group
}
export function applyPose(group: Group, module: CircuitModule) {
  group.position.set(module.position?.x ?? 0, module.position?.y ?? 0, module.position?.z ?? 0)
  group.rotation.y = ((module.rotation ?? 0) % 360) * Math.PI / 180
  if (getDefinition(module.type)?.visual === 'supply') applyPowerSupplyControls(group, module.properties)
  group.updateMatrixWorld(true)
}
