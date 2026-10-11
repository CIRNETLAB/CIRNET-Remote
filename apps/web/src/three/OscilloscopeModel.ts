import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry, type BufferGeometry, type Material, type Object3D } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CH1_COLOR, CH2_COLOR, SCOPE_LAYOUT, drawScopeArtwork, scopeLegendsArtwork, scopeScreenArtwork, type ScopeArtwork } from './OscilloscopeArtwork'
import { createInstrumentChassis, mountInstrumentChassis } from './InstrumentChassis'
import { loadInstrumentLogo } from './InstrumentArtwork'
import { SCOPE_THEME } from '../data/instrumentVisuals'

export const OSCILLOSCOPE_SIZE = [6, 3.8, 2.8] as const
export const OSCILLOSCOPE_KNOBS = ['time_div_knob', 'horizontal_position', 'trigger_level', 'ch1_volts_div', 'ch1_position', 'ch2_volts_div', 'ch2_position'] as const

function canvasTexture(artwork: ScopeArtwork): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas'); canvas.width = artwork.width; canvas.height = artwork.height
  const ctx = canvas.getContext('2d'); if (!ctx) return null
  drawScopeArtwork(ctx, artwork)
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
  return texture
}

// Same factory is used by workspace and GLB/glTF export. Origin: center of the
// device footprint, with stands touching Y=0; Y up, front +Z, unit scale.
// Dimensions are editor world units.
// Named pivot groups are interaction-ready; acquisition/control behavior is a
// separate contract. They deliberately do not masquerade as supply controls.
export function addOscilloscopeModel(group: Group) {
  group.name = 'net_circuit_oscilloscope_2ch'
  const chassis = createInstrumentChassis()
  const standard = (name: string, color: string, metalness = 0, roughness = 0.5) => {
    const material = new MeshStandardMaterial({ color, metalness, roughness }); material.name = name; return material
  }
  const shell = standard('scope_silver_powdercoat', '#a1aab4', 0.32, 0.54)
  const bezel = standard('scope_bezel', SCOPE_THEME.bezel, 0.18, 0.52)
  const panel = standard('scope_control_panels', SCOPE_THEME.panel, 0.12, 0.57)
  const rubber = standard('scope_rubber', '#080f16', 0, 0.7)
  const grip = standard('scope_knob_grip', '#35434e', 0.18, 0.4)
  const silver = standard('scope_bnc_metal', '#b7c4cf', 0.78, 0.26)
  const ivory = standard('scope_index', '#e1e8ec', 0.05, 0.45)
  const yellow = standard('scope_ch1', CH1_COLOR, 0.15, 0.38)
  const cyan = standard('scope_ch2', CH2_COLOR, 0.15, 0.38)
  const gold = standard('scope_bnc_contact', '#cba669', 0.7, 0.35)
  const add = (name: string, geometry: BufferGeometry, material: Material, x: number, y: number, z: number, parent: Object3D = chassis) => {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh
  }
  const rounded = (name: string, size: [number, number, number], pos: [number, number, number], radius: number, material: Material, selection = false, segments = selection ? 2 : 1) => {
    // Keep silhouette-bearing case edges smoother; small panels/buttons need
    // only one or two bevel subdivisions, keeping the uncompressed GLB lightweight.
    const mesh = add(name, new RoundedBoxGeometry(...size, segments, radius), material, ...pos); mesh.userData.selectionSurface = selection; return mesh
  }
  // Lightweight curved edges, opaque metal housing, inset front panels and feet.
  rounded('enclosure', [6, 3.43, 2.1], [0, 2.035, 0], 0.085, shell, true)
  rounded('front_bezel', [5.96, 3.40, 0.12], [0, 2.035, 1.015], 0.065, bezel, true)
  const layout = SCOPE_LAYOUT
  rounded('screen_recess', [layout.recess.w, layout.recess.h, 0.055], [layout.recess.x, layout.recess.y, 1.09], 0.045, rubber)
  for (const p of layout.panels) {
    rounded(`${p.name}_rim`, [p.w + 0.025, p.h + 0.025, 0.019], [p.x, p.y, 1.08], 0.033, silver)
    rounded(p.name, [p.w, p.h, 0.025], [p.x, p.y, 1.085], 0.03, panel)
  }
  rounded('connector_panel', [3.80, 0.63, 0.025], [-0.98, 0.65, 1.085], 0.035, panel)
  // Merge vents and screw heads into two meshes; no per-slot draw call overhead.
  const vents: BufferGeometry[] = [], screws: BufferGeometry[] = []
  for (const x of [-3.002, 3.002]) for (const y of [1.1, 2.2]) for (let i = 0; i < 13; i++) {
    vents.push(new BoxGeometry(0.004, 0.6, 0.04).translate(x, y, -0.70 + i * 0.10))
  }
  for (const x of [-2.78, 2.78]) for (const z of [-0.80, 0.80]) screws.push(new CylinderGeometry(0.045, 0.045, 0.006, 12).translate(x, 3.751, z))
  add('case_vents', mergeGeometries(vents)!, rubber, 0, 0, 0); vents.forEach((g) => g.dispose())
  add('case_fasteners', mergeGeometries(screws)!, silver, 0, 0, 0); screws.forEach((g) => g.dispose())

  // Replace screen.material.map with a CanvasTexture to draw live samples later.
  // Reuse/update that texture rather than allocating one on every acquisition.
  const screenTexture = canvasTexture(scopeScreenArtwork())
  const screenMaterial = new MeshBasicMaterial({ map: screenTexture, color: screenTexture ? '#ffffff' : SCOPE_THEME.screen, toneMapped: false }); screenMaterial.name = 'scope_screen'
  const screen = add('screen', new PlaneGeometry(layout.screen.w, layout.screen.h), screenMaterial, layout.screen.x, layout.screen.y, 1.122)
  screen.userData = { role: 'waveform-screen', channels: 2, waveform: 'illustrative-preview', textureSize: [1024, 704] }
  const legendsMaterial = new MeshBasicMaterial({ map: canvasTexture(scopeLegendsArtwork()), transparent: true, depthWrite: false, toneMapped: false }); legendsMaterial.name = 'scope_legends'
  const legends = add('front_legends', new PlaneGeometry(6, 3.8), legendsMaterial, 0, 1.9, 1.166)
  legends.userData.ignorePick = true
  // No-texture server/export geometry retains the material slot but not a white
  // opaque decal. The export script supplies this slot with the recipe's PNG.
  if (!legendsMaterial.map) legendsMaterial.opacity = 0
  const logoMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }); logoMaterial.name = 'scope_brand'
  const owl = add('brand_owl', new PlaneGeometry(layout.owl.size, layout.owl.size), logoMaterial, layout.owl.x, layout.owl.y, 1.12); owl.userData.asset = 'favicon.svg'; owl.userData.ignorePick = true
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    logoMaterial.map = loadInstrumentLogo(group, new URL('../assets/icons/favicon.svg', import.meta.url).href)
  } else logoMaterial.opacity = 0

  const knob = (name: string, x: number, y: number, radius: number, accent: Material = silver) => {
    add(`${name}_collar`, new TorusGeometry(radius + 0.014, 0.011, 6, 32), accent, x, y, 1.12)
    const pivot = new Group(); pivot.name = name; pivot.position.set(x, y, 1.17)
    pivot.userData = { interaction: 'knob', rotationAxis: 'Z', pivot: 'center' }; chassis.add(pivot)
    const body = add(`${name}_body`, new CylinderGeometry(radius, radius, 0.14, 24), rubber, 0, 0, 0, pivot); body.rotation.x = Math.PI / 2
    const flutes = Array.from({ length: 24 }, (_, i) => {
      const angle = i * Math.PI / 12
      return new BoxGeometry(0.015, 0.018, 0.11).rotateZ(-angle).translate(Math.sin(angle) * radius, Math.cos(angle) * radius, 0)
    })
    add(`${name}_flutes`, mergeGeometries(flutes)!, grip, 0, 0, 0, pivot); flutes.forEach((g) => g.dispose())
    const cap = add(`${name}_cap`, new CylinderGeometry(radius * 0.88, radius * 0.88, 0.012, 24), bezel, 0, 0, 0.077, pivot); cap.rotation.x = Math.PI / 2
    add(`${name}_index`, new BoxGeometry(0.014, radius * 0.53, 0.004), ivory, 0, radius * 0.46, 0.086, pivot)
  }
  const accents = (color: string) => color === CH1_COLOR ? yellow : color === CH2_COLOR ? cyan : silver
  for (const control of layout.knobs) knob(control.name, control.x, control.y, control.r, accents(control.accent))
  const button = (name: string, x: number, y: number, width: number, height: number, material: Material = grip) => {
    rounded(`${name}_socket`, [width + 0.035, height + 0.035, 0.032], [x, y, 1.108], 0.018, rubber)
    const mesh = rounded(name, [width, height, 0.056], [x, y, 1.137], 0.016, material, false, 2)
    mesh.userData = { interaction: 'button', pressAxis: 'Z' }
  }
  const green = standard('scope_run_green', SCOPE_THEME.run, 0.1, 0.4)
  for (const control of layout.buttons) button(control.name, control.x, control.y, control.w, control.h, control.color === CH2_COLOR ? cyan : control.name === 'run_stop_button' ? green : control.name === 'power_button' ? panel : grip)
  const ledMaterial = standard('scope_power_indicator', '#31e96d', 0.05, 0.4)
  const led = rounded('power_led', [0.047, 0.047, 0.015], [layout.led.x, layout.led.y, 1.12], 0.008, ledMaterial)
  led.userData = { role: 'status-indicator', visualOnly: true }
  for (const connector of layout.bncs) {
    const { name, x, y, channel } = connector, accent = accents(connector.accent)
    const port = new Group(); port.name = name; port.position.set(x, y, 1.12)
    port.userData = { interaction: 'connector', ...(channel === null ? { role: 'trigger-output' } : { channel }), connector: 'BNC', visualOnly: true }; chassis.add(port)
    add(`${name}_ring`, new TorusGeometry(0.185, 0.025, 8, 32), accent, 0, 0, 0, port)
    const collar = add(`${name}_barrel`, new CylinderGeometry(0.15, 0.15, 0.17, 24, 1, true), silver, 0, 0, 0.07, port); collar.rotation.x = Math.PI / 2
    add(`${name}_rim`, new TorusGeometry(0.14, 0.02, 8, 32), silver, 0, 0, 0.16, port)
    const insulator = add(`${name}_insulator`, new CylinderGeometry(0.119, 0.119, 0.04, 24), ivory, 0, 0, 0.129, port); insulator.rotation.x = Math.PI / 2
    add(`${name}_contact`, new TorusGeometry(0.041, 0.011, 6, 20), gold, 0, 0, 0.157, port)
    const bore = add(`${name}_bore`, new CylinderGeometry(0.03, 0.03, 0.004, 16), rubber, 0, 0, 0.151, port); bore.rotation.x = Math.PI / 2
    // Two bayonet lugs, merged into one geometry, give the BNC a real silhouette.
    const lugs = [-1, 1].map((s) => new BoxGeometry(0.035, 0.055, 0.04).translate(s * 0.15, 0, 0.07))
    add(`${name}_bayonet`, mergeGeometries(lugs)!, silver, 0, 0, 0, port); lugs.forEach((g) => g.dispose())
  }
  mountInstrumentChassis(group, chassis, grip, rubber, 'feet')
}
