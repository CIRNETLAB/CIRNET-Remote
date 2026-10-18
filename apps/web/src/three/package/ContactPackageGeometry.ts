import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape, ShapeUtils, Vector2, Vector3 } from 'three'

export interface ContactPanelHole {x:number;y:number;width:number;height:number;radius?:number}
/** A formed sheet, including actual punched openings. These detail dimensions
 * are cosmetic CAD choices; the enclosing package and terminals stay catalog-owned. */
export function contactPanelGeometry(w:number,h:number,thickness:number,radius:number,holes:ContactPanelHole[]=[],bottomRelief?:{width:number;height:number}) {
  const shape=new Shape(),x=w/2,y=h/2,r=Math.min(radius,w/4,h/4)
  shape.moveTo(-x+r,-y)
  if(bottomRelief){const half=bottomRelief.width/2,top=-y+bottomRelief.height;shape.lineTo(-half,-y);shape.lineTo(-half,top-half);shape.absarc(0,top-half,half,Math.PI,0,true);shape.lineTo(half,-y)}
  shape.lineTo(x-r,-y);shape.quadraticCurveTo(x,-y,x,-y+r);shape.lineTo(x,y-r);shape.quadraticCurveTo(x,y,x-r,y)
  shape.lineTo(-x+r,y);shape.quadraticCurveTo(-x,y,-x,y-r);shape.lineTo(-x,-y+r);shape.quadraticCurveTo(-x,-y,-x+r,-y);shape.closePath()
  for(const hole of holes){const path=new Path(),rx=hole.width/2,ry=hole.height/2
    if(hole.radius){path.absarc(hole.x,hole.y,hole.radius,0,Math.PI*2,true)}
    else {path.moveTo(hole.x-rx,hole.y-ry);path.lineTo(hole.x-rx,hole.y+ry);path.lineTo(hole.x+rx,hole.y+ry);path.lineTo(hole.x+rx,hole.y-ry);path.closePath()}
    shape.holes.push(path)
  }
  const source=new ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:16}),p=source.getAttribute('position'),n=source.getAttribute('normal'),positions:number[]=[],normals:number[]=[]
  const caps=[0,thickness].map(z=>{const points=new Map<string,Vector3>();for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i)-z)<1e-8){const point=new Vector3().fromBufferAttribute(p,i);points.set(`${point.x.toFixed(10)},${point.y.toFixed(10)}`,point)}return [...points.values()]})
  const emit=(point:Vector3,normal:Vector3)=>{positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z)}
  for(let i=0;i<p.count;i+=3){
    const triangle=[0,1,2].map(j=>new Vector3().fromBufferAttribute(p,i+j)),front=Math.abs(triangle[0]!.z-thickness)<1e-8,flat=triangle.every(point=>Math.abs(point.z-triangle[0]!.z)<1e-8)
    if(!flat){for(let j=0;j<3;j++)emit(triangle[j]!,new Vector3().fromBufferAttribute(n,i+j));continue}
    const perimeter:Vector3[]=[]
    for(let edge=0;edge<3;edge++){const a=triangle[edge]!,delta=triangle[(edge+1)%3]!.clone().sub(a),length=delta.lengthSq(),interior:{point:Vector3;t:number}[]=[]
      for(const point of caps[front?1:0]!){const relative=point.clone().sub(a),t=relative.dot(delta)/length;if(t>1e-8&&t<1-1e-8&&relative.clone().cross(delta).length()<1e-10)interior.push({point,t})}
      perimeter.push(a,...interior.sort((a,b)=>a.t-b.t).map(item=>item.point))
    }
    const normal=new Vector3().fromBufferAttribute(n,i)
    if(perimeter.length===3)triangle.forEach(point=>emit(point,normal))
    else {const center=triangle.reduce((sum,point)=>sum.add(point),new Vector3()).multiplyScalar(1/3);for(let edge=0;edge<perimeter.length;edge++){emit(center,normal);emit(perimeter[edge]!,normal);emit(perimeter[(edge+1)%perimeter.length]!,normal)}}
  }
  source.dispose();const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));return geometry
}

export interface PackageRecess { x: number; z: number; width: number; depth: number; floor: number }

function outline(w: number, d: number, radius: number) {
  const r = Math.max(Math.min(radius, w / 4, d / 4), 1e-9), points: Vector2[] = []
  for (const [cx, cz, start] of [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90], [-w / 2 + r, -d / 2 + r, 180], [w / 2 - r, -d / 2 + r, 270]]) {
    for (let step = 0; step <= 8; step++) {
      const angle = (start! + step * 90 / 8) * Math.PI / 180
      points.push(new Vector2(cx! + r * Math.cos(angle), cz! + r * Math.sin(angle)))
    }
  }
  return points
}

/** Closed CAD block with true blind pockets. The top face is triangulated around
 * each opening; its floor and upright walls belong to the same solid. */
