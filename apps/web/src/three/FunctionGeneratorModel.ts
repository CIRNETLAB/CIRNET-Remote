import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, type BufferGeometry, type Material, type Object3D } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GENERATOR_CH1, GENERATOR_CH2, GENERATOR_SYNC, GENERATOR_LAYOUT, GENERATOR_THEME, drawInstrumentArtwork, generatorLegendsArtwork, generatorScreenArtwork } from './FunctionGeneratorArtwork'
import { loadInstrumentLogo, type InstrumentArtwork } from './InstrumentArtwork'
import { createInstrumentChassis, mountInstrumentChassis } from './InstrumentChassis'

export const FUNCTION_GENERATOR_SIZE = [6, 3.6, 2.8] as const
function canvasTexture(artwork: InstrumentArtwork) {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas'); canvas.width = artwork.width; canvas.height = artwork.height
  const ctx = canvas.getContext('2d'); if (!ctx) return null
  drawInstrumentArtwork(ctx, artwork)
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4
  return texture
}

// Shared workspace/export factory. Y-up, front +Z, center-bottom origin, unit
// scale. The encoder and keys are interaction-ready geometry; no DDS output or
// physical ratings are implied by the preview artwork or the visual BNCs.
export function addFunctionGeneratorModel(group: Group) {
  group.name = 'net_circuit_function_generator_2ch'
  const chassis = createInstrumentChassis()
  const standard = (name: string, color: string, metalness = 0, roughness = 0.5) => {
    const material = new MeshStandardMaterial({ color, metalness, roughness }); material.name = name; return material
  }
  const light = (name: string, color: string) => { const material = new MeshBasicMaterial({ color, toneMapped: false }); material.name = name; return material }
  const shell = standard('generator_silver_powdercoat', '#a1aab4', 0.32, 0.54)
  const bezel = standard('generator_bezel', GENERATOR_THEME.bezel, 0.18, 0.52)
  const panel = standard('generator_panels', GENERATOR_THEME.panel, 0.12, 0.57)
  const rubber = standard('generator_rubber', '#080f16', 0, 0.7)
  const grip = standard('generator_knob_grip', '#35434e', 0.18, 0.4)
  const silver = standard('generator_bnc_metal', '#b7c4cf', 0.78, 0.26)
  const ivory = standard('generator_insulator', '#e1e8ec', 0.05, 0.45)
  const gold = standard('generator_contact', '#cba669', 0.7, 0.35)
  const yellow = standard('generator_ch1', GENERATOR_CH1, 0.15, 0.38)
  const cyan = standard('generator_ch2', GENERATOR_CH2, 0.15, 0.38)
  const green = standard('generator_sync', GENERATOR_SYNC, 0.15, 0.38)
  const accent = (color: string) => color === GENERATOR_CH1 ? yellow : color === GENERATOR_CH2 ? cyan : green
  const yellowLight = light('generator_ch1_light', GENERATOR_CH1)
  const cyanLight = light('generator_ch2_light', GENERATOR_CH2)
  const greenLight = light('generator_sync_light', GENERATOR_SYNC)
  const ledAccent = (color: string) => color === GENERATOR_CH1 ? yellowLight : color === GENERATOR_CH2 ? cyanLight : greenLight
  const add = (name: string, geometry: BufferGeometry, material: Material, x: number, y: number, z: number, parent: Object3D = chassis) => {
    const mesh = new Mesh(geometry, material); mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh
  }
  const rounded = (name: string, size: [number, number, number], pos: [number, number, number], material: Material, radius = 0.02, selection = false, segments = selection ? 2 : 1) => {
    const mesh = add(name, new RoundedBoxGeometry(...size, segments, radius), material, ...pos); mesh.userData.selectionSurface = selection; return mesh
  }
  const merged = (name: string, geometries: BufferGeometry[], material: Material) => {
    const mesh = add(name, mergeGeometries(geometries)!, material, 0, 0, 0); geometries.forEach(g => g.dispose()); return mesh
  }
  rounded('enclosure', [6, 3.02, 2.1], [0, 1.98, 0], shell, 0.085, true)
  rounded('front_bezel', [5.96, 3.00, 0.12], [0, 1.98, 1.015], bezel, 0.065, true)
  rounded('front_panel', [5.65, 2.66, 0.028], [0, 1.98, 1.085], panel, 0.06)
  const layout = GENERATOR_LAYOUT
  rounded('screen_recess', [layout.recess.w, layout.recess.h, 0.055], [layout.recess.x, layout.recess.y, 1.09], rubber, 0.035)
  rounded('function_panel_rim', [layout.panel.w + 0.025, layout.panel.h + 0.025, 0.019], [layout.panel.x, layout.panel.y, 1.10], grip, 0.035)
  rounded('function_panel', [layout.panel.w, layout.panel.h, 0.022], [layout.panel.x, layout.panel.y, 1.11], panel, 0.03)
  // Merged bumper/vent geometry keeps repeated details from adding draw calls.
  merged('corner_bumpers', [-2.80, 2.80].flatMap(x => [0.72, 3.20].map(y => new RoundedBoxGeometry(0.36, 0.50, 0.14, 1, 0.045).translate(x, y, 1.07))), bezel)
  merged('rear_grips', [-2.15, 2.15].map(x => new RoundedBoxGeometry(0.82, 0.17, 0.40, 1, 0.035).translate(x, 3.42, -0.73)), rubber)
  const vents: BufferGeometry[] = []
  for (const x of [-3.002, 3.002]) for (const y of [1.18, 2.20]) for (let i = 0; i < 12; i++) vents.push(new BoxGeometry(0.004, 0.58, 0.035).translate(x, y, -0.70 + i * 0.11))
  merged('case_vents', vents, rubber)
  merged('case_fasteners', [-2.70, 2.70].flatMap(x => [-0.75, 0.75].map(z => new CylinderGeometry(0.036, 0.036, 0.005, 12).translate(x, 3.491, z))), silver)

  const screenTexture = canvasTexture(generatorScreenArtwork())
  const screenMaterial = new MeshBasicMaterial({ map: screenTexture, color: screenTexture ? '#ffffff' : GENERATOR_THEME.screen, toneMapped: false }); screenMaterial.name = 'generator_screen'
  const screen = add('screen', new PlaneGeometry(layout.screen.w, layout.screen.h), screenMaterial, layout.screen.x, layout.screen.y, 1.122)
  screen.userData = { role: 'waveform-screen', channels: 2, waveform: 'illustrative-preview', textureSize: [1024, 768] }
  const legendsMaterial = new MeshBasicMaterial({ map: canvasTexture(generatorLegendsArtwork()), transparent: true, depthWrite: false, toneMapped: false }); legendsMaterial.name = 'generator_legends'
  const legendsGeo = new PlaneGeometry(6, 3.6)
  const lpos = legendsGeo.getAttribute('position'), luv = legendsGeo.getAttribute('uv')
  for (let i = 0; i < lpos.count; i++) {
    if (lpos.getY(i) < 0) {
      lpos.setY(i, -1.8 + 0.48)
      luv.setY(i, 0.48 / 3.6)
    }
  }
  legendsGeo.computeVertexNormals()
  const legends = add('front_legends', legendsGeo, legendsMaterial, 0, 1.8, 1.189); legends.userData.ignorePick = true
  if (!legendsMaterial.map) legendsMaterial.opacity = 0
  const logoMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }); logoMaterial.name = 'generator_brand'
  const owl = add('brand_owl', new PlaneGeometry(layout.owl.size, layout.owl.size), logoMaterial, layout.owl.x, layout.owl.y, 1.12); owl.userData = { asset: 'favicon.svg', ignorePick: true }
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    logoMaterial.map = loadInstrumentLogo(group, new URL('../assets/icons/favicon.svg', import.meta.url).href)
  } else logoMaterial.opacity = 0

  const button = (name: string, x: number, y: number, width: number, height: number, material: Material = grip, socket: Material = rubber) => {
    rounded(`${name}_socket`, [width + 0.035, height + 0.035, 0.032], [x, y, 1.131], socket, 0.018)
    const mesh = rounded(name, [width, height, 0.056], [x, y, 1.160], material, 0.016, false, 2)
    mesh.userData = { interaction: 'button', pressAxis: 'Z', visualOnly: true }; return mesh
  }
  for (const key of layout.buttons) {
    button(key.name, key.x, key.y, key.w ?? 0.38, key.h ?? 0.24, key.name === 'waveform_button' ? yellow : key.accent ? panel : grip, key.accent ? accent(key.accent) : rubber)
    if (key.accent) rounded(`${key.name}_led`, [0.12, 0.024, 0.008], [key.x, key.y + 0.071, 1.189], ledAccent(key.accent), 0.005)
  }
  merged('soft_key_sockets', layout.softKeys.map(key => new RoundedBoxGeometry(0.300, 0.275, 0.054, 1, 0.018).translate(key.x, key.y, 1.120)), rubber)
  for (const key of layout.softKeys) {
    const mesh = rounded(key.name, [0.265, 0.24, 0.056], [key.x, key.y, 1.160], grip, 0.016, false, 2)
    mesh.userData = { interaction: 'button', pressAxis: 'Z', visualOnly: true }
    rounded(`${key.name}_led`, [0.096, 0.024, 0.008], [key.x, key.y, 1.189], cyanLight, 0.004)
  }
  const arrowButton = (name: string, x: number, y: number, width: number, height: number) => {
    rounded(`${name}_socket`, [width + 0.035, height + 0.035, 0.054], [x, y, 1.120], rubber, 0.018)
    const mesh = rounded(name, [width, height, 0.056], [x, y, 1.160], grip, 0.016, false, 2)
    mesh.userData = { interaction: 'button', pressAxis: 'Z', visualOnly: true }; return mesh
  }
  for (const key of layout.arrows) arrowButton(key.name, key.x, key.y, 0.28, 0.24)
  const { x, y, r } = layout.encoder
  add('encoder_collar', new TorusGeometry(r + 0.018, 0.015, 6, 24), silver, x, y, 1.12)
  const pivot = new Group(); pivot.name = 'encoder_knob'; pivot.position.set(x, y, 1.20)
  pivot.userData = { interaction: 'knob', rotationAxis: 'Z', pivot: 'center', visualOnly: true }; chassis.add(pivot)
  const body = add('encoder_knob_body', new CylinderGeometry(r, r, 0.19, 24), rubber, 0, 0, 0, pivot); body.rotation.x = Math.PI / 2
  const flutes = Array.from({ length: 28 }, (_, i) => { const a = i / 28 * Math.PI * 2; return new BoxGeometry(0.021, 0.025, 0.16).rotateZ(-a).translate(Math.sin(a) * r, Math.cos(a) * r, 0) })
  add('encoder_flutes', mergeGeometries(flutes)!, grip, 0, 0, 0, pivot); flutes.forEach(g => g.dispose())
  const cap = add('encoder_cap', new CylinderGeometry(r * 0.89, r * 0.89, 0.012, 24), bezel, 0, 0, 0.10, pivot); cap.rotation.x = Math.PI / 2
  add('encoder_finger_rim', new TorusGeometry(0.072, 0.007, 6, 20), grip, 0.12, -0.17, 0.110, pivot)
  const recess = add('encoder_finger_recess', new CylinderGeometry(0.068, 0.068, 0.003, 20), rubber, 0.12, -0.17, 0.109, pivot); recess.rotation.x = Math.PI / 2
  const dots = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return new SphereGeometry(0.018, 6, 4).translate(x + Math.cos(a) * 0.44, y + Math.sin(a) * 0.44, 1.135) })
  const arc = merged('encoder_led_arc', dots, cyanLight); arc.userData = { role: 'encoder-indicators', dotCount: 24, rotation: '360-continuous', visualOnly: true }

  const power = new Group(); power.name = 'power_button'; power.position.set(layout.power.x, layout.power.y, 1.17); power.userData = { interaction: 'button', pressAxis: 'Z', visualOnly: true }; chassis.add(power)
  add('power_button_socket', new TorusGeometry(0.178, 0.016, 6, 24), rubber, 0, 0, -0.022, power)
  const powerBody = add('power_button_body', new CylinderGeometry(0.14, 0.14, 0.060, 24), panel, 0, 0, -0.008, power); powerBody.rotation.x = Math.PI / 2
  add('power_button_light', new TorusGeometry(0.159, 0.015, 6, 24), cyanLight, 0, 0, 0.015, power)
  const white = light('generator_power_glyph', '#e1e8ec')
  const glyph = add('power_glyph_arc', new TorusGeometry(0.057, 0.008, 6, 24, Math.PI * 1.65), white, 0, 0, 0.026, power); glyph.rotation.z = Math.PI * 0.675
  add('power_glyph_bar', new BoxGeometry(0.013, 0.070, 0.003), white, 0, 0.038, 0.026, power)
  for (const output of layout.outputs) {
    const { name, x, y, channel } = output
    const port = new Group(); port.name = name; port.position.set(x, y, 1.12); chassis.add(port)
    port.userData = { interaction: 'connector', connector: 'BNC', visualOnly: true, ...(channel === null ? { role: 'sync-counter' } : { channel }) }
    add(`${name}_ring`, new TorusGeometry(0.185, 0.025, 8, 32), accent(output.accent), 0, 0, 0, port)
    const barrel = add(`${name}_barrel`, new CylinderGeometry(0.15, 0.15, 0.17, 24, 1, true), silver, 0, 0, 0.07, port); barrel.rotation.x = Math.PI / 2
    add(`${name}_rim`, new TorusGeometry(0.14, 0.02, 8, 32), silver, 0, 0, 0.16, port)
    const insulator = add(`${name}_insulator`, new CylinderGeometry(0.119, 0.119, 0.04, 24), ivory, 0, 0, 0.129, port); insulator.rotation.x = Math.PI / 2
    add(`${name}_contact`, new TorusGeometry(0.041, 0.011, 6, 20), gold, 0, 0, 0.157, port)
    const bore = add(`${name}_bore`, new CylinderGeometry(0.03, 0.03, 0.004, 16), rubber, 0, 0, 0.151, port); bore.rotation.x = Math.PI / 2
    const lugs = [-1, 1].map(s => new BoxGeometry(0.035, 0.055, 0.04).translate(s * 0.15, 0, 0.07))
    add(`${name}_bayonet`, mergeGeometries(lugs)!, silver, 0, 0, 0, port); lugs.forEach(g => g.dispose())
  }
  mountInstrumentChassis(group, chassis, bezel, rubber, 'bail')
}
