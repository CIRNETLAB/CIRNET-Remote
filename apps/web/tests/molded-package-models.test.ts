import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BufferGeometry, Group, Mesh, Raycaster, Vector3 } from 'three'
import { getPartForType, MM_TO_WORLD, packageLeadCollisionRadiusMm, type PartDefinition } from '../src/data/partCatalog'
import { addPackageModel } from '../src/three/package/PackageFactory'
import { createMoldedDipBody } from '../src/three/package/MoldedPackageModels'
import { packageFeedthrough } from '../src/three/package/PackageFeedthrough'
import { solidContainsPoint } from './helpers/packageSolids'

const mm = MM_TO_WORLD
function fixture(family: 'dip' | 'to92'): PartDefinition {
  const base = structuredClone(getPartForType(family === 'dip' ? 'SN74HC08N' : 'TRANSISTOR_2N3904')!)
  const to92 = family === 'to92'
  base.package = { ...base.package, family, bodyMm: to92 ? { x: 4.6, y: 5.1, z: 3.9 } : { x: 19, y: 3.04, z: 6.35 }, standoffMm: to92 ? 2.5 : 1 }
  if (to92) base.package.pins = ['E', 'B', 'C'].map((id, i) => ({ id, name: id, number: String(i + 1), role: 'passive', positionMm: { x: (i - 1) * 2.54, y: 0, z: 0 } }))
  Object.assign(base.package, { shape: {
    version: 1, family, embeddedDepthMm: .15, bevelMm: to92 ? .1 : .12,
    leadSection: to92 ? { kind: 'rectangular', widthMm: .44, thicknessMm: .42 } : { kind: 'stamped', widthMm: .46, thicknessMm: .28, shoulderWidthMm: 1.4 },
    leadExits: base.package.pins.map(pin => ({ pinId: pin.id, positionMm: to92 ? { x: Number(pin.number) === 1 ? -1.27 : Number(pin.number) === 3 ? 1.27 : 0, y: -2.55, z: 0 } : { x: pin.positionMm.x, y: 0, z: Math.sign(pin.positionMm.z) * 3.175 }, normal: to92 ? { x: 0, y: -1, z: 0 } : { x: 0, y: 0, z: Math.sign(pin.positionMm.z) } })),
  } })
  return base
}
function model(part: PartDefinition) { const group = new Group(); addPackageModel(group, { id: 'P1', type: part.editorType }, part); group.updateMatrixWorld(true); return group }
function dispose(group: Group) { group.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose() } }) }
function closedEdges(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex(), edges = new Map<string, number>()
  const point = (i: number) => [position.getX(i), position.getY(i), position.getZ(i)].map(n => Math.round(n / (mm * 1e-5))).join(',')
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const triangle = [0, 1, 2].map(j => point(index ? index.getX(i + j) : i + j))
    if (new Set(triangle).size < 3) continue
    for (let j = 0; j < 3; j++) { const edge = [triangle[j]!, triangle[(j + 1) % 3]!].sort().join('|'); edges.set(edge, (edges.get(edge) ?? 0) + 1) }
  }
  return [...edges.values()].filter(count => count !== 2).length
}
function near(actual: number, expected: number, label: string) { assert.ok(Math.abs(actual / mm - expected) < 1e-4, `${label}: ${actual / mm} != ${expected} mm`) }

test('molded DIP is sealed at the lower pin-1 end while the shallow top notch stays visible', () => {
  const group = model(fixture('dip'))
  try {
    const body = group.getObjectByName('package-body') as Mesh
    const bounds = new Box3().setFromObject(body), size = bounds.getSize(new Vector3())
    near(size.x, 19, 'length'); near(size.y, 3.04, 'body thickness'); near(size.z, 6.35, 'width'); near(bounds.min.y, 1, 'standoff')
    const ray = (y: number) => new Raycaster(new Vector3(-12 * mm, y * mm, 0), new Vector3(1, 0, 0)).intersectObject(body)[0]!
    const lower = ray(1.3), upper = ray(3.9)
    assert.ok(lower, 'lower end is a sealed molded side')
    assert.ok(lower.point.x < -9.4 * mm, 'notch must not cut through the slightly tapered lower body')
    assert.ok(upper.point.x > -9.2 * mm, 'notch indents only the top end')
    assert.equal(closedEdges(body.geometry), 0, 'molded solid has no welded boundary edges')
    assert.equal(group.getObjectByName('package-marking')?.userData.text, '74HC08')
  } finally { dispose(group) }
})