export function recessedPackageBox(w: number, h: number, d: number, bevel: number, recesses: PackageRecess[] = []): BufferGeometry {
  const b = Math.min(bevel, h / 4, w / 8, d / 8), r = Math.max(b * 1.5, 1e-8)
  const rings = [
    { y: 0, points: outline(w - 2 * b, d - 2 * b, r - b) },
    { y: b, points: outline(w, d, r) },
    { y: h - b, points: outline(w, d, r) },
    { y: h, points: outline(w - 2 * b, d - 2 * b, r - b) },
  ]
  const count = rings[0]!.points.length, positions: number[] = [], indices: number[] = []
  for (const ring of rings) for (const point of ring.points) positions.push(point.x, ring.y, point.y)
  for (let layer = 0; layer < rings.length - 1; layer++) for (let i = 0; i < count; i++) {
    const next = (i + 1) % count, a = layer * count + i, nextA = layer * count + next, c = (layer + 1) * count + next, e = (layer + 1) * count + i
    indices.push(a, e, nextA, nextA, e, c)
  }
  const cap = (points: Vector2[], offset: number, upward: boolean) => {
    for (const [a, c, e] of ShapeUtils.triangulateShape(points, [])) indices.push(offset + a!, offset + (upward ? e! : c!), offset + (upward ? c! : e!))
  }
  cap(rings[0]!.points, 0, false)
  const holes = recesses.map(recess => [
    new Vector2(recess.x - recess.width / 2, recess.z - recess.depth / 2),
    new Vector2(recess.x - recess.width / 2, recess.z + recess.depth / 2),
    new Vector2(recess.x + recess.width / 2, recess.z + recess.depth / 2),
    new Vector2(recess.x + recess.width / 2, recess.z - recess.depth / 2),
  ])
  const topOffset = 3 * count
  for (const hole of holes) for (const point of hole) positions.push(point.x, h, point.y)
  const topPoints = [...rings[3]!.points, ...holes.flat()]
  for (const triangle of ShapeUtils.triangulateShape(rings[3]!.points, holes)) {
    // Earcut can bridge aligned pocket edges with one long edge, dropping the
    // intermediate collinear corners. Retain those corners on both adjacent
    // faces so the recessed solid has no T-junctions at the four DIP openings.
    const perimeter: number[] = []
    for (let edge = 0; edge < 3; edge++) {
      const from = triangle[edge]!, to = triangle[(edge + 1) % 3]!, start = topPoints[from]!, delta = topPoints[to]!.clone().sub(start), lengthSq = delta.lengthSq()
      const interior: { index: number; t: number }[] = []
      for (let index = 0; index < topPoints.length; index++) {
        const relative = topPoints[index]!.clone().sub(start), t = relative.dot(delta) / lengthSq
        if (t > 1e-9 && t < 1 - 1e-9 && Math.abs(relative.cross(delta)) < 1e-12) interior.push({ index, t })
      }
      perimeter.push(from, ...interior.sort((a, b) => a.t - b.t).map(point => point.index))
    }
    if (perimeter.length === 3) indices.push(topOffset + triangle[0]!, topOffset + triangle[2]!, topOffset + triangle[1]!)
    else {
      const center = triangle.reduce((sum, index) => sum.add(topPoints[index]!), new Vector2()).multiplyScalar(1 / 3), centerIndex = positions.length / 3
      positions.push(center.x, h, center.y)
      for (let edge = 0; edge < perimeter.length; edge++) indices.push(centerIndex, topOffset + perimeter[(edge + 1) % perimeter.length]!, topOffset + perimeter[edge]!)
    }
  }
  for (let j = 0; j < recesses.length; j++) {
    const hole = holes[j]!, rim = 4 * count + j * 4, floor = positions.length / 3
    for (const point of hole) positions.push(point.x, recesses[j]!.floor, point.y)
    for (let i = 0; i < 4; i++) { const next = (i + 1) % 4; indices.push(rim + i, rim + next, floor + i, rim + next, floor + next, floor + i) }
    cap(hole, floor, true)
  }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices)
  // Exact topology is retained for smooth side corners. Horizontal lids/floors
  // use independent planar normals and never inherit the bevel normal.
  const surface = geometry.toNonIndexed(), normals = new Float32BufferAttribute(new Float32Array(indices.length * 3), 3)
  const faceNormals: Vector3[] = [], planar: boolean[] = [], adjacent: number[][] = Array.from({ length: positions.length / 3 }, () => [])
  for (let i = 0; i < indices.length; i += 3) {
    const vertices = indices.slice(i, i + 3).map(index => new Vector3(positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!))
    faceNormals.push(vertices[1]!.clone().sub(vertices[0]!).cross(vertices[2]!.clone().sub(vertices[0]!)).normalize())
    const flat = vertices.every(point => Math.abs(point.y - vertices[0]!.y) < 1e-12); planar.push(flat)
    if (!flat) for (const index of indices.slice(i, i + 3)) adjacent[index]!.push(i / 3)
  }
  for (let i = 0; i < indices.length; i++) {
    const face = Math.floor(i / 3), normal = faceNormals[face]!.clone()
    if (!planar[face]) { normal.set(0, 0, 0); for (const other of adjacent[indices[i]!]!) if (faceNormals[face]!.dot(faceNormals[other]!) > .71) normal.add(faceNormals[other]!); normal.normalize() }
    normals.setXYZ(i, normal.x, normal.y, normal.z)
  }
  surface.setAttribute('normal', normals); geometry.dispose(); return surface
}
