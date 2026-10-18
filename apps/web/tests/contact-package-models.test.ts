import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Group, Material, Mesh, MeshStandardMaterial, Raycaster, Vector3, type BufferGeometry } from 'three'
import { getPartForType, MM_TO_WORLD as mm } from '../src/data/partCatalog'
import { packageFeedthroughPoints } from '../src/electrical/rigidPackageLeads'
import { addPackageModel, applyPackageSimulation } from '../src/three/PackageModel'
import { disposeObject } from '../src/three/ComponentModel'
import { countUnsealedEdges, solidContainsPoint } from './helpers/packageSolids'

function model(type: string, properties = {}) {
  const part = getPartForType(type)!, group = new Group()
  assert.ok(part, type)
  addPackageModel(group, { id: 'P1', type, properties }, part); group.updateMatrixWorld(true)
  return { group, part }
}
function mesh(group: Group, name: string) { const object = group.getObjectByName(name); assert.ok(object instanceof Mesh, name); return object }
function near(value: number, expected: number, name: string) { assert.ok(Math.abs(value / mm - expected) < 1e-4, `${name}: ${value / mm} != ${expected} mm`) }
function nonLeadBounds(group: Group) { const bounds = new Box3(); for (const child of group.children) if (!child.userData.physicalLead && !child.userData.pinTarget && !child.userData.pinHighlight) bounds.expandByObject(child); return bounds }

test('B3F total height is 4.3 mm, including cover and plunger, with a 3.4 mm case', () => {
  for (const pressed of [false, true]) {
    const { group, part } = model('PUSH_BUTTON_B3F1000', { pressed })
    try {
      near(new Box3().setFromObject(mesh(group, 'package-body')).max.y - part.package.standoffMm * mm, 3.4, 'case height')
      near(nonLeadBounds(group).max.y - part.package.standoffMm * mm, 4.3 - (pressed ? .25 : 0), 'total top')
      near(new Box3().setFromObject(mesh(group, 'package-switch-actuator')).getSize(new Vector3()).x, 3.5, 'button diameter')
      assert.equal(group.children.filter(child => child.name.startsWith('package-switch-rivet-')).length, 4)
    } finally { disposeObject(group) }
  }
})

test('SS12D10 has a real case slot and a two-position 2.2 mm linear throw', () => {
  const first = model('SLIDE_SWITCH_SS12D10', { state: false }), second = model('SLIDE_SWITCH_SS12D10', { state: true })
  try {
    for (const { group, part } of [first, second]) {
      const body = mesh(group, 'package-body'), shape = part.package.shape!
      assert.equal(shape.family, 'slide-switch'); assert.equal(countUnsealedEdges(body.geometry), 0)
      near(nonLeadBounds(group).max.y - part.package.standoffMm * mm, 10.4, 'case plus knob')
      assert.equal(group.getObjectByName('package-switch-bushing'), undefined)
      const ray = new Raycaster(new Vector3(2.6 * mm, 20 * mm, 0), new Vector3(0, -1, 0))
      const hit = ray.intersectObject(body)[0]!
      assert.ok(hit.point.y < (part.package.standoffMm + 6.4 - .5) * mm, 'slot reveals its interior floor rather than a black overlay')
    }
    near(mesh(first.group, 'package-switch-actuator').position.x, 1.1, 'false selects pin 3')
    near(mesh(second.group, 'package-switch-actuator').position.x, -1.1, 'true selects pin 1')
  } finally { disposeObject(first.group); disposeObject(second.group) }
})

