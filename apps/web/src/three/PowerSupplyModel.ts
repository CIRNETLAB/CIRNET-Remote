import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from 'three'
import { createCoatingMaterial, stabilizeThinSurface } from './StudioEnvironment'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { loadInstrumentLogo } from './InstrumentArtwork'
import { SUPPLY_THEME } from '../data/instrumentVisuals'

export type SupplyControl = 'voltage_v' | 'current_limit_a' | 'power_on'
/** Detailed Structure renderer dimensions, independent of an electrical package footprint. */
export const POWER_SUPPLY_VISUAL_SIZE = [2.4, 2.8, 3.2] as const
/** Front opening of the original binding posts; never changes a graph pin or net. */
export function supplyTerminalAnchor(pinId: string, [w, h, d]: readonly number[] = POWER_SUPPLY_VISUAL_SIZE): Vector3 | null {
  return pinId === 'PLUS' || pinId === 'MINUS' ? new Vector3(w * (pinId === 'PLUS' ? -.02 : .31), h * .14, d / 2 + .267) : null
}
/** Old knob identifiers remain visual controls; DC_SUPPLY stores its canonical voltage key. */
export function supplyControlPatch(type: string, control: SupplyControl, value: number | boolean): Record<string, unknown> {
  if (type === 'DC_SUPPLY' && control === 'current_limit_a') return {}
  return { [type === 'DC_SUPPLY' && control === 'voltage_v' ? 'voltage' : control]: value }
}
export const supplyControlMaximum = (control: SupplyControl) => control === 'voltage_v' ? 15 : 5
export function supplyControlValue(properties: Record<string, unknown> | undefined, control: SupplyControl, type = 'POWER_SUPPLY'): number | boolean {
  if (control === 'power_on') return properties?.power_on === true
  const value = type === 'DC_SUPPLY' && control === 'voltage_v' ? properties?.voltage ?? properties?.voltage_v : properties?.[control]
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(supplyControlMaximum(control), value)) : 0
}

// Local setpoints do not imply measured outputs or an attached physical source.
export function applyPowerSupplyControls(group: Group, properties?: Record<string, unknown>) {
  const type = group.userData.type as string, electrical = type === 'DC_SUPPLY'
  for (const [i, key] of (['voltage_v', 'current_limit_a'] as const).entries()) {
    const knob = group.getObjectByName(`supply-knob-${i}`)
    if (knob) knob.rotation.z = -((electrical && key === 'current_limit_a' ? 0 : supplyControlValue(properties, key, type) as number) / supplyControlMaximum(key) - 0.5) * Math.PI * 1.5
  }
  const on = supplyControlValue(properties, 'power_on', type) as boolean, rocker = group.getObjectByName('power-switch')
  if (rocker) rocker.rotation.x = on ? -0.18 : 0.18
  const screen = group.getObjectByName('supply-display') as Mesh<PlaneGeometry, MeshBasicMaterial> | undefined
  const voltage = supplyControlValue(properties, 'voltage_v', type) as number, current = electrical ? null : supplyControlValue(properties, 'current_limit_a', type) as number
  const settings = [on, voltage, current]
  if (screen && JSON.stringify(screen.userData.settings) !== JSON.stringify(settings)) {
    // Repaint the existing canvas/texture during dragging, without allocating a texture per pointer event.
    const texture = screen.material.map as CanvasTexture | null
    const ctx = texture?.image?.getContext('2d') as CanvasRenderingContext2D | null | undefined
    if (ctx) { drawDisplay(ctx, on, voltage, current); texture!.needsUpdate = true }
    screen.userData.settings = settings
  }
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d'); if (!ctx) return null
  draw(ctx)
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8; return texture
}

