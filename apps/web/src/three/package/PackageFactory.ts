import { BoxGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Shape, SphereGeometry, Vector2, Vector3, type BufferGeometry } from 'three'
import { MM_TO_WORLD, type PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { createFormedLeadGeometry } from './LeadGeometry'
import { createCeramicMaterial, createDiodeMaterial, createElectrolyticSleeveMaterial, createLedLensMaterial, createPackageBodyMaterial, createPackageMaterials, createResistorMaterial, createZenerGlassMaterial } from './PackageMaterials'
import { createPackageMarking, shortPackageCode } from './PackageMarking'
import { updatePackageAppearance } from './PackageAppearance'
import { axialCoatingGeometry, ceramicDiscGeometry, electrolyticSleeveGeometry, ledShellGeometry, roundedPackageBox, segmentGlyphGeometry } from './PackageShapes'
import { registerEditablePackageLeads } from './PackageLeads'

export function addPackageModel(group: Group, module: CircuitModule, part: PartDefinition) {
  const pkg = part.package, mm = MM_TO_WORLD
  const [w, h, d] = [pkg.bodyMm.x * mm, pkg.bodyMm.y * mm, pkg.bodyMm.z * mm]
  const bottom = pkg.standoffMm * mm, top = bottom + h
  // Structure terminals and Display share the factory but retain their existing
  // appearance. Tone only the requested component body/coating families.
  const subduedBody = ['dip', 'to92', 'switch', 'buzzer'].includes(pkg.family)
  const { metal, plastic, ink, dark } = createPackageMaterials(subduedBody)
  const usedMaterials = new Set<MeshStandardMaterial>()
  const mesh = (name: string, geometry: BufferGeometry, material: MeshStandardMaterial = plastic, parent: Group = group, surface = true) => {
    usedMaterials.add(material)
    const object = new Mesh(geometry, material); object.name = name; object.userData.selectionSurface = surface
    if (!name.includes('target') && !name.includes('highlight') && !name.includes('marking')) {
      object.castShadow = true
      object.receiveShadow = true
    }
    parent.add(object); return object
  }
  const box = (name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, material: MeshStandardMaterial = plastic, parent: Group = group, surface = true) => {
    const object = mesh(name, new BoxGeometry(sx, sy, sz), material, parent, surface); object.position.set(x, y, z); return object
  }
  const cylinder = (name: string, radius: number, height: number, x: number, y: number, z: number, material: MeshStandardMaterial = plastic, parent: Group = group) => {
    const object = mesh(name, new CylinderGeometry(radius, radius, height, 24), material, parent); object.position.set(x, y, z); return object
  }
  const marking = (text: string, width = w * .7, depth = d * .6, x = 0, z = 0, y = top + .0012, name = 'package-marking', surface?: BufferGeometry) => {
    const label = createPackageMarking(text, width, depth, name, surface); label.position.set(x, y, z); label.castShadow = false; label.receiveShadow = false; group.add(label); return label
  }
  const roundedBox = (name: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, material: MeshStandardMaterial = plastic) => {
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
    const rawColor = part.editorType === 'GENERIC_LED' ? (module.properties?.color ?? part.editor.defaults.color) : '#ba3434'
    const color = typeof rawColor === 'string' && rawColor.length === 7 && /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '#ba3434'
    const lensMaterial = createLedLensMaterial(color)
    const radius = Math.min(w, d) / 2
    const shell = mesh('package-body', ledShellGeometry(radius, h, .4 * mm), lensMaterial)
    shell.position.y = bottom; shell.userData.ledLens = true

    // Internal minimalist leadframe: Anode post & Cathode anvil with die
    const cathode = pkg.pins.find(pin => pin.name === 'K' || pin.id === 'K')
    const sign = cathode && cathode.positionMm.x < 0 ? -1 : 1

    const anodePost = mesh('package-led-anode-post', new CylinderGeometry(.11 * mm, .13 * mm, h * .44, 16), metal, group, false)
    anodePost.position.set(-sign * radius * .42, bottom + h * .25, 0)

    const cathodeStem = mesh('package-led-cathode-stem', new CylinderGeometry(.14 * mm, .16 * mm, h * .36, 16), metal, group, false)
    cathodeStem.position.set(sign * radius * .42, bottom + h * .21, 0)
    const cathodeAnvil = mesh('package-led-cathode-anvil', new BoxGeometry(.48 * mm, .38 * mm, .32 * mm), metal, group, false)
    cathodeAnvil.position.set(sign * radius * .3, bottom + h * .42, 0); cathodeAnvil.rotation.z = -sign * .22
    const die = mesh('package-led-die', new BoxGeometry(.12 * mm, .12 * mm, .12 * mm), dark, group, false)
    die.position.set(sign * radius * .3, bottom + h * .44, 0)

    box('package-cathode-marker', .32 * mm, .3 * mm, radius * .8, sign * (radius - .16 * mm), bottom + .25 * mm, 0, ink, group, false)
  } else if (pkg.family === 'axial') {
    const resistor = pkg.visualVariant === 'resistor' || part.function === 'resistor'
    const zener = pkg.visualVariant === 'zener' || part.function === 'zener-diode'
    const radius = Math.min(h, d) / 2
    if (resistor) {
      const coating = createResistorMaterial()
      const body = mesh('package-body', axialCoatingGeometry(w, radius, true), coating)
      body.rotation.z = Math.PI / 2; body.position.y = bottom + h / 2
      for (const [i, fraction] of [-.28, -.15, -.02, .11, .3].entries()) {
        const paint = new MeshStandardMaterial({ color: '#1c1d20', roughness: .58, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
        const bandRadius = radius * .96 + .0001
        const band = mesh(`package-resistor-band-${i}`, new CylinderGeometry(bandRadius, bandRadius, w * .055, 48, 1, true), paint)
        band.rotation.z = Math.PI / 2; band.position.set(fraction * w, bottom + h / 2, 0); band.userData.selectionSurface = false; band.userData.resistorBand = true
        band.castShadow = false
      }
      const readout = marking('', w * .8, d * .6, 0, 0, top + .0012, 'package-property-marking'); readout.userData.onlyWithoutBands = true
    } else if (zener) {
      const glass = createZenerGlassMaterial()
      const body = mesh('package-body', axialCoatingGeometry(w, radius, false), glass)
      body.rotation.z = Math.PI / 2; body.position.y = bottom + h / 2; body.renderOrder = 2

      const slugMat = new MeshStandardMaterial({ color: '#c44f2b', roughness: .45, metalness: .05 })
      const slug = mesh('package-zener-slug', new CylinderGeometry(radius * .72, radius * .72, w * .62, 32), slugMat)
      slug.rotation.z = Math.PI / 2; slug.position.set(0, bottom + h / 2, 0); slug.userData.selectionSurface = false

      const side = Math.sign(pkg.pins.find(pin => pin.id === 'K' || pin.name === 'K')?.positionMm.x ?? 1)
      const cathodeBandMat = new MeshStandardMaterial({ color: '#14171a', roughness: .5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      const stripe = mesh('package-cathode-marker', new CylinderGeometry(radius * .73, radius * .73, w * .13, 32, 1, true), cathodeBandMat)
      stripe.rotation.z = Math.PI / 2; stripe.position.set(side * .22 * w, bottom + h / 2, 0); stripe.userData.selectionSurface = false; stripe.castShadow = false

      for (const s of [-1, 1]) {
        const seal = mesh(`package-zener-seal-${s}`, new CylinderGeometry(radius * .48, radius * .48, .18 * mm, 24), metal)
        seal.rotation.z = Math.PI / 2; seal.position.set(s * w * .4, bottom + h / 2, 0); seal.userData.selectionSurface = false
      }
    } else {
      const coating = createDiodeMaterial()
      const body = mesh('package-body', axialCoatingGeometry(w, radius, false), coating)
      body.rotation.z = Math.PI / 2; body.position.y = bottom + h / 2

      const side = Math.sign(pkg.pins.find(pin => pin.id === 'K' || pin.name === 'K')?.positionMm.x ?? 1)
      const bandMat = new MeshStandardMaterial({ color: '#c8cbd0', roughness: .35, metalness: .15, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      const stripe = mesh('package-cathode-marker', new CylinderGeometry(radius + .0001, radius + .0001, w * .12, 48, 1, true), bandMat)
      stripe.rotation.z = Math.PI / 2; stripe.position.set(side * .29 * w, bottom + h / 2, 0); stripe.userData.selectionSurface = false; stripe.castShadow = false
    }
  } else if (pkg.family === 'radial-capacitor') {
    if (pkg.polarized) {
      const radius = Math.min(w, d) / 2
      const sleeveMat = createElectrolyticSleeveMaterial('#2b6cb0')
      const sleeve = mesh('package-body', electrolyticSleeveGeometry(radius, h), sleeveMat); sleeve.position.y = bottom

      const lid = cylinder('package-capacitor-lid', radius * .88, .12 * mm, 0, top - .02 * mm, 0, metal)
      lid.userData.selectionSurface = false

      const ventSize = radius * .92
      const ventMat = new MeshStandardMaterial({ color: '#7a828a', roughness: .4, metalness: .5 })
      for (const turn of [-1, 1]) {
        const vent = box(`package-capacitor-vent-${turn}`, ventSize, .0008, .0008, 0, top - .015 * mm, 0, ventMat, group, false)
        vent.rotation.y = turn * Math.PI / 4; vent.castShadow = false
      }

      cylinder('package-capacitor-bung', radius * .82, .1 * mm, 0, bottom + .05 * mm, 0, dark).userData.selectionSurface = false

      // Polarity stripe oriented towards MINUS pin
      const minusPin = pkg.pins.find(pin => pin.id === 'MINUS' || pin.name === 'MINUS' || pin.id === 'B' || pin.id === 'K' || pin.name === 'K')
      const minusAngle = minusPin ? Math.atan2(minusPin.positionMm.x, minusPin.positionMm.z) : 0

      const polarityGroup = new Group(); polarityGroup.name = 'package-polarity-group'; polarityGroup.rotation.y = minusAngle; group.add(polarityGroup)
      const stripeWidth = .65 * mm
      const stripeMat = new MeshStandardMaterial({ color: '#e4e7eb', roughness: .5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      const stripe = mesh('package-polarity-stripe', new CylinderGeometry(radius + .0001, radius + .0001, h * .82, 16, 1, true, -stripeWidth / (2 * radius), stripeWidth / radius), stripeMat, polarityGroup, false)
      stripe.position.y = bottom + h * .5; stripe.castShadow = false

      const signMat = new MeshStandardMaterial({ color: '#1c2d42', roughness: .6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      for (let i = 0; i < 3; i++) {
        const signMesh = mesh(`package-negative-sign-${i}`, new PlaneGeometry(.35 * mm, .07 * mm), signMat, polarityGroup, false)
        signMesh.position.set(0, bottom + h * (.28 + i * .22), radius + .0002); signMesh.castShadow = false
      }

      const markingAngle = minusAngle + Math.PI
      const values = marking('', w * .75, h * .22, 0, 0, bottom + h * .62, 'package-property-marking', new CylinderGeometry(radius + .0005, radius + .0005, h * .22, 32, 1, true, markingAngle - Math.PI * .4, Math.PI * .8))
      values.rotation.x = 0; values.castShadow = false
    } else {
      const disc = new Group(); disc.name = 'package-ceramic-disc'; group.add(disc)
      const coating = createCeramicMaterial()
      const body = mesh('package-body', ceramicDiscGeometry(w, h, d), coating, disc)
      body.position.y = bottom + h / 2
      const values = marking('', w * .84, h * .23, 0, d / 2 + .0008, bottom + h * .6, 'package-property-marking'); values.rotation.x = 0
      values.castShadow = false
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

  const bodyObjects = group.children.slice()
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
      surface.userData.leadBaseline = [anchor, knee, shoulder].map(point => point.toArray())
    }
    const target = mesh(`package-pin-target-${pin.id}`, pickGeometry, pickMaterial, group, false); target.position.copy(anchor).y += tipRadius * .5
    target.userData = { ...endpoint, pinTarget: true }
    const highlight = mesh(`package-pin-highlight-${pin.id}`, highlightGeometry, highlightMaterial, group, false); highlight.position.copy(anchor).y += .028; highlight.visible = false; highlight.userData = { pinHighlight: true, pinId: pin.id, ignorePick: true }
  }
  registerEditablePackageLeads(group, part, bodyObjects)
  updatePackageAppearance(group, module, part)
  group.userData.packageId = pkg.id
  group.userData.definitionId = part.id
  for (const material of [metal, plastic, ink, dark]) if (!usedMaterials.has(material)) material.dispose()
}