test('DIP4 case has four real 0.7 mm pockets and total raised height 4.4 mm', () => {
  const { group, part } = model('DIP_SWITCH_A6D4100', { position0: true })
  try {
    const body = mesh(group, 'package-body'); assert.equal(countUnsealedEdges(body.geometry), 0)
    near(new Box3().setFromObject(body).max.y - part.package.standoffMm * mm, 3.4, 'DIP case')
    near(nonLeadBounds(group).max.y - part.package.standoffMm * mm, 4.4, 'DIP total')
    const x = -1.5 * 2.54 * mm
    const hit = new Raycaster(new Vector3(x, 20 * mm, 1.7 * mm), new Vector3(0, -1, 0)).intersectObject(body)[0]!
    near(hit.point.y - part.package.standoffMm * mm, 2.7, 'actual pocket floor')
    assert.equal(group.getObjectByName('package-switch-on-marking')?.userData.text, 'ON')
    assert.ok(mesh(group, 'package-switch-actuator-0').position.z < 0)
  } finally { disposeObject(group) }
})

test('photo-refined tactile cover has a rounded steel outline, domed rivets and a rounded lip on the button', () => {
  const { group } = model('PUSH_BUTTON_B3F1000')
  try {
    const cover = mesh(group, 'package-switch-cover'), rivet = mesh(group, 'package-switch-rivet-0'), button = mesh(group, 'package-switch-actuator')
    assert.equal(countUnsealedEdges(cover.geometry), 0)
    assert.ok(group.getObjectByName('package-switch-button-seat'))
    const heights = new Set(Array.from({ length: rivet.geometry.getAttribute('position').count }, (_, i) => Math.round(rivet.geometry.getAttribute('position').getY(i) / mm * 1e4)))
    assert.ok(heights.size > 10, 'rivet head is a curved dome rather than a flat cylinder')
    assert.equal(countUnsealedEdges(button.geometry), 0)
    assert.ok(new Set(Array.from({ length: button.geometry.getAttribute('position').count }, (_, i) => Math.round(button.geometry.getAttribute('position').getY(i) / mm * 1e4))).size > 10, 'button has a rounded shoulder and molded bottom lip')
  } finally { disposeObject(group) }
})

test('photo-refined SS12 steel wrap has open rectangular side windows, a U-shaped lower relief and ribbed knob', () => {
  const { group, part } = model('SLIDE_SWITCH_SS12D10')
  try {
    const body = mesh(group, 'package-body'), knob = mesh(group, 'package-switch-actuator')
    const sideRay = (xMm: number, yMm: number) => new Raycaster(new Vector3(xMm * mm, (part.package.standoffMm + yMm) * mm, 10 * mm), new Vector3(0, 0, -1)).intersectObject(body)[0]?.point.z
    assert.ok((sideRay(-3.75, 2.15) ?? 0) < 3 * mm, 'window must expose the inner case instead of a black rectangle on steel')
    assert.ok((sideRay(0, 1.5) ?? 0) < 3 * mm, 'central U relief is open through the lower sheet edge')
    assert.ok((sideRay(2.15, 4.8) ?? 0) > 3 * mm, 'surrounding cheek remains steel')
    assert.ok(group.getObjectByName('package-switch-inner-case'))
    assert.equal(countUnsealedEdges(knob.geometry), 0)
    const castTop = (x: number) => new Raycaster(new Vector3(knob.position.x + x * mm, 20 * mm, 0), new Vector3(0, -1, 0)).intersectObject(knob)[0]!.point.y
    assert.ok(castTop(0) - castTop(.27) > .06 * mm, 'parallel top ribs are geometric relief')
  } finally { disposeObject(group) }
})

test('DIP legends use their physical aspect ratio and fit readable glyphs inside bounded textures', () => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document')
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement(){
    const context={font:'',clearRect(){},fillText(){},measureText(text:string){const size=Number(this.font.match(/([\d.]+)px/)?.[1]??68);return {width:text.length*size*.56,actualBoundingBoxAscent:size*.72,actualBoundingBoxDescent:0}}}
    return {width:0,height:0,getContext:()=>context}
  }}})
  let group:Group|undefined
  try {
    group=model('DIP_SWITCH_A6D4100').group
    for(const name of ['package-switch-on-marking',...Array.from({length:4},(_,i)=>`package-switch-number-${i}`)]){
      const marking=mesh(group,name),material=marking.material as MeshStandardMaterial,canvas=material.map!.image as {width:number;height:number}
      marking.geometry.computeBoundingBox();const size=marking.geometry.boundingBox!.getSize(new Vector3())
      assert.ok(canvas.width<=1024&&canvas.height<=1024)
      assert.ok(Math.abs(canvas.width/canvas.height-size.x/size.y)<.005,'the texture cannot squeeze the printed number horizontally')
    }
  } finally { if(group)disposeObject(group);if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document') }
})