test('DIP stamped shoulders narrow before the hole and preserve a 0.28 mm metal thickness', () => {
  const part = fixture('dip'), group = model(part)
  try {
    for (const pin of part.package.pins) {
      const lead = group.getObjectByName(`package-lead-${pin.id}`)!.getObjectByName('lead-metal') as Mesh
      const positions = lead.geometry.getAttribute('position')
      const xsAt = (predicate: (y: number, z: number) => boolean) => Array.from({ length: positions.count }, (_, i) => ({ x: positions.getX(i) / mm, y: positions.getY(i) / mm, z: positions.getZ(i) / mm })).filter(p => predicate(p.y, p.z)).map(p => p.x)
      const shoulder = xsAt((y, z) => y > 2.45 && Math.abs(z) < 3.7), tail = xsAt(y => y < .25)
      near((Math.max(...shoulder) - Math.min(...shoulder)) * mm, 1.4, 'shoulder width')
      near((Math.max(...tail) - Math.min(...tail)) * mm, .46, 'tail width')
      const zs = Array.from({ length: positions.count }, (_, i) => positions.getZ(i) / mm).filter((_, i) => positions.getY(i) < .25 * mm)
      near((Math.max(...zs) - Math.min(...zs)) * mm, .28, 'tail thickness')
      assert.equal(closedEdges(lead.geometry), 0, 'stamped sweep is closed through shoulders and bends')
    }
  } finally { dispose(group) }
})

test('TO-92 is a closed full-depth D-section with flat front and three sealed underside exits', () => {
  const part = fixture('to92'), group = model(part)
  try {
    const body = group.getObjectByName('package-body') as Mesh, bounds = new Box3().setFromObject(body), size = bounds.getSize(new Vector3())
    near(size.x, 4.6, 'TO-92 width'); near(size.y, 5.1, 'TO-92 height'); near(size.z, 3.9, 'TO-92 depth'); near(bounds.min.y, 2.5, 'TO-92 standoff')
    assert.equal(closedEdges(body.geometry), 0, 'TO-92 caps and flat front are part of one watertight solid')
    assert.equal(group.getObjectByName('package-flat-face'), undefined, 'flat face belongs to the closed body rather than a separate plane')
    const marking = group.getObjectByName('package-marking')!
    near(marking.position.z, 1.952, 'front marking surface')
    for (const [i, pin] of part.package.pins.entries()) {
      const lead = group.getObjectByName(`package-lead-${pin.id}`)!.getObjectByName('lead-metal') as Mesh, geometry = lead.geometry
      geometry.computeBoundingBox(); const b = geometry.boundingBox!
      near(b.max.y, 2.65, 'hidden feedthrough end'); near(b.min.y, 0, 'socket tip')
      const p = geometry.getAttribute('position'), top: number[] = [], bottom: number[] = []
      for (let j = 0; j < p.count; j++) { if (p.getY(j) > 2.64 * mm) top.push(p.getX(j) / mm); if (p.getY(j) < .01 * mm) bottom.push(p.getX(j) / mm) }
      near((Math.max(...top) + Math.min(...top)) * mm / 2, (i - 1) * 1.27, 'exit pitch')
      near((Math.max(...bottom) + Math.min(...bottom)) * mm / 2, (i - 1) * 2.54, 'tip pitch')
      near((Math.max(...bottom) - Math.min(...bottom)) * mm, .44, 'rectangular lead width')
      near(b.max.z - b.min.z, .42, 'rectangular lead thickness')
      assert.equal(closedEdges(geometry), 0, 'rectangular lead is closed along its fan-out')
    }
  } finally { dispose(group) }
})

test('every molded feedthrough enters the actual closed body and the unhidden external lead stays outside', () => {
  for (const family of ['dip', 'to92'] as const) {
    const part = fixture(family), group = model(part)
    try {
      const body = group.getObjectByName('package-body') as Mesh
      for (const pin of part.package.pins) {
        const join = packageFeedthrough(part, pin.id)
        assert.ok(solidContainsPoint(body, join.embeddedStart), `${family} ${pin.id} hidden metal must be inside real molded triangles`)
        assert.ok(solidContainsPoint(body, join.exit.clone().addScaledVector(join.outward, -.025 * mm)), 'feedthrough surface must meet the real solid')
        assert.ok(!solidContainsPoint(body, join.exit.clone().addScaledVector(join.outward, .025 * mm)), 'exposed exit cannot rely on an AABB or detached face')
        const lead = group.getObjectByName(`package-lead-${pin.id}`)!.getObjectByName('lead-metal') as Mesh
        assert.ok(solidContainsPoint(lead, join.exit.clone().addScaledVector(join.outward, -.075 * mm)), 'actual stamped metal intersects the bounded seal interior')
      }
    } finally { dispose(group) }
  }
})

