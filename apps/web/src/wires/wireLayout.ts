import type { Point3, WireIdentity, WireVisual } from '../types/circuit'
import { CROSSING_CLEARANCE, FREE_COPPER_LENGTH, PARALLEL_LANE_GAP, renderWireDiameter, WIRE_CORNER_RADIUS } from './wireAppearance'
import { pointDistance, type RouteSegment, type SolvedWireRoute } from './wireRouting'
import { wireKey } from './wireVisual'

export interface WireLayoutInput { wire: WireIdentity; visual: WireVisual; route: SolvedWireRoute }
type Entry = WireLayoutInput & { key: string; order: number; diameter: number }
type DisplaySegment = NonNullable<SolvedWireRoute['renderSegments']>[number]
interface Pair { a: string; b: string; parallel: [number, number][] }
interface Sample { position: Point3; base: Point3; segment: RouteSegment }
interface Bridge { start: number; up: number; down: number; end: number; lift: number }
interface Lane { normal: Point3; coordinate: number; group: string }
interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
interface CompletedLayout { entry: Entry; samples: Sample[]; bounds: Bounds }
const EPS = 1e-8
const zero = (): Point3 => ({ x: 0, y: 0, z: 0 })
const lerp = (a: Point3, b: Point3, t: number): Point3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
const add = (a: Point3, b: Point3): Point3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Point3, t: number): Point3 => ({ x: a.x * t, y: a.y * t, z: a.z * t })
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * t * (t * (t * 6 - 15) + 10) }
const priority = (a: Entry, b: Entry) => (a.visual.layer ?? 0) - (b.visual.layer ?? 0) || a.order - b.order
const token = (key: string, segment: number) => JSON.stringify([key, segment])
const projected = (point: Point3, start: Point3, end: Point3) => {
  const x = end.x - start.x, z = end.z - start.z, length = x * x + z * z
  return length > EPS * EPS ? Math.max(0, Math.min(1, ((point.x - start.x) * x + (point.z - start.z) * z) / length)) : 0
}
const xzDistance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.z - b.z)
const boundsOf = (points: Point3[]): Bounds => points.reduce((box, point) => ({ minX: Math.min(box.minX, point.x), maxX: Math.max(box.maxX, point.x), minZ: Math.min(box.minZ, point.z), maxZ: Math.max(box.maxZ, point.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
const separated = (a: Bounds, b: Bounds, gap: number) => a.maxX + gap < b.minX || b.maxX + gap < a.minX || a.maxZ + gap < b.minZ || b.maxZ + gap < a.minZ
function intersection(a: Point3, b: Point3, c: Point3, d: Point3): [number, number] | null {
  const x = b.x - a.x, z = b.z - a.z, u = d.x - c.x, v = d.z - c.z, denominator = x * v - z * u
  if (Math.abs(denominator) < 1e-12) return null
  const s = ((c.x - a.x) * v - (c.z - a.z) * u) / denominator, t = ((c.x - a.x) * z - (c.z - a.z) * x) / denominator
  return s >= -EPS && s <= 1 + EPS && t >= -EPS && t <= 1 + EPS ? [Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, t))] : null
}
function spanProximity(a: RouteSegment, b: RouteSegment, clearance: number): { parallel: boolean } | null {
  const p = a.start, q = a.end, r = b.start, s = b.end
  if (!a.editable || !b.editable || Math.max(p.x, q.x) + clearance < Math.min(r.x, s.x) || Math.max(r.x, s.x) + clearance < Math.min(p.x, q.x) || Math.max(p.z, q.z) + clearance < Math.min(r.z, s.z) || Math.max(r.z, s.z) + clearance < Math.min(p.z, q.z)) return null
  const length = xzDistance(p, q), otherLength = xzDistance(r, s)
  if (length < EPS || otherLength < EPS) return null
  const cosine = Math.abs(((q.x - p.x) * (s.x - r.x) + (q.z - p.z) * (s.z - r.z)) / (length * otherLength))
  const distances = [xzDistance(p, lerp(r, s, projected(p, r, s))), xzDistance(q, lerp(r, s, projected(q, r, s))), xzDistance(r, lerp(p, q, projected(r, p, q))), xzDistance(s, lerp(p, q, projected(s, p, q)))]
  if (Math.min(...distances) > clearance && !intersection(p, q, r, s)) return null
  const ux = (q.x - p.x) / length, uz = (q.z - p.z) / length
  const rAlong = (r.x - p.x) * ux + (r.z - p.z) * uz, sAlong = (s.x - p.x) * ux + (s.z - p.z) * uz
  const low = Math.max(0, Math.min(rAlong, sAlong)), high = Math.min(length, Math.max(rAlong, sAlong))
  const middle = lerp(p, q, (low + high) / (2 * length)), other = lerp(r, s, projected(middle, r, s))
  const firstHeight = lerp(p, q, low / length), lastHeight = lerp(p, q, high / length)
  const lowDifference = firstHeight.y - lerp(r, s, projected(firstHeight, r, s)).y, highDifference = lastHeight.y - lerp(r, s, projected(lastHeight, r, s)).y
  const heightSeparation = lowDifference * highDifference <= 0 ? 0 : Math.min(Math.abs(lowDifference), Math.abs(highDifference))
  const cross = intersection(p, q, r, s), interiorCross = cross && cross.every(value => value > EPS && value < 1 - EPS)
  const sameSpan = xzDistance(p, r) < EPS && xzDistance(q, s) < EPS || xzDistance(p, s) < EPS && xzDistance(q, r) < EPS
  return { parallel: !interiorCross && cosine >= .985 && (sameSpan || high - low > clearance * 2) && heightSeparation < clearance && xzDistance(middle, other) < clearance }
}

export function wireRoutesConflict(a: SolvedWireRoute, aVisual: WireVisual, b: SolvedWireRoute, bVisual: WireVisual): boolean {
  const diameter = Math.max(renderWireDiameter(aVisual), renderWireDiameter(bVisual)), clearance = (renderWireDiameter(aVisual) + renderWireDiameter(bVisual)) / 2 + diameter * PARALLEL_LANE_GAP
  return a.segments.some(first => b.segments.some(second => !!spanProximity(first, second, clearance)))
}

function relationship(a: Entry, b: Entry): Pair | null {
  const clearance = (a.diameter + b.diameter) / 2 + Math.max(a.diameter, b.diameter) * PARALLEL_LANE_GAP
  if (separated(boundsOf(a.route.points), boundsOf(b.route.points), clearance)) return null
  const parallel: [number, number][] = []
  let found = false
  for (const first of a.route.segments) for (const second of b.route.segments) {
    const proximity = spanProximity(first, second, clearance)
    if (!proximity) continue
    found = true
    if (proximity.parallel && !parallel.some(pair => pair[0] === first.index && pair[1] === second.index)) parallel.push([first.index, second.index])
  }
  return found ? { a: a.key, b: b.key, parallel } : null
}

function laneOffsets(entries: Entry[], pairs: Pair[]): Map<string, Lane> {
  const byKey = new Map(entries.map(entry => [entry.key, entry])), parents = new Map<string, string>()
  const root = (key: string): string => { const parent = parents.get(key); if (!parent) { parents.set(key, key); return key }; if (parent === key) return key; const value = root(parent); parents.set(key, value); return value }
  const node = (key: string) => { const [wire, index] = JSON.parse(key) as [string, number]; return { wire, segment: byKey.get(wire)!.route.segments[index] } }
  for (const pair of pairs) for (const [first, second] of pair.parallel) {
    const a = root(token(pair.a, first)), b = root(token(pair.b, second))
    if (a === b) continue
    const left = [...parents.keys()].filter(key => root(key) === a).map(node), right = [...parents.keys()].filter(key => root(key) === b).map(node)
    // A wide bundle may approach another leg of its own S/U route. Those are
    // distinct corridors, not one lane; merging them collapses the short turn.
    const incompatible = left.some(one => right.some(two => {
      if (one.wire !== two.wire) return false
      const p = one.segment.start, q = one.segment.end, r = two.segment.start, s = two.segment.end
      const length = xzDistance(p, q), other = xzDistance(r, s)
      const cosine = ((q.x - p.x) * (s.x - r.x) + (q.z - p.z) * (s.z - r.z)) / (length * other)
      if (Math.abs(one.segment.index - two.segment.index) === 1 && cosine >= .985) return false
      return Math.abs((r.x - p.x) * (q.z - p.z) - (r.z - p.z) * (q.x - p.x)) > length * EPS || Math.abs((q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x)) > length * other * EPS
    }))
    if (!incompatible) parents.set(b, a)
  }
  const groups = new Map<string, { entry: Entry; segment: RouteSegment }[]>()
  for (const key of parents.keys()) {
    const [wire, index] = JSON.parse(key) as [string, number], entry = byKey.get(wire)
    if (!entry) continue
    const group = groups.get(root(key)) ?? []; group.push({ entry, segment: entry.route.segments[index] }); groups.set(root(key), group)
  }
  const offsets = new Map<string, Lane>()
  for (const group of groups.values()) {
    group.sort((a, b) => a.entry.order - b.entry.order || a.segment.index - b.segment.index)
    const reference = group[0], p = reference.segment.start, q = reference.segment.end
    const first = reference.entry.route.points[0], last = reference.entry.route.points.at(-1)!
    const forward = reference.entry.route.canonicalForward ?? (([last.x - first.x, last.z - first.z, last.y - first.y].find(value => Math.abs(value) > EPS) ?? 0) >= 0)
    const length = xzDistance(p, q), normal = { x: -(q.z - p.z) / length * (forward ? 1 : -1), y: 0, z: (q.x - p.x) / length * (forward ? 1 : -1) }
    const wires = [...new Map(group.map(item => [item.entry.key, item.entry])).values()].sort(priority)
    if (wires.length < 2) continue
    const positions = [0]
    for (let index = 1; index < wires.length; index++) positions.push(positions.at(-1)! + (wires[index - 1].diameter + wires[index].diameter) / 2 + Math.max(wires[index - 1].diameter, wires[index].diameter) * PARALLEL_LANE_GAP)
    const midpoint = (positions[0] - wires[0].diameter / 2 + positions.at(-1)! + wires.at(-1)!.diameter / 2) / 2
    const center = group.reduce((sum, item) => sum + normal.x * (item.segment.start.x + item.segment.end.x) / 2 + normal.z * (item.segment.start.z + item.segment.end.z) / 2, 0) / group.length
    for (const { entry, segment } of group) {
      offsets.set(token(entry.key, segment.index), { normal, coordinate: center + positions[wires.indexOf(entry)] - midpoint, group: root(token(entry.key, segment.index)) })
    }
  }
  return offsets
}

function lateralSamples(entry: Entry, offsets: Map<string, Lane>): Sample[] {
  const result: Sample[] = [], segments = entry.route.segments
  const get = (index: number, point: Point3) => { const lane = offsets.get(token(entry.key, index)); return lane ? scale(lane.normal, lane.coordinate - lane.normal.x * point.x - lane.normal.z * point.z) : zero() }
  const join = (before: RouteSegment | undefined, after: RouteSegment | undefined) => {
    if (!before?.editable || !after?.editable) return zero()
    const a = get(before.index, before.end), b = get(after.index, after.start)
    const p = add(before.start, get(before.index, before.start)), q = add(before.end, a), r = add(after.start, b), s = add(after.end, get(after.index, after.end))
    const ux = q.x - p.x, uz = q.z - p.z, vx = s.x - r.x, vz = s.z - r.z, determinant = ux * vz - uz * vx
    if (Math.abs(determinant) < 1e-10) return scale(add(a, b), .5)
    const t = ((b.x - a.x) * vz - (b.z - a.z) * vx) / determinant
    const result = { x: a.x + ux * t, y: 0, z: a.z + uz * t }
    const cosine=(ux*vx+uz*vz)/Math.max(EPS,Math.hypot(ux,uz)*Math.hypot(vx,vz))
    // A shallow join needs a longer miter to retain both corridor clearances.
    // The span reversal limiter below still bounds adjacent short controls.
    const limit = Math.max(entry.diameter, Math.hypot(a.x, a.z), Math.hypot(b.x, b.z)) * (cosine>.95?6:3)
    return Math.hypot(result.x, result.z) <= limit ? result : scale(add(a, b), .5)
  }
  const joins = [zero(), ...segments.slice(0, -1).map((segment, index) => join(segment, segments[index + 1])), zero()]
  // Bound both adjoining knots if a miter would reverse a very short span.
  // Scaling toward its original knot cannot add a loop or a spline overshoot.
  for (let pass = 0; pass <= segments.length; pass++) {
    let changed = false
    for (const segment of segments) {
      const length = xzDistance(segment.start, segment.end)
      if (!segment.editable || length < EPS) continue
      const a = joins[segment.index], b = joins[segment.index + 1]
      const delta = ((b.x - a.x) * (segment.end.x - segment.start.x) + (b.z - a.z) * (segment.end.z - segment.start.z)) / length
      if (delta < -length * .8) { const factor = length * .8 / -delta; joins[segment.index] = scale(a, factor); joins[segment.index + 1] = scale(b, factor); changed = true }
    }
    if (!changed) break
  }
  for (const segment of segments) {
    const start = joins[segment.index], end = joins[segment.index + 1]
    const targetStart = add(segment.start, get(segment.index, segment.start)), targetEnd = add(segment.end, get(segment.index, segment.end))
    const targetLength = xzDistance(targetStart, targetEnd), unit = targetLength > EPS ? { x: (targetEnd.x - targetStart.x) / targetLength, y: 0, z: (targetEnd.z - targetStart.z) / targetLength } : zero()
    const along = (offset: Point3, target: Point3, base: Point3) => (base.x + offset.x - target.x) * unit.x + (base.z + offset.z - target.z) * unit.z
    const laneStart = add(targetStart, scale(unit, along(start, targetStart, segment.start))), laneEnd = add(targetEnd, scale(unit, along(end, targetEnd, segment.end)))
    const startError = { x: segment.start.x + start.x - laneStart.x, y: 0, z: segment.start.z + start.z - laneStart.z }
    const endError = { x: segment.end.x + end.x - laneEnd.x, y: 0, z: segment.end.z + end.z - laneEnd.z }
    const length = Math.max(EPS, pointDistance(laneStart, laneEnd))
    // Leave real straight run for each analytic fillet before a sampled lane
    // fan begins. Starting its easing immediately at a 90 degree socket/corner
    // leaves microscopic chords that cannot fit the insulation's bend radius.
    const cornerRun=(before:RouteSegment|undefined,after:RouteSegment|undefined)=>{
      if(!before||!after)return 0
      const u={x:before.end.x-before.start.x,y:before.end.y-before.start.y,z:before.end.z-before.start.z},v={x:after.end.x-after.start.x,y:after.end.y-after.start.y,z:after.end.z-after.start.z}
      const denominator=Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z)
      const cosine=denominator>EPS?Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y+u.z*v.z)/denominator)):1
      return WIRE_CORNER_RADIUS*Math.tan(Math.acos(cosine)/2)*1.2
    }
    const protectedRun=Math.max(WIRE_CORNER_RADIUS*1.2,entry.diameter*.8)
    const protectedStart = Math.min(length*.4,Math.max(protectedRun,cornerRun(segments[segment.index-1],segment),segment.index === 0 && !entry.route.terminalLeads.source ? FREE_COPPER_LENGTH*2.3 : 0))
    const protectedEnd = Math.min(length*.4,Math.max(protectedRun,cornerRun(segment,segments[segment.index+1]),segment.index === segments.length-1 && !entry.route.terminalLeads.destination ? FREE_COPPER_LENGTH*2.3 : 0))
    const available = Math.max(EPS, length - protectedStart - protectedEnd)
    const up = Math.min(available * .4, Math.max(entry.diameter * 3, Math.hypot(startError.x, startError.z) * 3))
    const down = Math.min(available * .4, Math.max(entry.diameter * 3, Math.hypot(endError.x, endError.z) * 3))
    const active = [start, end, get(segment.index, segment.start), get(segment.index, segment.end)].some(point => Math.hypot(point.x, point.z) > EPS)
    const times = new Set([0, 1])
    if (active && segment.editable) {
      times.add(.5)
      for (let index = 0; index <= 12; index++) { times.add((protectedStart + up * index / 12) / length); times.add(1 - (protectedEnd + down * index / 12) / length) }
    }
    for (const t of [...times].sort((a, b) => a - b)) {
      const distance = t * length, base = lerp(segment.start, segment.end, t)
      // Interpolate longitudinal miter motion over the displaced span itself.
      // Only perpendicular fan errors are eased, so a short S leg cannot run
      // forward/backward/forward while retaining outward-facing tube triangles.
      const position = segment.editable ? add(lerp(laneStart, laneEnd, t), add(scale(startError, 1 - smooth((distance - protectedStart) / up)), scale(endError, 1 - smooth((length - protectedEnd - distance) / down)))) : base
      // Retain one sample at each semantic boundary; span attribution below uses
      // the ending sample's owner, including when adjacent spans share a knot.
      if (result.length && pointDistance(result.at(-1)!.position, position) < EPS) continue
      result.push({ position, base, segment })
    }
  }
  return result
}

