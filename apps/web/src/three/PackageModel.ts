import { BoxGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, SphereGeometry, Vector3, type BufferGeometry } from 'three'
import { getPartForType, MM_TO_WORLD, type PartDefinition } from '../data/partCatalog'
import type { CircuitModule } from '../types/circuit'

/** Package-local origin is the lead contact plane, in the canonical footprint frame. */
export function packagePinAnchor(type: string, pinId: string): Vector3 | null {
  const pin = getPartForType(type)?.package.pins.find(pin => pin.id === pinId)
  return pin ? new Vector3(pin.positionMm.x, pin.positionMm.y, pin.positionMm.z).multiplyScalar(MM_TO_WORLD) : null
}

/** Show only the requested pin. Hit volumes themselves never enter the render pass. */
export function setPackagePinHighlight(group: Group, pinId: string | null) {
  for (const child of group.children) if (child.userData.pinHighlight) child.visible = child.userData.pinId === pinId
}

export interface PackageSimulationVisual { status?: string; ledOn?: boolean; segments?: string[] }
/** Receives compiler/simulator state; no electrical decisions are made in the renderer. */
export function applyPackageSimulation(group: Group, state: PackageSimulationVisual | null) {
  group.userData.simulationStatus = state?.status ?? 'UNKNOWN'
  group.traverse(object => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return
    if (object.userData.ledLens) {
      object.material.emissive.set(state?.ledOn === true ? '#ed281e' : '#000000')
      object.material.emissiveIntensity = state?.ledOn === true ? .8 : 0
    }
    if (object.userData.segment) {
      const on = state?.segments?.includes(object.userData.segment) === true
      object.material.emissive.set(on ? '#ef332c' : '#000000'); object.material.emissiveIntensity = on ? 1 : 0
    }
  })
}