test('non-DIP14 descriptors retain their own body and all sixteen or twenty stamped leads', () => {
  for (const [pins, length, depth, thickness, standoff] of [[16, 20.2, 6.6, 3.3, 1.1], [20, 26, 7.1, 3.8, 1.35]]) {
    const part = fixture('dip'), half = pins! / 2
    part.package.bodyMm = { x: length!, y: thickness!, z: depth! }; part.package.standoffMm = standoff!
    part.package.pins = Array.from({ length: pins! }, (_, i) => {
      const side = i < half ? 1 : -1, order = i < half ? i : pins! - 1 - i
      return { id: String(i + 1), number: String(i + 1), name: `P${i + 1}`, role: 'passive', positionMm: { x: (order - (half - 1) / 2) * 2.54, y: 0, z: side * 3.81 } }
    })
    part.package.shape!.leadExits = part.package.pins.map(pin => ({ pinId: pin.id, positionMm: { x: pin.positionMm.x, y: 0, z: Math.sign(pin.positionMm.z) * depth! / 2 }, normal: { x: 0, y: 0, z: Math.sign(pin.positionMm.z) } }))
    const group = model(part)
    try {
      const body = group.getObjectByName('package-body') as Mesh, bounds = new Box3().setFromObject(body), size = bounds.getSize(new Vector3())
      near(size.x, length!, 'descriptor length'); near(size.y, thickness!, 'descriptor body thickness'); near(size.z, depth!, 'descriptor width'); near(bounds.min.y, standoff!, 'descriptor standoff')
      const leads = group.children.filter(child => child.userData.physicalLead)
      assert.equal(leads.length, pins)
      assert.deepEqual(leads.map(lead => lead.userData.pinId), part.package.pins.map(pin => pin.id))
      for (const lead of leads) assert.equal(closedEdges((lead.getObjectByName('lead-metal') as Mesh).geometry), 0)
      assert.ok(packageLeadCollisionRadiusMm(part.package) >= Math.hypot(1.4, .28) / 2, 'collision envelope must enclose the actual shoulder and metal thickness')
    } finally { dispose(group) }
  }
})

test('DIP top triangles are coplanar and retain flat upward normals beside the shallow notch', () => {
  const group = model(fixture('dip'))
  try {
    const body = group.getObjectByName('package-body') as Mesh, p = body.geometry.getAttribute('position'), normals = body.geometry.getAttribute('normal'), index = body.geometry.index
    let caps = 0
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j)
      if (!ids.every(id => Math.abs(p.getY(id) - 3.04 * mm) < 1e-7)) continue
      caps++
      const vertices = ids.map(id => new Vector3().fromBufferAttribute(p, id)), face = vertices[1]!.clone().sub(vertices[0]!).cross(vertices[2]!.clone().sub(vertices[0]!)).normalize()
      assert.ok(face.distanceTo(new Vector3(0, 1, 0)) < 1e-7, 'actual cap triangles must lie on the same upward plane')
      for (const id of ids) assert.ok(new Vector3().fromBufferAttribute(normals, id).distanceTo(new Vector3(0, 1, 0)) < 1e-7, 'bevel/notch normals must not interpolate a false dent across the planar top')
    }
    assert.ok(caps > 2, 'the check covers the actual triangulated concave top around the notch')
    for (const x of [-7, -4, 0, 4, 7]) for (const z of [-2, 0, 2]) {
      const hit = new Raycaster(new Vector3(x * mm, 6 * mm, z * mm), new Vector3(0, -1, 0)).intersectObject(body)[0]
      assert.ok(hit, 'planar top must remain present across the body'); near(hit.point.y, 4.04, 'actual top surface')
    }
    const notch = new Raycaster(new Vector3(-9 * mm, 6 * mm, 0), new Vector3(0, -1, 0)).intersectObject(body)[0]!
    assert.ok(notch.point.y < 3.92 * mm && notch.point.y > 3.2 * mm, 'the shallow recess remains local to the pin-1 end')
    assert.equal(closedEdges(body.geometry), 0)
  } finally { dispose(group) }
})

test('TO-92 lids and flat front have plane normals while the curved back retains smooth shading', () => {
  const group = model(fixture('to92'))
  try {
    const body = group.getObjectByName('package-body') as Mesh, geometry = body.geometry, p = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), index = geometry.index
    let top = 0, bottom = 0, front = 0, curvedSmooth = 0
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j), vertices = ids.map(id => new Vector3().fromBufferAttribute(p, id))
      const face = vertices[1]!.clone().sub(vertices[0]!).cross(vertices[2]!.clone().sub(vertices[0]!)).normalize()
      let expected: Vector3 | undefined
      if (ids.every(id => Math.abs(p.getY(id) - 5.1 * mm) < 1e-7)) { top++; expected = new Vector3(0, 1, 0) }
      else if (ids.every(id => Math.abs(p.getY(id)) < 1e-7)) { bottom++; expected = new Vector3(0, -1, 0) }
      else if (ids.every(id => Math.abs(p.getZ(id) - 1.95 * mm) < 1e-7)) { front++; expected = new Vector3(0, 0, 1) }
      if (expected) {
        assert.ok(face.distanceTo(expected) < 1e-7, 'geometric plane must retain outward winding')
        for (const id of ids) assert.ok(new Vector3().fromBufferAttribute(normals, id).distanceTo(expected) < 1e-7, 'flat molded faces cannot inherit curved or bevel normals')
      } else if (ids.every(id => p.getZ(id) < -.2 * mm) && Math.abs(face.y) < 1e-5) {
        if (ids.some(id => new Vector3().fromBufferAttribute(normals, id).dot(face) < .9999)) curvedSmooth++
      }
    }
    assert.ok(top > 2 && bottom > 2 && front >= 2, 'inspect both closed lids and the actual integral flat front')
    assert.ok(curvedSmooth > 0, 'preserve smooth normals on the curved back rather than flattening the whole package')
    assert.equal(closedEdges(geometry), 0)
  } finally { dispose(group) }
})