function displaySegments(samples: Sample[]): DisplaySegment[] {
  return samples.slice(1).map((sample, index) => ({ ...sample.segment, start: samples[index].position, end: sample.position, baseStart: samples[index].base, baseEnd: sample.base }))
}

function bridgeSamples(entry: Entry, samples: Sample[], lower: CompletedLayout[], parallelSpans: Map<string, Set<string>>): Sample[] {
  if (!lower.length || samples.length < 2) return samples
  const spans = displaySegments(samples), distances = [0]
  for (const span of spans) distances.push(distances.at(-1)! + pointDistance(span.start, span.end))
  const firstEditable = spans.findIndex(span => span.editable), lastEditable = spans.map((span, index) => span.editable ? index : -1).filter(index => index >= 0).at(-1) ?? -1
  if (firstEditable < 0) return samples
  const startBound = distances[firstEditable], endBound = distances[lastEditable + 1], bridges: Bridge[] = [], bounds = boundsOf(samples.map(sample => sample.position))
  for (const other of lower) {
    const clearance = (entry.diameter + other.entry.diameter) / 2 + Math.max(entry.diameter, other.entry.diameter) * CROSSING_CLEARANCE
    if (separated(bounds, other.bounds, clearance)) continue
    const under = displaySegments(other.samples)
    for (const [index, upper] of spans.entries()) {
      if (!upper.editable) continue
      for (const bottom of under) {
        if (!bottom.editable) continue
        if(parallelSpans.get(other.entry.key)?.has(JSON.stringify([upper.index,bottom.index])))continue
        const hit = intersection(upper.start, upper.end, bottom.start, bottom.end)
        if (!hit) continue
        const length = xzDistance(upper.start, upper.end), bottomLength = xzDistance(bottom.start, bottom.end)
        if (length < EPS || bottomLength < EPS) continue
        const sine = Math.abs((upper.end.x - upper.start.x) * (bottom.end.z - bottom.start.z) - (upper.end.z - upper.start.z) * (bottom.end.x - bottom.start.x)) / (length * bottomLength)
        if (sine < 1e-5) continue
        const point = lerp(upper.start, upper.end, hit[0]), underneath = lerp(bottom.start, bottom.end, hit[1])
        // A shared physical socket must stay shared; fan-in near the fixed pin
        // cannot be separated by changing its electrical anchor or collar.
        if ([entry.route.points[0], entry.route.points.at(-1)!].some(end => [other.entry.route.points[0], other.entry.route.points.at(-1)!].some(peer => pointDistance(end, peer) < EPS && pointDistance(point, end) < clearance * 2))) continue
        const support = entry.diameter / 2 * pointDistance(upper.start, upper.end) / length + other.entry.diameter / 2 * pointDistance(bottom.start, bottom.end) / bottomLength
        const lift = underneath.y + support + Math.max(entry.diameter, other.entry.diameter) * CROSSING_CLEARANCE - point.y
        if (lift <= EPS) continue
        const along = distances[index] + pointDistance(upper.start, upper.end) * hit[0]
        if (along <= startBound + EPS || along >= endBound - EPS) continue
        const half = Math.min(clearance / sine, (along - startBound) * .45, (endBound - along) * .45)
        const ramp = Math.max(entry.diameter * 5, lift * 5, WIRE_CORNER_RADIUS * 3)
        let start=Math.max(startBound,along-half-ramp),end=Math.min(endBound,along+half+ramp)
        // A tiny straight before a ramp would require two fillet trims. Join
        // that generated ramp directly to the normal terminal elbow instead.
        if(start-startBound<WIRE_CORNER_RADIUS)start=startBound
        if(endBound-end<WIRE_CORNER_RADIUS)end=endBound
        bridges.push({ start, up: along - half, down: along + half, end, lift })
      }
    }
  }
  if (!bridges.length) return samples
  bridges.sort((a, b) => a.start - b.start)
  const merged: Bridge[] = []
  for (const bridge of bridges) {
    const previous = merged.at(-1)
    if (previous && bridge.start <= previous.end) { previous.end = Math.max(previous.end, bridge.end); previous.up = Math.min(previous.up, bridge.up); previous.down = Math.max(previous.down, bridge.down); previous.lift = Math.max(previous.lift, bridge.lift) }
    else merged.push({ ...bridge })
  }
  const semanticTimes=distances.filter((_,index)=>entry.route.points.some(point=>pointDistance(samples[index].base,point)<EPS))
  for(const bridge of merged){
    const middle=(bridge.up+bridge.down)/2
    const nearby=(value:number,low:number,high:number)=>semanticTimes.filter(distance=>distance>low+EPS&&distance<high-EPS&&Math.abs(distance-value)<WIRE_CORNER_RADIUS*1.2).sort((a,b)=>Math.abs(a-value)-Math.abs(b-value))[0]??value
    // A generated ramp shoulder close to a saved knot uses that same station;
    // it must not leave a microscopic extra span next to the preserved knot.
    bridge.up=nearby(bridge.up,bridge.start,middle)
    bridge.down=nearby(bridge.down,middle,bridge.end)
  }
  const times = new Set(distances.filter((distance,index)=>{
    if(entry.route.points.some(point=>pointDistance(samples[index].base,point)<EPS))return true
    return !merged.some(bridge=>[bridge.start,bridge.up,bridge.down,bridge.end].some(shoulder=>Math.abs(distance-shoulder)<WIRE_CORNER_RADIUS*1.2))
  }))
  for (const bridge of merged) {
    // These are route controls, not a second sampled spline. The shared
    // centerline allocates tangent circular fillets at the ramp shoulders.
    // Dense quintic chords can exceed minimum curvature when an endpoint clips
    // a ramp, although a line/arc overpass still fits in the available span.
    for(const distance of [bridge.start,bridge.up,bridge.down,bridge.end])times.add(distance)
    times.add((bridge.up + bridge.down) / 2)
  }
  const result: Sample[] = []
  let index = 0
  for (const distance of [...times].sort((a, b) => a - b)) {
    while (index < spans.length - 1 && distances[index + 1] < distance - EPS) index++
    const span = spans[index], t = Math.max(0, Math.min(1, (distance - distances[index]) / Math.max(EPS, distances[index + 1] - distances[index])))
    const position = lerp(span.start, span.end, t), base = lerp(span.baseStart, span.baseEnd, t)
    const bridge = merged.find(value => distance >= value.start && distance <= value.end)
    if (bridge) position.y += bridge.lift * (distance < bridge.up ? (distance - bridge.start) / Math.max(EPS, bridge.up - bridge.start) : distance > bridge.down ? (bridge.end - distance) / Math.max(EPS, bridge.end - bridge.down) : 1)
    if (result.length && pointDistance(result.at(-1)!.position, position) < EPS) continue
    result.push({ position, base, segment: span })
  }
  return result
}

