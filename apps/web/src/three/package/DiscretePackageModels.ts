import { BoxGeometry, CylinderGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Raycaster, Vector2, Vector3, type BufferGeometry } from 'three'
import { MM_TO_WORLD as mm, type PartDefinition } from '../../data/partCatalog'
import type { CircuitModule } from '../../types/circuit'
import { createCeramicMaterial, createDiodeMaterial, createElectrolyticSleeveMaterial, createLedLensMaterial, createResistorMaterial, createZenerGlassMaterial } from './PackageMaterials'
import { createPackageMarking } from './PackageMarking'
import { axialContourBandGeometry, sealedAxialGeometry, sealedAxialProfile, sealedCeramicGeometry, sealedElectrolyticGeometry, sealedElectrolyticProfile, sealedLedShellGeometry } from './SealedPackageShapes'

/** Opt-in catalog solids. Historical descriptors keep the original factory path. */
export function addSealedDiscreteModel(group: Group, module: CircuitModule, part: PartDefinition): boolean {
  const pkg = part.package, shape = pkg.shape
  if (!shape || !['resistor', 'diode', 'zener', 'ceramic', 'electrolytic', 'led'].includes(shape.family)) return false
  const [w, h, d] = [pkg.bodyMm.x * mm, pkg.bodyMm.y * mm, pkg.bodyMm.z * mm]
  const bottom = pkg.standoffMm * mm, centerY = bottom + h / 2, top = bottom + h
  let metal: MeshStandardMaterial | undefined, dark: MeshStandardMaterial | undefined
  const metalMaterial = () => metal ??= new MeshStandardMaterial({ color: '#d8dce0', roughness: .3, metalness: .85, envMapIntensity: .85 })
  const darkMaterial = () => dark ??= new MeshStandardMaterial({ color: '#17191b', roughness: .68, metalness: 0 })
  const mesh = (name: string, geometry: BufferGeometry, material: MeshStandardMaterial, x = 0, y = centerY, z = 0, parent = group, surface = true) => {
    const object = new Mesh(geometry, material); object.name = name; object.position.set(x, y, z)
    object.userData.selectionSurface = surface; object.userData.sealedPackage = true
    object.castShadow = surface; object.receiveShadow = true; parent.add(object); return object
  }
  const marking = (surface: BufferGeometry, y = centerY, parent = group) => {
    const label = createPackageMarking('', w * .7, h * .16, 'package-property-marking', surface)
    label.position.y = y; label.rotation.x = 0; label.userData.sealedPackage = true
    label.castShadow = false; label.receiveShadow = false; parent.add(label); return label
  }
  const cathodeSide = Math.sign(pkg.pins.find(pin => pin.id === 'K' || pin.name === 'K')?.positionMm.x ?? 1)

  if (shape.family === 'resistor' || shape.family === 'diode' || shape.family === 'zener') {
    const kind = shape.family, radius = Math.min(h, d) / 2, leadRadius = pkg.leadDiameterMm * mm / 2
    const material = kind === 'resistor' ? createResistorMaterial() : kind === 'zener' ? createZenerGlassMaterial(pkg.bodyMm.y) : createDiodeMaterial(true)
    const bevel = (shape.bevelMm ?? .15) * mm
    const body = mesh('package-body', sealedAxialGeometry(w, radius, kind, leadRadius, bevel), material); body.rotation.z = Math.PI / 2
    const profile = sealedAxialProfile(w, radius, kind, leadRadius, bevel)
    if (kind === 'resistor') {
      for (const [i, fraction] of [-.28, -.15, -.02, .11, .32].entries()) {
        const paint = new MeshStandardMaterial({ color: '#1c1d20', roughness: .52, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
        const band = mesh(`package-resistor-band-${i}`, axialContourBandGeometry(profile, -fraction * w, w * .055, .003 * mm), paint, 0, centerY, 0, group, false)
        band.rotation.z = Math.PI / 2; band.userData.resistorBand = true; band.castShadow = false
      }
      const readout = createPackageMarking('', w * .8, d * .6, 'package-property-marking'); readout.position.y = top + .01 * mm; readout.userData.onlyWithoutBands = true; group.add(readout)
    } else {
      const paint = new MeshStandardMaterial({ color: kind === 'zener' ? '#303236' : '#c8cbd0', roughness: .35, metalness: kind === 'zener' ? 0 : .15, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      const stripeCenter = cathodeSide * (w / 2 - .27 * mm - .55 * mm / 2)
      const stripe = mesh('package-cathode-marker', axialContourBandGeometry(profile, -stripeCenter, .55 * mm, .004 * mm), paint, 0, centerY, 0, group, false)
      stripe.rotation.z = Math.PI / 2; stripe.castShadow = false
      if (kind === 'zener') {
        const slug = mesh('package-zener-slug', new CylinderGeometry(radius * .35, radius * .35, w * .4, 24), darkMaterial(), 0, centerY, 0, group, false); slug.rotation.z = Math.PI / 2
        for (const side of [-1, 1]) {
          const seal = mesh(`package-zener-seal-${side}`, new CylinderGeometry(leadRadius * 1.3, leadRadius * 1.3, .16 * mm, 24), metalMaterial(), side * (w / 2 - .11 * mm), centerY, 0, group, false)
          seal.rotation.z = Math.PI / 2
        }
      }
    }
  } else if (shape.family === 'ceramic') {
    const disc = new Group(); disc.name = 'package-ceramic-disc'; group.add(disc)
    const exits = shape.leadExits, pitch = exits.length > 1 ? Math.abs(exits[1]!.positionMm.x - exits[0]!.positionMm.x) * mm : pkg.footprint.pitchMm * mm
    const body = mesh('package-body', sealedCeramicGeometry(w, h, d, pitch), createCeramicMaterial(true), 0, centerY, 0, disc)
    // Text vertices follow the actual convex front triangles, keeping ink on the coating.
    const surface = new PlaneGeometry(w * .7, h * .17, 16, 4), p = surface.getAttribute('position')
    const localBody = new Mesh(body.geometry, body.material)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i) + h * .06
      const hit = new Raycaster(new Vector3(x, y, d * 2), new Vector3(0, 0, -1)).intersectObject(localBody)[0]
      p.setXYZ(i, x, y, (hit?.point.z ?? d / 2) + .012 * mm)
    }
    surface.computeVertexNormals()
    const label = marking(surface, centerY, disc); (label.material as MeshStandardMaterial).color.set('#393027')
  } else if (shape.family === 'electrolytic') {
    const radius = Math.min(w, d) / 2
    mesh('package-body', sealedElectrolyticGeometry(radius, h, mm), createElectrolyticSleeveMaterial('#3B6EA5'))
    const lidTop = top - .1 * mm
    mesh('package-capacitor-lid', new CylinderGeometry(radius - .3 * mm, radius - .3 * mm, .12 * mm, 64), metalMaterial(), 0, lidTop - .06 * mm, 0, group, false)
    const ventMaterial = new MeshStandardMaterial({ color: '#626a70', roughness: .42, metalness: .55 })
    for (const turn of [-1, 1]) {
      const vent = mesh(`package-capacitor-vent-${turn}`, new BoxGeometry(radius * 1.35, .008 * mm, .045 * mm), ventMaterial, 0, lidTop + .004 * mm, 0, group, false)
      vent.rotation.y = turn * Math.PI / 4; vent.castShadow = false
    }
    mesh('package-capacitor-bung', new CylinderGeometry(radius * .805, radius * .805, .18 * mm, 48), darkMaterial(), 0, bottom + .09 * mm, 0, group, false)
    const minus = pkg.pins.find(pin => pin.id === 'MINUS' || pin.name === 'MINUS' || pin.id === 'K'), minusAngle = minus ? Math.atan2(minus.positionMm.x, minus.positionMm.z) : 0
    const polarity = new Group(); polarity.name = 'package-polarity-group'; polarity.rotation.y = minusAngle; group.add(polarity)
    const profile = sealedElectrolyticProfile(radius, h, mm).filter(p => p.x >= radius - .17 * mm && p.y >= -h / 2 + .3 * mm && p.y <= h / 2 - .2 * mm)
    const stripeMaterial = new MeshStandardMaterial({ color: '#e4e7db', roughness: .5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    mesh('package-polarity-stripe', new LatheGeometry(profile.map(p => new Vector2(p.x + .004 * mm, p.y)), 12, -.65 * mm / radius / 2, .65 * mm / radius), stripeMaterial, 0, centerY, 0, polarity, false).castShadow = false
    for (let i = 0; i < 3; i++) mesh(`package-negative-sign-${i}`, new PlaneGeometry(.35 * mm, .07 * mm), darkMaterial(), 0, bottom + h * (.28 + i * .22), radius + .01 * mm, polarity, false).castShadow = false
    const markingAngle = minusAngle + Math.PI, markingHeight = h * .22
    marking(new CylinderGeometry(radius + .008 * mm, radius + .008 * mm, markingHeight, 40, 1, true, markingAngle - Math.PI * .4, Math.PI * .8), bottom + h * .62)
  } else if (shape.family === 'led') {
    const lensRadius = (shape.lensDiameterMm ?? 5) * mm / 2, flangeRadius = (shape.flangeDiameterMm ?? pkg.bodyMm.x) * mm / 2
    const raw = module.properties?.color ?? part.editor.defaults.color, color = typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#ff0000'
    const body = mesh('package-body', sealedLedShellGeometry(lensRadius, flangeRadius, h, (shape.flangeHeightMm ?? 1) * mm, (shape.domeRadiusMm ?? 2.49) * mm, mm), createLedLensMaterial(color, shape.lensDiameterMm ?? 5))
    body.userData.ledLens = true; group.userData.ledColor = color
    const cathodeId = pkg.pins.find(pin => pin.id === 'K' || pin.name === 'K')?.id
    const cathode = shape.leadExits.find(exit => exit.pinId === cathodeId) ?? shape.leadExits[1]!
    const anode = shape.leadExits.find(exit => exit.pinId !== cathode.pinId)!
    const embed = shape.embeddedDepthMm * mm, frameTop = bottom + h * .42
    const post = (name: string, exit: typeof cathode, postTop: number, width: number) => {
      const start = centerY + exit.positionMm.y * mm - embed
      return mesh(name, new BoxGeometry(width, postTop - start, .5 * mm), metalMaterial(), exit.positionMm.x * mm, (postTop + start) / 2, exit.positionMm.z * mm, group, false)
    }
    post('package-led-anode-post', anode, frameTop + .45 * mm, .34 * mm)
    post('package-led-cathode-stem', cathode, frameTop + .1 * mm, .5 * mm)
    const cup = [[0, 0], [.32, 0], [.65, .4], [.69, .5], [.54, .5], [.42, .27], [0, .27]].map(([r, y]) => new Vector2(r! * mm, y! * mm))
    mesh('package-led-cathode-anvil', new LatheGeometry(cup, 32), metalMaterial(), cathode.positionMm.x * mm, frameTop, cathode.positionMm.z * mm, group, false)
    mesh('package-led-die', new BoxGeometry(.16 * mm, .08 * mm, .16 * mm), darkMaterial(), cathode.positionMm.x * mm, frameTop + .31 * mm, cathode.positionMm.z * mm, group, false)
    mesh('package-cathode-marker', new BoxGeometry(.035 * mm, .45 * mm, .6 * mm), darkMaterial(), cathodeSide * (flangeRadius - .035 * mm), bottom + .45 * mm, 0, group, false).castShadow = false
  }
  group.userData.packageShape = { version: shape.version, family: shape.family }
  return true
}