test('DIP notch has a flat shallow cavity floor and an upright curved wall across its depth', () => {
  const group = model(fixture('dip'))
  try {
    const body = group.getObjectByName('package-body') as Mesh
    for (const [x, z] of [[-9.15, 0], [-9, .3], [-8.8, 0], [-8.9, -.4]]) {
      const hit = new Raycaster(new Vector3(x! * mm, 6 * mm, z! * mm), new Vector3(0, -1, 0)).intersectObject(body)[0]
      assert.ok(hit, 'half-bowl floor must be an actual closed surface')
      near(hit.point.y, 3.29, 'constant .75 mm-deep floor under the top')
      assert.ok(hit.face!.normal.distanceTo(new Vector3(0, 1, 0)) < 1e-7, 'cavity floor must be horizontal rather than a ramp')
    }
    for (const z of [-.35, 0, .35]) {
      const hits = [3.44, 3.74].map(y => new Raycaster(new Vector3(-12 * mm, y * mm, z * mm), new Vector3(1, 0, 0)).intersectObject(body)[0]!)
      assert.ok(hits.every(Boolean), 'curved cavity wall must remain sealed')
      near(hits[0]!.point.x, hits[1]!.point.x / mm, 'upright curved wall has the same contour at both heights')
      assert.ok(hits.every(hit => Math.abs(hit.face!.normal.y) < 1e-7), 'wall geometry is vertical below the small top bevel')
      if (z === 0) near(hits[0]!.point.x, -8.59, '.85 mm-radius semicircular wall')
    }
    assert.equal(closedEdges(body.geometry), 0)
  } finally { dispose(group) }
})

test('DIP14, DIP16 and DIP20 planar caps retain uniform normals independent of their descriptor sizes', () => {
  for (const [length, height, width] of [[19, 3.04, 6.35], [20.2, 3.3, 6.6], [26, 3.8, 7.1]]) {
    const geometry = createMoldedDipBody(length! * mm, height! * mm, width! * mm, .12 * mm)
    try {
      const p = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'); let top = 0, bottom = 0
      for (let i = 0; i < p.count; i += 3) {
        const ids = [i, i + 1, i + 2]
        const upper = ids.every(id => Math.abs(p.getY(id) - height! * mm) < 1e-7), lower = ids.every(id => Math.abs(p.getY(id)) < 1e-7)
        if (!upper && !lower) continue
        if (upper) top++; else bottom++
        for (const id of ids) assert.ok(new Vector3().fromBufferAttribute(normals, id).distanceTo(new Vector3(0, upper ? 1 : -1, 0)) < 1e-7)
      }
      assert.ok(top > 2 && bottom > 2); assert.equal(closedEdges(geometry), 0)
    } finally { geometry.dispose() }
  }
})

test('every molded triangle has positive area and finite unit normals after forming the notch floor', () => {
  for (const family of ['dip', 'to92'] as const) {
    const group = model(fixture(family))
    try {
      const body = group.getObjectByName('package-body') as Mesh, p = body.geometry.getAttribute('position'), normals = body.geometry.getAttribute('normal'), index = body.geometry.index
      for (let i = 0; i < p.count; i++) {
        const position = new Vector3().fromBufferAttribute(p, i), normal = new Vector3().fromBufferAttribute(normals, i)
        assert.ok([...position.toArray(), ...normal.toArray()].every(Number.isFinite), `${family} geometry must stay finite`)
        assert.ok(Math.abs(normal.length() - 1) < 1e-6, `${family} every rendered vertex needs a nonzero unit normal`)
      }
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const [a, b, c] = [0, 1, 2].map(j => new Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j))
        assert.ok(b!.clone().sub(a!).cross(c!.clone().sub(a!)).lengthSq() > 1e-24, `${family} render buffer cannot contain collapsed floor-ring triangles`)
      }
      assert.equal(closedEdges(body.geometry), 0)
    } finally { dispose(group) }
  }
})