function layoutGroup(entries: Entry[], pairs: Pair[]): Map<string, SolvedWireRoute> {
  const offsets = laneOffsets(entries, pairs), completed: CompletedLayout[] = [], result = new Map<string, SolvedWireRoute>()
  for (const entry of [...entries].sort(priority)) {
    const parallelSpans = new Map<string, Set<string>>()
    for (const pair of pairs) if (pair.a === entry.key || pair.b === entry.key) parallelSpans.set(pair.a === entry.key ? pair.b : pair.a, new Set(pair.parallel.filter(indices => { const a = offsets.get(token(pair.a, indices[0])), b = offsets.get(token(pair.b, indices[1])); return a && b && a.group === b.group }).map(indices => JSON.stringify(pair.a === entry.key ? indices : [...indices].reverse()))))
    const samples = bridgeSamples(entry, lateralSamples(entry, offsets), completed, parallelSpans)
    const handles = entry.route.handles.map(handle => {
      const sample = samples.filter(sample => sample.segment.toHandle === handle.index && pointDistance(sample.base, handle.position) < EPS).at(-1)
      return { index: handle.index, position: sample?.position ?? handle.position }
    })
    result.set(entry.key, { ...entry.route, renderPoints: samples.map(sample => sample.position), renderSegments: displaySegments(samples), renderHandles: handles })
    completed.push({ entry, samples, bounds: boundsOf(samples.map(sample => sample.position)) })
  }
  return result
}