function drawDisplay(ctx: CanvasRenderingContext2D, on: boolean, voltage: number, current: number | null) {
  // OFF has no digits, units or dim LEDs. Settings remain in the graph and are
  // repainted on ON; this screen displays local settings, not physical telemetry.
  ctx.globalAlpha = 1; ctx.fillStyle = on ? '#060b10' : '#000000'; ctx.fillRect(0, 0, 700, 960)
  if (!on) return
  ctx.textAlign = 'left'
  const digits = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']
  const segments: Record<string, [number, number, number, number]> = {
    a: [14, -78, 77, -78], b: [86, -66, 86, -12], c: [86, 12, 86, 66],
    d: [14, 78, 77, 78], e: [6, 12, 6, 66], f: [6, -66, 6, -12], g: [14, 0, 77, 0],
  }
  for (const [row, unit, color, value] of [[0, 'V', SUPPLY_THEME.voltage, voltage], [1, 'A', SUPPLY_THEME.current, current], [2, 'W', SUPPLY_THEME.voltage, null]] as const) {
    const y = 200 + row * 280
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 14; ctx.lineCap = 'butt'
    const text = value === null ? '----' : value.toFixed(2).padStart(5, '0').replace('.', '')
    for (let digit = 0; digit < 4; digit++) {
      const x = 72 + digit * 120
      for (const segment of text[digit] === '-' ? 'g' : digits[Number(text[digit])]) {
        const [x1, y1, x2, y2] = segments[segment]
        ctx.beginPath(); ctx.moveTo(x + x1, y + y1); ctx.lineTo(x + x2, y + y2); ctx.stroke()
      }
    }
    if (value !== null) { ctx.beginPath(); ctx.arc(306, y + 78, 7, 0, Math.PI * 2); ctx.fill() }
    ctx.font = '600 64px Segoe UI'; ctx.fillText(unit, 584, y + 28)
  }
}

function displayTexture() { return canvasTexture(700, 960, (ctx) => drawDisplay(ctx, false, 0, 0)) }

function legendsTexture(w: number, h: number) {
  return canvasTexture(960, 1120, (ctx) => {
    const px = (x: number) => (x / (w - 0.16) + 0.5) * 960
    const py = (y: number) => (0.5 - (y - (h + 0.14) / 2) / (h - 0.26)) * 1120
    const text = (label: string, x: number, y: number, size = 34, weight: string | number = 500) => { ctx.font = `${weight} ${size}px Segoe UI`; ctx.fillText(label, px(x), py(y)) }
    ctx.fillStyle = '#c7d0d4'; ctx.textAlign = 'center'
    for (const [label, fraction, maximum, unit] of [['Voltage', 0.76, 15, 'V'], ['Ampe', 0.43, 5, 'A']] as const) {
      // The complete numbered ring fits inside the control strip, including
      // multi-character marks (12/15). Its angle matches the moving index.
      const x = w * 0.335, y = h * fraction, radius = w * 0.073 + 0.047
      ctx.strokeStyle = '#c7d0d4'; ctx.lineWidth = 3
      for (let i = 0; i <= 10; i++) {
        const angle = -Math.PI * 0.75 + i * Math.PI * 1.5 / 10
        ctx.beginPath(); ctx.moveTo(px(x + Math.sin(angle) * radius), py(y + Math.cos(angle) * radius))
        ctx.lineTo(px(x + Math.sin(angle) * (radius + 0.026)), py(y + Math.cos(angle) * (radius + 0.026))); ctx.stroke()
        if (i % 2 === 0) text(String(maximum * i / 10), x + Math.sin(angle) * (radius + 0.060), y + Math.cos(angle) * (radius + 0.060) - 0.012, 19)
      }
      text(`${label} · ${unit}`, x, y - w * 0.073 - 0.17, 32)
    }
    text('Vcc', -w * 0.02, h * 0.222, 42, 'bold'); text('Gnd', w * 0.31, h * 0.222, 42, 'bold')
    text('POWER', -w * 0.35, h * 0.237, 22, 'bold')

    // Header labels: 'Power Bench Supply' aligned horizontally with 'net*CIRCUIT'
    const textY = py(h * 0.932)
    ctx.font = 'bold 36px Segoe UI'
    ctx.fillStyle = '#dae3e7'
    ctx.fillText('Power Bench Supply', px(-w * 0.135), textY)

    ctx.font = '600 48px Segoe UI'
    const netWidth = (ctx.measureText ? ctx.measureText('net').width : 0) || 68
    const circuitWidth = (ctx.measureText ? ctx.measureText('*CIRCUIT').width : 0) || 178
    const totalWidth = netWidth + circuitWidth
    const startX = px(w * 0.335) - totalWidth / 2
    ctx.textAlign = 'left'
    ctx.fillStyle = '#e6eff3'; ctx.fillText('net', startX, textY)
    ctx.fillStyle = '#20d4ee'; ctx.fillText('*CIRCUIT', startX + netWidth, textY)
  })
}

