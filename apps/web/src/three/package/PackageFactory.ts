import { BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, SphereGeometry, Vector2, Vector3, type BufferGeometry } from 'three'
import { MM_TO_WORLD, type PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { createFormedLeadGeometry } from './LeadGeometry'
import { createPackageBodyMaterial, createPackageMaterials } from './PackageMaterials'
import { createPackageMarking, shortPackageCode } from './PackageMarking'
import { updatePackageAppearance } from './PackageAppearance'
import { axialCoatingGeometry, ledShellGeometry, roundedPackageBox, segmentGlyphGeometry } from './PackageShapes'

export function addPackageModel(group: Group, module: CircuitModule, part: PartDefinition) {
  const pkg = part.package, mm = MM_TO_WORLD
  const [w, h, d] = [pkg.bodyMm.x * mm, pkg.bodyMm.y * mm, pkg.bodyMm.z * mm]
  const bottom = pkg.standoffMm * mm, top = bottom + h
  // Structure terminals and Display share the factory but retain their existing
  // appearance. Tone only the requested component body/coating families.
  const subduedBody = ['dip', 'axial', 'radial-led', 'radial-capacitor', 'to92', 'switch', 'buzzer'].includes(pkg.family)
  const { metal, plastic, ink, dark } = createPackageMaterials(subduedBody)
  const usedMaterials = new Set<MeshStandardMaterial>()
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
  const marking = (text: string, width = w * .7, depth = d * .6, x = 0, z = 0, y = top + .0012, name = 'package-marking', surface?: BufferGeometry) => {
    const label = createPackageMarking(text, width, depth, name, surface); label.position.set(x, y, z); group.add(label); return label
  }
  const roundedBox = (name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, material = plastic) => {
    const radius = Math.min(.008, sy * .15)
    const object = mesh(name, roundedPackageBox(sx, sy, sz, radius), material); object.rotation.x = -Math.PI / 2; object.position.set(x, y - sy / 2 + radius / 2, z); return object
  }

  if (pkg.family === 'dip') {
    // The notch is cut into the body outline, on the pin-1 (-X) end.
    const shape = new Shape(), radius = Math.min(d * .22, .055), bevel = Math.min(.012, h * .09), x = w / 2 - bevel, z = d / 2 - bevel
    shape.moveTo(-x, -z); shape.lineTo(x, -z); shape.lineTo(x, z); shape.lineTo(-x, z)
    shape.lineTo(-x, radius); shape.absarc(-x, 0, radius, Math.PI / 2, -Math.PI / 2, true); shape.lineTo(-x, -z)
    const body = mesh('package-body', new ExtrudeGeometry(shape, { depth: Math.max(h - 2 * bevel, .001), bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 16 })); body.rotation.x = -Math.PI / 2; body.position.y = bottom + bevel
    const notch = mesh('package-notch', new CircleGeometry(radius * .83, 20, -Math.PI / 2, Math.PI), dark, group, false); notch.rotation.x = -Math.PI / 2; notch.position.set(-w / 2, bottom + bevel / 2, 0)
    cylinder('package-pin1-marker', Math.min(.018, d * .08), .0015, -w / 2 + .07, top + .001, d * .29, ink).userData.selectionSurface = false
    marking(shortPackageCode(part.shortName ?? pkg.marking ?? part.name), w * .56, d * .38)
  } else if (pkg.family === 'radial-led') {
    const red = createPackageBodyMaterial({ color: '#ba3434', roughness: .47, metalness: 0, transparent: false, opacity: 1, emissiveIntensity: 0 })
    const radius = Math.min(w, d) / 2
    const shell = mesh('package-body', ledShellGeometry(radius, h, .4 * mm), red); shell.position.y = bottom; shell.userData.ledLens = true
    const cathode = pkg.pins.find(pin => pin.name === 'K' || pin.id === 'K')
    const sign = cathode && cathode.positionMm.x < 0 ? -1 : 1
    box('package-cathode-marker', .32 * mm, .3 * mm, radius * .8, sign * radius, bottom + .25 * mm, 0, ink, group, false)
  } else if (pkg.family === 'axial') {
    const resistor = pkg.visualVariant === 'resistor' || part.function === 'resistor'
    const coating = createPackageBodyMaterial({ color: resistor ? '#cbb181' : '#ae613a', roughness: resistor ? .73 : .28, metalness: .02 })
    const radius = Math.min(h, d) / 2, body = mesh('package-body', axialCoatingGeometry(w, radius, resistor), coating)
    body.rotation.z = Math.PI / 2; body.position.y = bottom + h / 2
    if (resistor) {
      for (const [i, fraction] of [-.28, -.15, -.02, .11, .3].entries()) {
        const paint = new MeshStandardMaterial({ color: '#1c1d20', roughness: .62 })
        const band = mesh(`package-resistor-band-${i}`, new CylinderGeometry(radius * .95 + .0002, radius * .95 + .0002, w * .055, 32, 1, true), paint)
        band.rotation.z = Math.PI / 2; band.position.set(fraction * w, bottom + h / 2, 0); band.userData.selectionSurface = false; band.userData.resistorBand = true
      }
      // The readout is kept in metadata even without a DOM, and only painted on
      // the coating when a value cannot be encoded exactly with five bands.
      const readout = marking('', w * .8, d * .6, 0, 0, top + .0012, 'package-property-marking'); readout.userData.onlyWithoutBands = true
    } else {
      const side = Math.sign(pkg.pins.find(pin => pin.id === 'K' || pin.name === 'K')?.positionMm.x ?? 1)
      const stripe = mesh('package-cathode-marker', new CylinderGeometry(radius + .0002, radius + .0002, w * .12, 32, 1, true), dark)
      stripe.rotation.z = Math.PI / 2; stripe.position.set(side * .29 * w, bottom + h / 2, 0); stripe.userData.selectionSurface = false
    }
  } else if (pkg.family === 'radial-capacitor') {
    const coating = createPackageBodyMaterial({ color: pkg.polarized ? '#253d57' : '#cba05e', roughness: .5, metalness: .03 })
    if (pkg.polarized) {
      const radius = Math.min(w, d) / 2
      const sleeve = mesh('package-body', new LatheGeometry([[0, 0], [.91, 0], [.99, .02], [1, .06], [1, .91], [.96, .96], [.91, 1]].map(([r, y]) => new Vector2(r! * radius, y! * h)), 32), coating); sleeve.position.y = bottom
      cylinder('package-capacitor-lid', radius * .92, .15 * mm, 0, top + .05 * mm, 0, metal).userData.selectionSurface = false
      box('package-polarity-stripe', .65 * mm, h * .83, .08 * mm, radius * .38, bottom + h * .5, radius * .94, ink, group, false)
      for (let i = 0; i < 3; i++) box(`package-negative-sign-${i}`, .4 * mm, .07 * mm, .08 * mm, radius * .38, bottom + h * (.28 + i * .22), radius * .95 + .04 * mm, dark, group, false)
      const ventSize = radius * 1.1
      for (const turn of [-1, 1]) { const vent = box(`package-capacitor-vent-${turn}`, ventSize, .001, .0009, 0, top + .14 * mm, 0, dark, group, false); vent.rotation.y = turn * Math.PI / 4 }
      const values = marking('', w * .72, h * .2, 0, 0, bottom + h * .64, 'package-property-marking', new CylinderGeometry(radius + .0006, radius + .0006, h * .2, 32, 1, true, -Math.PI * .45, Math.PI * .45)); values.rotation.x = 0
    } else {
      const disc = new Group(); disc.name = 'package-ceramic-disc'; group.add(disc)
      const body = mesh('package-body', new SphereGeometry(1, 20, 14), coating, disc); body.scale.set(w / 2, h / 2, d / 2); body.position.y = bottom + h / 2
      const values = marking('', w * .84, h * .23, 0, d / 2 + .0008, bottom + h * .6, 'package-property-marking'); values.rotation.x = 0
    }
  } else if (pkg.family === 'to92') {
    const shape = new Shape()
    shape.moveTo(-w / 2, -d * .25); shape.lineTo(w / 2, -d * .25); shape.lineTo(w / 2, 0)
    shape.quadraticCurveTo(w / 2, d / 2, 0, d / 2); shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, 0); shape.closePath()
    const body = mesh('package-body', new ExtrudeGeometry(shape, { depth: h - .008, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 3, steps: 1, curveSegments: 16 })); body.rotation.x = -Math.PI / 2; body.position.y = bottom + .004
    const face = mesh('package-flat-face', new PlaneGeometry(w * .93, h * .92), plastic, group, false); face.position.set(0, bottom + h * .5, d * .25 + .0042)
    marking(part.shortName ?? pkg.marking ?? part.name)
  } else if (pkg.family === 'switch') {
    const dip = pkg.visualVariant === 'dip-switch' || part.function === 'dip-switch'
    const controls = (part.internalConnections ?? []).flatMap(connection => connection.when ? [connection.when] : [])
    const controlOn = (i: number) => { const control = controls[i]; return !!control && (module.properties?.[control.property] ?? part.editor.defaults[control.property]) === control.equals }
    const coating = createPackageBodyMaterial({ color: dip ? '#a52e28' : '#272c30', roughness: .62 })
    roundedBox('package-body', w, h, d, 0, bottom + h / 2, 0, coating)
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
    const face = new MeshStandardMaterial({ color: '#101317', roughness: .62 })
    roundedBox('package-body', w, h, d, 0, bottom + h / 2, 0)
    roundedBox('package-display-face', w * .95, .004, d * .94, 0, top + .002, 0, face)
    const digits = pkg.digits ?? 1, digitWidth = w * .83 / digits, digitHeight = d * .72, stroke = Math.min(digitWidth * .12, digitHeight * .055)
    for (let digit = 0; digit < digits; digit++) {
      const cx = (digit - (digits - 1) / 2) * w * .9 / digits, half = digitWidth * .32, quarter = digitHeight * .25
      for (const [name, x, z, sx, sz] of [
        ['a', 0, -digitHeight / 2, half * 2, stroke], ['b', half, -quarter, stroke, quarter * 1.65], ['c', half, quarter, stroke, quarter * 1.65],
        ['d', 0, digitHeight / 2, half * 2, stroke], ['e', -half, quarter, stroke, quarter * 1.65], ['f', -half, -quarter, stroke, quarter * 1.65], ['g', 0, 0, half * 2, stroke], ['DP', half * 1.5, digitHeight / 2, stroke, stroke],
      ] as const) {
        const segmentMaterial = new MeshStandardMaterial({ color: '#482526', roughness: .67, emissiveIntensity: 0 })
        const glyph = mesh(`package-digit-${digit}-${name}`, segmentGlyphGeometry(sx, sz, .0015), segmentMaterial, group, false); glyph.rotation.x = -Math.PI / 2; glyph.position.set(cx + x, top + .0052, z)
        glyph.userData.segment = `${digit}.${name}`; glyph.userData.ignorePick = true
      }
    }
  } else if (pkg.family === 'buzzer') {
    const radius = Math.min(w, d) / 2
    const shell = mesh('package-body', new LatheGeometry([[0, 0], [.94, 0], [1, .04], [1, .12], [.97, .17], [.97, .91], [.93, .98], [.84, 1], [0, 1]].map(([r, y]) => new Vector2(r! * radius, y! * h)), 32)); shell.position.y = bottom
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
    marking(part.shortName ?? pkg.marking ?? part.name)
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
    if (pkg.family !== 'terminal') {
      // End the lead inside the body so no body/metal join is exposed.
      const direction = shoulder.clone().sub(knee).normalize(); shoulder.addScaledVector(direction, width * .6)
      if (pkg.family === 'dip') knee.y = shoulder.y
      const surface = mesh('lead-metal', createFormedLeadGeometry([anchor, knee, shoulder], width, pkg.family === 'dip'), metal, lead)
      surface.userData.continuousLead = true
    }
    const target = mesh(`package-pin-target-${pin.id}`, pickGeometry, pickMaterial, group, false); target.position.copy(anchor).y += tipRadius * .5
    target.userData = { ...endpoint, pinTarget: true }
    const highlight = mesh(`package-pin-highlight-${pin.id}`, highlightGeometry, highlightMaterial, group, false); highlight.position.copy(anchor).y += .028; highlight.visible = false; highlight.userData = { pinHighlight: true, pinId: pin.id, ignorePick: true }
  }
  updatePackageAppearance(group, module, part)
  group.userData.packageId = pkg.id
  group.userData.definitionId = part.id
  for (const material of [metal, plastic, ink, dark]) if (!usedMaterials.has(material)) material.dispose()
}
