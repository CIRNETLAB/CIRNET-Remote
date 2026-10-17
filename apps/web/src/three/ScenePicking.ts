import { Mesh,Plane,Vector2,Vector3,type Group,type Object3D,type PerspectiveCamera,type Raycaster } from 'three'
import type { Point3 } from '../types/circuit'

/** Geometric picking has no editor commands, transport, or graph ownership. */
export function createScenePicking({camera,content,wires,raycaster,viewport,target}:{camera:PerspectiveCamera;content:Group;wires:Group;
  raycaster:Raycaster;viewport:()=>{width:number;height:number};target:()=>Vector3}) {
  const plane=new Plane(new Vector3(0,1,0),0)
  const ray=(x:number,y:number)=>{
    const {width,height}=viewport();camera.updateMatrixWorld()
    raycaster.params.Line.threshold=camera.position.distanceTo(target())*2*Math.tan(camera.fov*Math.PI/360)/(height*camera.zoom)*6
    raycaster.setFromCamera(new Vector2(x/width*2-1,-(y/height)*2+1),camera)
  }
  const pickOwner=(initial:Object3D)=>{let object=initial;while(object.parent&&!object.userData.kind) object=object.parent;return object}
  const ignored=(object:Object3D)=>{let current:Object3D|null=object;while(current) {if(current.userData.ignorePick) return true;current=current.parent}return false}
  const wireMeshes=(root?:Object3D)=>(root?[root]:wires.children).flatMap(mesh=>[mesh,...mesh.children.filter(child=>child instanceof Mesh)])
  const contentHit=(x:number,y:number,excludeModuleId?:string)=>{ray(x,y);return raycaster.intersectObjects(content.children,true).find(hit=>!ignored(hit.object)&&(!excludeModuleId||pickOwner(hit.object).userData.id!==excludeModuleId))??null}
  const screenPoint=(point:Point3)=>{
    const {width,height}=viewport(),world=new Vector3(point.x,point.y,point.z),projected=world.clone().project(camera)
    const depth=-world.clone().applyMatrix4(camera.matrixWorldInverse).z
    return {x:(projected.x+1)*width/2,y:(1-projected.y)*height/2,depth,visible:projected.z>=-1&&projected.z<=1}
  }
  const segmentHit=(a:Point3,b:Point3,x:number,y:number)=>{
    const p=screenPoint(a),q=screenPoint(b)
    if(!p.visible||!q.visible||p.depth<=0||q.depth<=0) return null
    const dx=q.x-p.x,dy=q.y-p.y,length=dx*dx+dy*dy
    const t=length>1e-8?Math.max(0,Math.min(1,((x-p.x)*dx+(y-p.y)*dy)/length)):0
    const worldT=t*p.depth/((1-t)*q.depth+t*p.depth)
    const point=new Vector3(a.x,a.y,a.z).lerp(new Vector3(b.x,b.y,b.z),worldT)
    return {point,pixels:Math.hypot(x-p.x-dx*t,y-p.y-dy*t),distance:point.distanceTo(camera.position)}
  }
  const visiblePoint=(point:Point3)=>{const p=screenPoint(point);if(!p.visible)return false;const hit=contentHit(p.x,p.y)
    return !hit||hit.distance>=new Vector3(point.x,point.y,point.z).distanceTo(camera.position)-.018}
  const planeHit=(elevation:number)=>{
    plane.constant=-elevation;const hit=raycaster.ray.intersectPlane(plane,new Vector3());if(!hit)return null
    const distance=hit.distanceTo(camera.position)
    return Number.isFinite(distance)&&distance>=camera.near&&distance<=camera.far?hit:null
  }
  return {ray,pickOwner,ignored,wireMeshes,contentHit,screenPoint,segmentHit,visiblePoint,planeHit}
}