// The detailed case is shared by the legacy visual instrument and electrical DC
// source. Only the latter binds the existing PLUS/MINUS endpoints to its posts.
export function addPowerSupplyModel(group: Group, [w, h, d]: readonly number[]) {
  const electrical = group.userData.type === 'DC_SUPPLY'
  // Only collars and fasteners expose metal. Enclosure paint and plastic grips
  // must not inherit the conductive reflectance of their substrate.
  const mat = (color: string, metalness = 0, roughness = 0.55) => metalness >= .65
    ? new MeshStandardMaterial({ color, metalness, roughness })
    : createCoatingMaterial({ color, roughness })
  const add = (name: string, mesh: Mesh, x: number, y: number, z: number, contour = false, parent = group) => {
    mesh.name = name; mesh.position.set(x, y, z); mesh.userData.selectionSurface = contour; parent.add(mesh); return mesh
  }
  const box = (name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string, parent = group) => add(name, new Mesh(new BoxGeometry(sx, sy, sz), mat(color)), x, y, z, false, parent)
  const control = (name: string, key: SupplyControl, x: number, y: number, z: number) => {
    const pivot = new Group(); pivot.name = name; pivot.position.set(x, y, z)
    if (!(electrical && key === 'current_limit_a')) pivot.userData = { kind: 'control', id: group.userData.id, control: key }
    group.add(pivot); return pivot
  }
  const front = d / 2, panelY = (h + 0.14) / 2
  add('supply-enclosure', new Mesh(new RoundedBoxGeometry(w, h - 0.14, d - 0.16, 4, 0.065), mat('#a1aab4', 0.48, 0.38)), 0, panelY, -0.08, true)
  add('supply-bezel', new Mesh(new RoundedBoxGeometry(w - 0.035, h - 0.17, 0.16, 4, 0.045), mat(SUPPLY_THEME.bezel, 0.32, 0.4)), 0, panelY, front - 0.08, true)
  add('supply-front', new Mesh(new RoundedBoxGeometry(w - 0.16, h - 0.26, 0.025, 3, 0.025), mat(SUPPLY_THEME.panel, 0.24, 0.52)), 0, panelY, front + 0.003)
  add('control-strip', new Mesh(new RoundedBoxGeometry(w * 0.265, h * 0.66, 0.025, 3, 0.027), mat('#343c42', 0.2, 0.48)), w * 0.335, h * 0.585, front + 0.025)
  // Keep the upper glass edge below the case header and the lower edge above
  // the output labels. Printed branding occupies the right-hand header space.
  add('display-recess', new Mesh(new RoundedBoxGeometry(w * 0.63, h * 0.66, 0.035, 3, 0.035), mat('#080d12')), -w * 0.135, h * 0.585, front + 0.022)
  const screen = displayTexture()
  add('supply-display', new Mesh(new PlaneGeometry(w * 0.60, h * 0.63), stabilizeThinSurface(new MeshBasicMaterial({ color: screen ? '#ffffff' : '#000000', map: screen, toneMapped: false }))), -w * 0.135, h * 0.585, front + 0.041).userData.settings = [false, 0, 0]
  const legends = legendsTexture(w, h)
  if (legends) add('front-legends', new Mesh(new PlaneGeometry(w - 0.16, h - 0.26), stabilizeThinSurface(new MeshBasicMaterial({ map: legends, transparent: true, depthWrite: false, toneMapped: false }))), 0, panelY, front + 0.055)
  const logoUrl = new URL('../assets/icons/favicon.svg', import.meta.url).href
  const logoTexture = typeof document !== 'undefined' && typeof document.createElementNS === 'function'
  ? loadInstrumentLogo(group, logoUrl) : null
  const logo = add('supply-brand-icon', new Mesh(new PlaneGeometry(0.155, 0.155), new MeshBasicMaterial({ map: logoTexture, transparent: true, depthWrite: false, toneMapped: false })), w * 0.165, h * 0.947, front + 0.06)
  logo.userData.asset = 'favicon.svg'

  for (const [i, fraction] of [0.76, 0.43].entries()) {
    const x = w * 0.335, y = h * fraction, radius = w * 0.073
    add('knob-collar', new Mesh(new TorusGeometry(radius + 0.014, 0.012, 12, 40), mat('#68737a', 0.65, 0.3)), x, y, front + 0.055)
    const pivot = control(`supply-knob-${i}`, i === 0 ? 'voltage_v' : 'current_limit_a', x, y, front + 0.125)
    const knob = add('knob-body', new Mesh(new CylinderGeometry(radius, radius + 0.006, 0.17, 40), mat('#141b20', 0.15, 0.36)), 0, 0, 0, false, pivot); knob.rotation.x = Math.PI / 2
    for (let r = 0; r < 24; r++) {
      const angle = r * Math.PI / 12
      const ridge = box('knob-flute', 0.022, 0.018, 0.15, Math.sin(angle) * radius, Math.cos(angle) * radius, 0.005, '#465159', pivot); ridge.rotation.z = -angle
    }
    const cap = add('knob-cap', new Mesh(new CylinderGeometry(radius * 0.88, radius * 0.88, 0.016, 40), mat('#2b343b', 0.25, 0.4)), 0, 0, 0.093, false, pivot); cap.rotation.x = Math.PI / 2
    box('knob-index', 0.025, radius * 0.46, 0.008, 0, radius * 0.52, 0.106, '#d3dce0', pivot)
  }
  for (const [i, color] of ['#dc3b32', '#20272c'].entries()) {
    const x = w * (i === 0 ? -0.02 : 0.31), y = h * 0.14
    const pinId = i === 0 ? 'PLUS' : 'MINUS', parent = electrical ? new Group() : group
    const endpoint = { kind: 'port', id: group.userData.id, endpoint: `${group.userData.id}.${pinId}`, pinId, pinName: i === 0 ? '+' : '−', pinNumber: pinId, electricalRole: i === 0 ? 'power' : 'ground' }
    if (electrical) { parent.name = `supply-binding-post-${pinId}`; parent.userData = endpoint; group.add(parent) }
    const base = add(`supply-terminal-${i}`, new Mesh(new CylinderGeometry(0.18, 0.18, 0.11, 32, 1, true), mat(color)), x, y, front + 0.072, false, parent); base.rotation.x = Math.PI / 2
    add('terminal-flange', new Mesh(new TorusGeometry(0.154, 0.027, 12, 32), mat(color)), x, y, front + 0.112, false, parent)
    const collar = add('binding-post-grip', new Mesh(new CylinderGeometry(0.137, 0.145, 0.17, 32, 1, true), mat('#1c252b', 0.1, 0.45)), x, y, front + 0.177, false, parent); collar.rotation.x = Math.PI / 2
    for (let r = 0; r < 20; r++) {
      const angle = r * Math.PI / 10
      const ridge = box('post-flute', 0.016, 0.017, 0.15, x + Math.sin(angle) * 0.141, y + Math.cos(angle) * 0.141, front + 0.177, '#4a5358', parent); ridge.rotation.z = -angle
    }
    add('post-rim', new Mesh(new TorusGeometry(0.105, 0.033, 12, 32), mat(i === 0 ? '#f04c3d' : '#657079', 0.25, 0.35)), x, y, front + 0.267, false, parent)
    const bore = add('socket-bore', new Mesh(new CylinderGeometry(0.073, 0.073, 0.16, 32, 1, true), new MeshStandardMaterial({ color: '#0b1117', side: DoubleSide, roughness: 0.8 })), x, y, front + 0.174, false, parent); bore.rotation.x = Math.PI / 2
    const shadow = add('socket-floor', new Mesh(new CylinderGeometry(0.073, 0.073, 0.002, 32), mat('#030609')), x, y, front + 0.095, false, parent); shadow.rotation.x = Math.PI / 2
    if (electrical) {
      const opening = new Group(); opening.name = `supply-socket-opening-${pinId}`; opening.position.copy(supplyTerminalAnchor(pinId, [w, h, d])!); parent.add(opening)
      const target = add(`package-pin-target-${pinId}`, new Mesh(new SphereGeometry(.073, 16, 10), new MeshBasicMaterial({ visible: false, depthWrite: false })), opening.position.x, opening.position.y, opening.position.z)
      target.userData = { ...endpoint, pinTarget: true }
      const highlight = add(`package-pin-highlight-${pinId}`, new Mesh(new TorusGeometry(.105, .008, 8, 32), new MeshBasicMaterial({ color: '#eac76d' })), opening.position.x, opening.position.y, opening.position.z + .002)
      highlight.visible = false; highlight.userData = { pinHighlight: true, pinId, ignorePick: true }
    }
  }
  const switchX = -w * 0.35, switchY = h * 0.14
  add('switch-surround', new Mesh(new RoundedBoxGeometry(0.38, 0.48, 0.075, 3, 0.025), mat('#0c1218')), switchX, switchY, front + 0.045)
  const rocker = control('power-switch', 'power_on', switchX, switchY, front + 0.096)
  add('switch-rocker', new Mesh(new RoundedBoxGeometry(0.27, 0.37, 0.055, 3, 0.016), mat('#e44335', 0.1, 0.4)), 0, 0, 0, false, rocker)
  const switchLegend = canvasTexture(100, 160, (ctx) => { ctx.fillStyle = '#f8eeea'; ctx.textAlign = 'center'; ctx.font = '46px Segoe UI'; ctx.fillText('I', 50, 56); ctx.fillText('O', 50, 126) })
  if (switchLegend) add('switch-legend', new Mesh(new PlaneGeometry(0.22, 0.33), new MeshBasicMaterial({ map: switchLegend, transparent: true, toneMapped: false })), 0, 0, 0.035, false, rocker)

  for (const side of [-1, 1]) {
    for (let row = 0; row < 2; row++) for (let slot = 0; slot < 12; slot++) {
      add('side-vent', new Mesh(new RoundedBoxGeometry(0.022, h * 0.18, 0.06, 3, 0.01), mat('#101a21', 0.1, 0.8)), side * w / 2, h * (0.40 + row * 0.29), (slot - 5.5) * d * 0.058 - 0.07)
    }
    for (const z of [-d * 0.32, d * 0.32]) {
      add('rubber-foot', new Mesh(new CylinderGeometry(0.15, 0.16, 0.14, 24), mat('#151d23')), side * w * 0.34, 0.075, z)
      const screw = add('case-screw', new Mesh(new CylinderGeometry(0.035, 0.035, 0.007, 20), mat('#46525c', 0.75, 0.32)), side * w * 0.34, h - 0.002, z)
      box('screw-slot', 0.04, 0.003, 0.006, screw.position.x, h + 0.002, z, '#18232b')
      box('screw-slot', 0.006, 0.003, 0.04, screw.position.x, h + 0.002, z, '#18232b')
    }
  }
}