test('display glyphs retain 1.5 mm stroke, circular DP and fit inside all catalog cases', () => {
  for (const type of ['SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA']) {
    const { group, part } = model(type)
    try {
      const bounds = nonLeadBounds(group), expected = part.package.bodyMm
      for (const [axis, size] of [['x', expected.x], ['y', expected.y], ['z', expected.z]] as const) near(bounds.getSize(new Vector3())[axis], size, `${type} ${axis}`)
      const a = mesh(group, 'package-digit-0-a'), dp = mesh(group, 'package-digit-0-DP')
      near(new Box3().setFromObject(a).getSize(new Vector3()).z, 1.5, 'horizontal stroke')
      const glyphBounds = new Box3()
      for (const child of group.children) if (String(child.userData.segment).startsWith('0.') && child.userData.segment !== '0.DP') glyphBounds.expandByObject(child)
      near(glyphBounds.getSize(new Vector3()).z, 14.22, 'complete glyph height')
      const lower = mesh(group, 'package-digit-0-d')
      near(new Box3().setFromObject(a).getCenter(new Vector3()).x - new Box3().setFromObject(lower).getCenter(new Vector3()).x, (14.22 - 1.5) * Math.tan(8 * Math.PI / 180), 'common 8 degree glyph slant')
      const dpBounds = new Box3().setFromObject(dp).getSize(new Vector3()); near(dpBounds.x, 1.5, 'DP diameter'); near(dpBounds.z, 1.5, 'DP diameter')
      assert.equal(countUnsealedEdges(dp.geometry), 0)
      const pos = dp.geometry.getAttribute('position')
      const radius = Math.max(...Array.from({ length: pos.count }, (_, i) => Math.hypot(pos.getX(i), pos.getZ(i))))
      near(radius, .75, 'DP circle radius')
      const material = a.material as MeshStandardMaterial
      assert.equal(material.color.getHexString(), 'd7d6c8'); assert.equal(material.emissiveIntensity, 0)
      applyPackageSimulation(group, { status: 'SUPPORTED', segments: ['0.a'] })
      assert.equal(material.color.getHexString(), 'ef332c'); assert.ok(material.emissiveIntensity > 0)
      applyPackageSimulation(group, { status: 'UNKNOWN', segments: ['0.a'] })
      assert.equal(material.color.getHexString(), 'd7d6c8'); assert.equal(material.emissiveIntensity, 0)
    } finally { disposeObject(group) }
  }
})

test('contact/display case lids and pocket floors retain independent planar normals', () => {
  for (const type of ['PUSH_BUTTON_B3F1000', 'SLIDE_SWITCH_SS12D10', 'DIP_SWITCH_A6D4100', 'SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA']) {
    const { group } = model(type)
    try {
      const geometry = mesh(group, 'package-body').geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal')
      assert.equal(countUnsealedEdges(geometry), 0, `${type} case is closed`)
      let horizontal = 0
      for (let i = 0; i < positions.count; i += 3) {
        const y = positions.getY(i)
        if (Math.abs(positions.getY(i + 1) - y) > 1e-8 || Math.abs(positions.getY(i + 2) - y) > 1e-8) continue
        horizontal++
        for (let j = 0; j < 3; j++) {
          assert.ok(Math.abs(normals.getX(i + j)) < 1e-7 && Math.abs(normals.getZ(i + j)) < 1e-7, `${type} planar triangle cannot inherit a bevel normal`)
          assert.ok(Math.abs(Math.abs(normals.getY(i + j)) - 1) < 1e-7)
        }
      }
      assert.ok(horizontal > 0)
    } finally { disposeObject(group) }
  }
})