/** Every resource is model-owned; only siblings in this model share materials/geometries. */
export function addPackageModel(group: Group, module: CircuitModule, part: PartDefinition) {
  const pkg = part.package, mm = MM_TO_WORLD
  const [w, h, d] = [pkg.bodyMm.x * mm, pkg.bodyMm.y * mm, pkg.bodyMm.z * mm]
  const bottom = pkg.standoffMm * mm, top = bottom + h
  const metal = new MeshStandardMaterial({ color: '#c9d0d5', roughness: .24, metalness: .88 })
  const plastic = new MeshStandardMaterial({ color: '#24292e', roughness: .66, metalness: .02 })
  const ink = new MeshStandardMaterial({ color: '#c9ccc1', roughness: .88 })
  const dark = new MeshStandardMaterial({ color: '#080b0e', roughness: .8 })
  const geometries = new Map<string, BufferGeometry>(), usedMaterials = new Set<MeshStandardMaterial>()
  const mesh = (name: string, geometry: BufferGeometry, material = plastic, parent: Group = group, surface = true) => {
    usedMaterials.add(material)
    const object = new Mesh(geometry, material); object.name = name; object.userData.selectionSurface = surface; parent.add(object); return object
  }
  const box = (name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, material = plastic, parent: Group = group, surface = true) => {
    const object = mesh(name, new BoxGeometry(sx, sy, sz), material, parent, surface); object.position.set(x, y, z); return object
  }
  const cylinder = (name: string, radius: number, height: number, x: number, y: number, z: number, material = plastic, parent: Group = group) => {
    const object = mesh(name, new CylinderGeometry(radius, radius, height, 24), material, parent); object.position.set(x, y, z); return object
  }
  const segment = (parent: Group, a: Vector3, b: Vector3, width: number, flat = false) => {
    const distance = a.distanceTo(b), key = `${flat ? 'flat' : 'round'}:${width}:${distance}`
    let geometry = geometries.get(key)
    if (!geometry) { geometry = flat ? new BoxGeometry(width, distance, width * .45) : new CylinderGeometry(width / 2, width / 2, distance, 8); geometries.set(key, geometry) }
    const object = mesh('lead-metal', geometry, metal, parent); object.position.copy(a).add(b).multiplyScalar(.5); object.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize())
  }
  const marking = (text: string, width = w * .7, depth = d * .6, x = 0, z = 0, y = top + .0007) => {
    if (typeof document === 'undefined') return
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256
    const context = canvas.getContext('2d'); if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#d3d4c8'; context.textAlign = 'center'; context.textBaseline = 'middle'
    const lines = text.split('\n'); context.font = `${lines.length > 1 ? 56 : 68}px monospace`
    lines.forEach((line, i) => context.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * 70, 480))
    const material = new MeshStandardMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })
    const label = mesh('package-marking', new PlaneGeometry(width, depth), material, group, false); label.rotation.x = -Math.PI / 2; label.position.set(x, y, z); label.userData.ignorePick = true
  }

  if (pkg.family === 'dip') {
    // The notch is cut into the body outline, on the pin-1 (-X) end.
    const shape = new Shape(), radius = Math.min(d * .22, .055), bevel = Math.min(.012, h * .09)
    shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.lineTo(w / 2, d / 2); shape.lineTo(-w / 2, d / 2)
    shape.lineTo(-w / 2, radius); shape.absarc(-w / 2, 0, radius, Math.PI / 2, -Math.PI / 2, true); shape.lineTo(-w / 2, -d / 2)
    const body = mesh('package-body', new ExtrudeGeometry(shape, { depth: Math.max(h - 2 * bevel, .001), bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 10 })); body.rotation.x = -Math.PI / 2; body.position.y = bottom + bevel
    const notch = mesh('package-notch', new CircleGeometry(radius * .83, 20, -Math.PI / 2, Math.PI), dark, group, false); notch.rotation.x = -Math.PI / 2; notch.position.set(-w / 2, bottom + bevel / 2, 0)
    cylinder('package-pin1-marker', Math.min(.018, d * .08), .0015, -w / 2 + .07, top + .001, d * .29, ink).userData.selectionSurface = false
    marking(`${part.manufacturer}\n${part.partNumber}`)
  } else if (pkg.family === 'radial-led') {
    const red = new MeshStandardMaterial({ color: '#c93230', roughness: .25, metalness: .02, transparent: true, opacity: .9 })
    const radius = Math.min(w, d) / 2
    const base = cylinder('package-body', radius, Math.max(h - radius, .001), 0, bottom + Math.max(h - radius, .001) / 2, 0, red); base.userData.ledLens = true
    const dome = mesh('package-led-dome', new SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), red); dome.position.y = top - radius; dome.userData.ledLens = true
    cylinder('package-led-flange', radius * 1.08, .4 * mm, 0, bottom + .2 * mm, 0, red).userData.ledLens = true
    const cathode = pkg.pins.find(pin => pin.name === 'K' || pin.id === 'K')
    const sign = cathode && cathode.positionMm.x < 0 ? -1 : 1
    box('package-cathode-marker', .4 * mm, .45 * mm, radius * 1.2, sign * radius, bottom + .45 * mm, 0, ink, group, false)
  } else if (pkg.family === 'axial') {
    const resistor = pkg.visualVariant === 'resistor' || part.function === 'resistor' || part.simulation.model === 'resistor'
    const coating = new MeshStandardMaterial({ color: resistor ? '#cbb181' : '#ae613a', roughness: resistor ? .73 : .28, metalness: .02 })
    const body = cylinder('package-body', Math.min(h, d) / 2, w, 0, bottom + h / 2, 0, coating); body.rotation.z = Math.PI / 2
    const cathodeSide = Math.sign(pkg.pins.find(pin => pin.id === 'K' || pin.name === 'K')?.positionMm.x ?? 1)
    const palette = ['#1c1d20', '#704725', '#bb3728', '#e27724', '#e9c83e', '#387149', '#315b97', '#824986', '#8c9197', '#e4e3da']
    const requestedOhms = Number(module.properties?.resistance_ohm ?? part.simulation.defaultOhms ?? 1000)
    const ohms = Number.isFinite(requestedOhms) && requestedOhms > 0 ? requestedOhms : 1000
    let exponent = Math.floor(Math.log10(ohms)) - 1, significant = Math.round(ohms / Math.pow(10, exponent))
    if (significant === 100) { significant = 10; exponent++ }
    const multiplier = exponent === -1 ? '#bea047' : exponent === -2 ? '#a8aeb5' : palette[exponent]
    const bands: readonly (readonly [number, string])[] = resistor ? multiplier ? [[-.29, palette[Math.floor(significant / 10)]!], [-.12, palette[significant % 10]!], [.05, multiplier], [.31, '#bea047']] : [] : [[.3 * cathodeSide, '#23272a']]
    if (resistor && !multiplier) marking(`${ohms} Ω`, w * .8, d * .7)
    for (const [i, [fraction, color]] of bands.entries()) {
      const paint = new MeshStandardMaterial({ color, roughness: .62, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      const band = cylinder(resistor ? `package-resistor-band-${i}` : 'package-cathode-marker', Math.min(h, d) / 2 + .0002, w * (resistor ? .065 : .13), fraction * w, bottom + h / 2, 0, paint)
      band.rotation.z = Math.PI / 2; band.userData.selectionSurface = false; if (resistor) band.userData.resistorBand = true
    }
  } else if (pkg.family === 'radial-capacitor') {
    const coating = new MeshStandardMaterial({ color: pkg.polarized ? '#253d57' : '#cba05e', roughness: .5, metalness: .03 })
    if (pkg.polarized) {
      const radius = Math.min(w, d) / 2
      cylinder('package-body', radius, h, 0, bottom + h / 2, 0, coating)
      cylinder('package-capacitor-lid', radius * .92, .15 * mm, 0, top + .05 * mm, 0, metal).userData.selectionSurface = false
      box('package-polarity-stripe', .65 * mm, h * .83, .08 * mm, radius * .38, bottom + h * .5, radius * .94, ink, group, false)
      for (let i = 0; i < 3; i++) box(`package-negative-sign-${i}`, .4 * mm, .07 * mm, .08 * mm, radius * .38, bottom + h * (.28 + i * .22), radius * .95 + .04 * mm, dark, group, false)
      marking(pkg.marking ?? part.partNumber, w * .68, d * .6)
    } else {
      const disc = new Group(); disc.name = 'package-ceramic-disc'; group.add(disc)
      const body = mesh('package-body', new SphereGeometry(1, 20, 14), coating, disc); body.scale.set(w / 2, h / 2, d / 2); body.position.y = bottom + h / 2
      marking(pkg.marking ?? '104', w * .7, d * .7)
    }
  } else if (pkg.family === 'to92') {
    const shape = new Shape()
    shape.moveTo(-w / 2, -d * .25); shape.lineTo(w / 2, -d * .25); shape.lineTo(w / 2, 0)
    shape.quadraticCurveTo(w / 2, d / 2, 0, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, 0); shape.closePath()
    const body = mesh('package-body', new ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1, curveSegments: 12 })); body.rotation.x = -Math.PI / 2; body.position.y = bottom
    const face = mesh('package-flat-face', new PlaneGeometry(w * .93, h * .92), plastic, group, false); face.position.set(0, bottom + h * .5, d * .25 + .0002)
    marking(pkg.marking ?? part.partNumber)
  } else if (pkg.family === 'switch') {
    const dip = pkg.visualVariant === 'dip-switch' || part.function === 'dip-switch'
    const controls = (part.internalConnections ?? []).flatMap(connection => connection.when ? [connection.when] : [])
    const controlOn = (i: number) => { const control = controls[i]; return !!control && (module.properties?.[control.property] ?? part.editor.defaults[control.property]) === control.equals }
    const coating = new MeshStandardMaterial({ color: dip ? '#a52e28' : '#272c30', roughness: .62 })
    box('package-body', w, h, d, 0, bottom + h / 2, 0, coating)
    if (dip) {
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * w * .21
        box(`package-switch-slot-${i}`, w * .15, .002, d * .62, x, top + .001, 0, dark, group, false)
        const on = controlOn(i)
        const slider = box(`package-switch-actuator-${i}`, w * .105, .7 * mm, d * .27, x, top + .35 * mm, (on ? -1 : 1) * d * .15, ink)
        slider.userData.switchActuator = true
      }
      marking('1  2  3  4', w * .85, d * .17, 0, d * .4, top + .002)
    } else if (pkg.visualVariant === 'toggle') {
      const actuator = pkg.actuator
      const bushingHeight = (actuator?.bushingHeightMm ?? 5.59) * mm, bushingRadius = (actuator?.bushingDiameterMm ?? 6) * mm / 2
      box('package-switch-cover', w * .97, .35 * mm, d * .97, 0, top + .175 * mm, 0, metal)
      cylinder('package-switch-bushing', bushingRadius, bushingHeight, 0, top + bushingHeight / 2, 0, metal)
      for (let i = 0; i < 6; i++) cylinder(`package-bushing-thread-${i}`, bushingRadius * 1.04, .15 * mm, 0, top + bushingHeight * (.1 + i * .14), 0, metal).userData.selectionSurface = false
      const lever = new Group(); lever.name = 'package-switch-lever'; lever.position.y = top + bushingHeight - .6 * mm; lever.userData.switchActuator = true; group.add(lever)
      const state = module.properties?.state ?? part.editor.defaults.state
      lever.rotation.z = (state === true ? -1 : 1) * (actuator?.throwDegrees ?? 25) * Math.PI / 180
      const leverHeight = (actuator?.heightMm ?? 9.4) * mm, leverRadius = (actuator?.diameterMm ?? 2.54) * mm / 2
      cylinder('package-toggle-shaft', leverRadius, leverHeight, 0, leverHeight / 2, 0, metal, lever)
      const end = mesh('package-toggle-tip', new SphereGeometry(leverRadius, 12, 8), metal, lever); end.position.y = leverHeight
    } else {
      box('package-switch-cover', w * .95, .25 * mm, d * .95, 0, top + .125 * mm, 0, metal)
      const plunger = cylinder('package-switch-actuator', Math.min(w, d) * .24, h * .35, 0, top + h * (controlOn(0) ? .08 : .18), 0, dark)
      plunger.userData.switchActuator = true
    }
  } else if (pkg.family === 'seven-segment') {
    const face = new MeshStandardMaterial({ color: '#e9e8df', roughness: .5 })
    box('package-body', w, h, d, 0, bottom + h / 2, 0)
    box('package-display-face', w * .97, .003, d * .96, 0, top + .0015, 0, face)
    const digits = pkg.digits ?? 1, digitWidth = w * .83 / digits, digitHeight = d * .72, stroke = Math.min(digitWidth * .12, digitHeight * .055)
    for (let digit = 0; digit < digits; digit++) {
      const cx = (digit - (digits - 1) / 2) * w * .9 / digits, half = digitWidth * .32, quarter = digitHeight * .25
      for (const [name, x, z, sx, sz] of [
        ['a', 0, -digitHeight / 2, half * 2, stroke], ['b', half, -quarter, stroke, quarter * 1.65], ['c', half, quarter, stroke, quarter * 1.65],
        ['d', 0, digitHeight / 2, half * 2, stroke], ['e', -half, quarter, stroke, quarter * 1.65], ['f', -half, -quarter, stroke, quarter * 1.65], ['g', 0, 0, half * 2, stroke], ['DP', half * 1.5, digitHeight / 2, stroke, stroke],
      ] as const) {
        const segmentMaterial = new MeshStandardMaterial({ color: '#692d2c', roughness: .6 })
        const glyph = box(`package-digit-${digit}-${name}`, sx, .0015, sz, cx + x, top + .004, z, segmentMaterial, group, false)
        glyph.userData.segment = `${digit}.${name}`; glyph.userData.ignorePick = true
      }
    }
  } else if (pkg.family === 'buzzer') {
    cylinder('package-body', Math.min(w, d) / 2, h, 0, bottom + h / 2, 0)
    cylinder('package-buzzer-opening', Math.min(w, d) * .12, .001, 0, top + .001, 0, dark).userData.selectionSurface = false
    marking('+', w * .25, d * .25, -w * .27)
  } else if (pkg.family === 'terminal') {
    const housing = new MeshStandardMaterial({ color: '#929ea7', roughness: .57, metalness: .12 })
    box('package-body', w, h, d, 0, bottom + h / 2, 0, housing)
    box('package-source-display', w * .7, .012, d * .32, 0, top + .006, -d * .17, dark)
    marking('DC SOURCE\n+    −', w * .7, d * .32, 0, d * .27)
  } else {
    // Package-specific shapes below extend this factory without changing pin ownership.
    box('package-body', w, h, d, 0, bottom + h / 2, 0)
    marking(part.partNumber)
  }

  const tipRadius = Math.min(.04, Math.max(pkg.leadDiameterMm * mm * 1.7, .025))
  const pickMaterial = new MeshStandardMaterial({ visible: false, transparent: true, opacity: 0, depthWrite: false })
  const pickGeometry = new SphereGeometry(tipRadius, 10, 8)
  const highlightMaterial = new MeshStandardMaterial({ color: '#eac76d', emissive: '#886521', emissiveIntensity: .3, transparent: true, opacity: .85, depthWrite: false })
  const highlightGeometry = new CylinderGeometry(tipRadius * .9, tipRadius * .9, .005, 16)
  for (const pin of pkg.pins) {
    const anchor = new Vector3(pin.positionMm.x * mm, pin.positionMm.y * mm, pin.positionMm.z * mm)
    const endpoint = { kind: 'port', id: module.id, endpoint: `${module.id}.${pin.id}`, pinId: pin.id, pinName: pin.name, pinNumber: pin.number, electricalRole: pin.role }
    // A real lead can be the first ray hit before its forgiving target. Both
    // surfaces must resolve to the same canonical pin, including when mounted.
    const lead = new Group(); lead.name = `package-lead-${pin.id}`; lead.userData = { ...endpoint, physicalLead: true }; group.add(lead)
    const knee = anchor.clone(); knee.y += Math.max(bottom * .55, .02)
    const shoulder = pin.bodyPositionMm ? new Vector3(pin.bodyPositionMm.x * mm, pin.bodyPositionMm.y * mm, pin.bodyPositionMm.z * mm) : new Vector3(anchor.x, bottom + h * .22, Math.sign(anchor.z || 1) * d * .46)
    if (pkg.family === 'radial-led') shoulder.set(anchor.x, bottom + .015, anchor.z)
    if (pkg.family === 'axial' && !pin.bodyPositionMm) { knee.y = bottom + h / 2; shoulder.set(Math.sign(anchor.x) * w / 2, knee.y, 0) }
    if (['radial-capacitor', 'buzzer'].includes(pkg.family) && !pin.bodyPositionMm) shoulder.set(anchor.x * .65, bottom + h * .1, anchor.z * .65)
    if (pkg.family === 'to92' && !pin.bodyPositionMm) shoulder.set(anchor.x * .65, bottom + h * .08, anchor.z * .65)
    if (pkg.family === 'terminal') {
      const color = pin.id === 'PLUS' ? '#b52424' : '#15191d'
      const insulator = new MeshStandardMaterial({ color, roughness: .45 })
      const terminal = cylinder(`package-terminal-${pin.id}`, 2.2 * mm, 2 * mm, anchor.x, anchor.y, anchor.z - 1.2 * mm, insulator)
      terminal.rotation.x = Math.PI / 2
      const sleeve = cylinder(`package-terminal-metal-${pin.id}`, 1.25 * mm, .5 * mm, anchor.x, anchor.y, anchor.z, metal, lead)
      sleeve.rotation.x = Math.PI / 2
      const socket = cylinder(`package-terminal-socket-${pin.id}`, .75 * mm, .55 * mm, anchor.x, anchor.y, anchor.z + .2 * mm, dark, lead)
      socket.rotation.x = Math.PI / 2; socket.userData.selectionSurface = false
    }
    const width = pkg.leadDiameterMm * mm
    if (pkg.family !== 'terminal') { segment(lead, anchor, knee, width, pkg.family === 'dip'); segment(lead, knee, shoulder, width, pkg.family === 'dip') }
    const target = mesh(`package-pin-target-${pin.id}`, pickGeometry, pickMaterial, group, false); target.position.copy(anchor).y += tipRadius * .5
    target.userData = { ...endpoint, pinTarget: true }
    const highlight = mesh(`package-pin-highlight-${pin.id}`, highlightGeometry, highlightMaterial, group, false); highlight.position.copy(anchor).y += .028; highlight.visible = false; highlight.userData = { pinHighlight: true, pinId: pin.id, ignorePick: true }
  }
  group.userData.packageId = pkg.id
  group.userData.definitionId = part.id
  for (const material of [metal, plastic, ink, dark]) if (!usedMaterials.has(material)) material.dispose()
}