// Input signatures exclude color. Pair results are updated only when a route,
// diameter or priority changes; unrelated groups keep their layout references.
export function createWireLayoutCache() {
  let signatures = new Map<string, string>(), pairs = new Map<string, Pair>(), routes = new Map<string, SolvedWireRoute>(), oldOrder: string[] = [], influences: Pair[] = []
  return {
    sync(inputs: WireLayoutInput[]): Map<string, SolvedWireRoute> {
      const entries: Entry[] = inputs.map((input, order) => ({ ...input, key: wireKey(input.wire), order, diameter: renderWireDiameter(input.visual) }))
      const byKey = new Map(entries.map(entry => [entry.key, entry])), nextSignatures = new Map(entries.map(entry => [entry.key, JSON.stringify([entry.route.points, entry.route.handles, entry.route.segments, entry.route.canonicalForward, entry.route.frameModuleId, entry.route.orthogonal, entry.route.terminalLeads, entry.route.contactDeckY, entry.route.contactPitch, entry.diameter, entry.visual.layer ?? 0])]))
      const changed = new Set([...new Set([...signatures.keys(), ...nextSignatures.keys()])].filter(key => signatures.get(key) !== nextSignatures.get(key)))
      const order = entries.map(entry => entry.key), common = new Set(oldOrder.filter(key => byKey.has(key)))
      if (oldOrder.filter(key => common.has(key)).join('|') !== order.filter(key => common.has(key)).join('|')) for (const key of order) changed.add(key)
      if (!changed.size) return routes
      const oldPairs = [...pairs.values()]
      for (const [key, pair] of pairs) if (changed.has(pair.a) || changed.has(pair.b)) pairs.delete(key)
      const checked = new Set<string>()
      for (const key of changed) {
        const a = byKey.get(key)
        if (!a) continue
        for (const b of entries) {
          if (a.key === b.key) continue
          const key = JSON.stringify([a.key, b.key].sort())
          if (checked.has(key)) continue
          checked.add(key)
          const pair = relationship(a, b)
          if (pair) pairs.set(key, pair)
        }
      }
      const affected = new Set(changed), links = [...oldPairs, ...influences, ...pairs.values()]
      let expanded = true
      while (expanded) { expanded = false; for (const pair of links) if (affected.has(pair.a) || affected.has(pair.b)) for (const key of [pair.a, pair.b]) if (!affected.has(key)) { affected.add(key); expanded = true } }
      const next = new Map(routes)
      for (const key of next.keys()) if (!byKey.has(key)) next.delete(key)
      const workingPairs = new Map(pairs)
      // A bundle can widen into a previously separate corridor. Discover those
      // derived neighbors before freezing the group, rather than colliding with
      // a cached wire whose original centerline was outside the conflict range.
      for (let pass = 0; pass <= entries.length; pass++) {
        for (const [key, route] of layoutGroup(entries.filter(entry => affected.has(entry.key)), [...workingPairs.values()].filter(pair => affected.has(pair.a) && affected.has(pair.b)))) next.set(key, route)
        let added = false
        for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i], b = entries[j]
          if (!affected.has(a.key) && !affected.has(b.key)) continue
          const shown = (entry: Entry): Entry => { const route = next.get(entry.key) ?? entry.route; return { ...entry, route: { ...route, points: route.renderPoints ?? route.points, segments: route.renderSegments ?? route.segments } } }
          const pair = relationship(shown(a), shown(b))
          if (!pair) continue
          const key = JSON.stringify([a.key, b.key].sort()), old = workingPairs.get(key)
          // Pair orientation follows input order here; cached base pairs can be
          // reversed when only their second endpoint changed.
          const known = old?.parallel.map(indices => old.a === pair.a ? indices : [...indices].reverse()) ?? []
          const extra = pair.parallel.filter(indices => {
            const first = a.route.segments[indices[0]], second = b.route.segments[indices[1]]
            const crossing = intersection(first.start, first.end, second.start, second.end)
            // Bridge sampling splits a true crossing at its apex. Its shorter
            // displayed pieces must not then be promoted into a parallel lane.
            if (crossing?.every(value => value > EPS && value < 1 - EPS)) return false
            return !known.some(value => value[0] === indices[0] && value[1] === indices[1])
          })
          if (!old || extra.length) { workingPairs.set(key, { ...pair, parallel: [...known, ...extra] as [number, number][] }); added = true }
          for (const peer of [a.key, b.key]) if (!affected.has(peer)) { affected.add(peer); added = true }
        }
        if (!added) break
        // Include all base/previous neighbors of newly discovered wires too.
        let expanded = true
        while (expanded) { expanded = false; for (const pair of links) if (affected.has(pair.a) || affected.has(pair.b)) for (const key of [pair.a, pair.b]) if (!affected.has(key)) { affected.add(key); expanded = true } }
      }
      influences = [...influences.filter(pair => !affected.has(pair.a) && !affected.has(pair.b)), ...[...workingPairs.values()].filter(pair => affected.has(pair.a) && affected.has(pair.b))]
      signatures = nextSignatures; oldOrder = order; routes = next
      return routes
    },
    peers(key: string, connected = false): string[] {
      const group = new Set([key])
      let expanded = true
      while (expanded) {
        expanded = false
        for (const pair of influences) if (connected ? group.has(pair.a) || group.has(pair.b) : pair.a === key || pair.b === key) for (const peer of [pair.a, pair.b]) if (!group.has(peer)) { group.add(peer); expanded = connected }
        if (!connected) break
      }
      group.delete(key); return [...group]
    },
    clear() { signatures.clear(); pairs.clear(); routes.clear(); oldOrder = []; influences = [] },
  }
}