test('new contact/display/buzzer leads have closed metal and the declared hidden body overlap', () => {
  for (const type of ['PUSH_BUTTON_B3F1000', 'SLIDE_SWITCH_SS12D10', 'DIP_SWITCH_A6D4100', 'SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA', 'BUZZER_PS1240']) {
    const { group, part } = model(type)
    try {
      const bodies = group.children.filter(child => child instanceof Mesh && child.userData.selectionSurface && !child.userData.physicalLead) as Mesh[]
      for (const pin of part.package.pins) {
        const lead = group.getObjectByName(`package-lead-${pin.id}`)!, metal = lead.getObjectByName('lead-metal') as Mesh<any, MeshStandardMaterial>
        assert.equal(countUnsealedEdges(metal.geometry, 1e-6), 0, `${type}.${pin.id} metal is sealed`)
        assert.ok(metal.material.metalness >= .8); assert.equal(metal.material.emissive.getHex(), 0)
        const feed = packageFeedthroughPoints(part, pin.id), interior = new Vector3(feed.embeddedStart.x, feed.embeddedStart.y, feed.embeddedStart.z)
        assert.ok(bodies.some(body => solidContainsPoint(body, interior)), `${type}.${pin.id} 0.15 mm embed enters an actual body solid`)
      }
    } finally { disposeObject(group) }
  }
})

test('display evidence updates retain all resources and package disposal releases each owned resource once', () => {
  for (let cycle = 0; cycle < 3; cycle++) for (const type of ['PUSH_BUTTON_B3F1000', 'SLIDE_SWITCH_SS12D10', 'DIP_SWITCH_A6D4100', 'SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA', 'BUZZER_PS1240']) {
    const { group } = model(type), resources = new Set<BufferGeometry | Material>()
    group.traverse(child => {
      if (!(child instanceof Mesh)) return
      resources.add(child.geometry)
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) resources.add(material)
    })
    const before = [...resources], disposed = new Map(before.map(resource => [resource, 0]))
    for (const resource of before) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource)! + 1))
    for (let frame = 0; frame < 20; frame++) applyPackageSimulation(group, { status: frame % 2 ? 'SUPPORTED' : 'UNKNOWN', segments: ['0.a'] })
    const after = new Set<BufferGeometry | Material>()
    group.traverse(child => { if (child instanceof Mesh) { after.add(child.geometry); for (const material of Array.isArray(child.material) ? child.material : [child.material]) after.add(material) } })
    assert.deepEqual([...after], before, `${type} evidence update allocates no resources`)
    disposeObject(group)
    assert.ok([...disposed.values()].every(count => count === 1), `${type} owned resources are released once`)
  }
})

test('buzzer opening is a closed blind cavity 3 mm wide and 1.5 mm deep', () => {
  const { group, part } = model('BUZZER_PS1240')
  try {
    const body = mesh(group, 'package-body'); assert.equal(countUnsealedEdges(body.geometry), 0)
    const top = (part.package.standoffMm + 6.5) * mm
    const hit = new Raycaster(new Vector3(0, top + mm, 0), new Vector3(0, -1, 0)).intersectObject(body)[0]!
    near(top - hit.point.y, 1.5, 'blind opening depth')
    const rim = new Raycaster(new Vector3(1.6 * mm, top + mm, 0), new Vector3(0, -1, 0)).intersectObject(body)[0]!
    near(rim.point.y, top / mm, 'surrounding real lid')
    assert.equal(group.getObjectByName('package-marking'), undefined, 'passive catalog profile has no invented polarity')
  } finally { disposeObject(group) }
})
