import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type PartDefinition, type PhysicalPin } from '../../data/partCatalog'
import { rigidPackageLeadStations } from '../../electrical/rigidPackageLeads'

interface Station { point: Vector3; tangent: Vector3; width: number }

/** A section frame is anchored to the stamping plane rather than a Frenet
 * frame, so a straight lead or an inflection never flips its ribbon. */
function stampedSweep(stations: Station[], thickness: number, stampingAxis: Vector3, widthAxisFixed: boolean): BufferGeometry {
  const positions: number[] = [], indices: number[] = []
  for (const station of stations) {
    const tangent = station.tangent.clone().normalize()
    const width = widthAxisFixed ? stampingAxis.clone() : tangent.clone().cross(stampingAxis).normalize()
    const normal = width.clone().cross(tangent).normalize()
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const point = station.point.clone().addScaledVector(width, a! * station.width / 2).addScaledVector(normal, b! * thickness / 2)
      positions.push(point.x, point.y, point.z)
    }
  }
  for (let i = 0; i < stations.length - 1; i++) for (let j = 0; j < 4; j++) {
    const next = (j + 1) % 4, a = i * 4 + j, b = i * 4 + next, c = (i + 1) * 4 + next, d = (i + 1) * 4 + j
    indices.push(a, d, b, b, d, c)
  }
  indices.push(0, 1, 3, 1, 2, 3)
  const end = (stations.length - 1) * 4; indices.push(end, end + 3, end + 1, end + 1, end + 3, end + 2)
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals()
  const creased = toCreasedNormals(geometry, Math.PI / 5); geometry.dispose(); creased.computeBoundingBox(); creased.computeBoundingSphere()
  return creased
}

/** Package-frame geometry, including exactly the declared hidden feedthrough.
 * The exposed path ends at the original contact plane; contact coordinates and
 * electrical identities are never inferred from the new sectioned mesh. */
export function createMoldedPackageLead(part: PartDefinition, pin: PhysicalPin, insertion = 0): BufferGeometry {
  const lead = rigidPackageLeadStations(part, pin, insertion), vector = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z)
  const stations: Station[] = lead.stations.map(station => ({ ...station, point: vector(station.point), tangent: vector(station.tangent) }))
  stations.unshift({ point: vector(lead.feedthrough.embeddedStart), tangent: stations[0]!.tangent.clone(), width: stations[0]!.width })
  return stampedSweep(stations, lead.thickness, vector(lead.stampingAxis), lead.widthAxisFixed)
}
