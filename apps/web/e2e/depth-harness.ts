import {WebGLRenderer,PCFSoftShadowMap,Vector3,Mesh,Box3,REVISION,Raycaster,Vector2} from 'three'
import {createSceneManager} from '../src/three/SceneManager'
import {getPartForType,historicalPartCatalog,physicalDescriptorForPart,getPartForModule} from '../src/data/partCatalog'
import type {CircuitGraph,CircuitModule} from '../src/types/circuit'
const canvas=document.querySelector('canvas')!,renderer=new WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true})
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFSoftShadowMap
let frames=0,trustedRightDrags=0
const manager=createSceneManager({renderer,canvas,onRender(){frames++}})
manager.resize(innerWidth,innerHeight);addEventListener('resize',()=>manager.resize(innerWidth,innerHeight))
canvas.addEventListener('pointerdown',event=>{if(event.isTrusted&&event.button===2)trustedRightDrags++})
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info')
const snapshot=()=>{renderer.render(manager.scene,manager.camera);const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p}
const frame=()=>new Promise<void>(resolve=>{manager.requestRender();requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))})
let graph:CircuitGraph,selected='DISPLAY'
function fixture(historical=false){
 const types=[['DISPLAY','SEGMENT_SC5611EWA',0,0],['DOUBLE','SEGMENT_DC5611EWA',1.5,0],['QUAD','SEGMENT_CC5612EWA',3,0],['SCOPE','OSCILLOSCOPE',-5,-5],['GEN','GENERATOR',4,-5],['PSU','POWER_SUPPLY',9,-5]] as const
 const modules:CircuitModule[]=[{id:'BOARD',type:'BREADBOARD',position:{x:0,y:0,z:0}}]
 for(const[id,type,x,z]of types){const part=historical?historicalPartCatalog.find(p=>p.editorType===type)??getPartForType(type):getPartForType(type);modules.push({id,type,position:{x,y:0,z},...(part?{physicalDescriptor:physicalDescriptorForPart(part)}:{})})}
 graph={schema_version:'1.2',circuit_id:'depth-native',modules,connections:[]} as CircuitGraph;manager.syncGraph(graph);renderer.shadowMap.needsUpdate=true;return graph
}
function pose(id:string,distance=30,azimuth=0,elevation=45){selected=id;const model=manager.models.get(id);if(!model)throw Error(`Missing ${id}`);const center=new Box3().setFromObject(model).getCenter(new Vector3());manager.resetView();manager.pan(center.x,center.z);const phi=elevation*Math.PI/180,theta=azimuth*Math.PI/180;manager.camera.position.copy(center).add(new Vector3(Math.sin(theta)*Math.cos(phi),Math.sin(phi),Math.cos(theta)*Math.cos(phi)).multiplyScalar(distance));manager.camera.up.set(0,elevation>=89.999?0:1,elevation>=89.999?-1:0);manager.camera.lookAt(center);manager.camera.updateMatrixWorld();manager.requestRender()}
function metadata(){const c=manager.camera;return{threeRevision:REVISION,webglVersion:gl.getParameter(gl.VERSION),backend:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),depthBits:gl.getParameter(gl.DEPTH_BITS),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],dpr:renderer.getPixelRatio(),near:c.near,far:c.far,position:c.position.toArray(),quaternion:c.quaternion.toArray(),frames,trustedRightDrags,graph}}
function polygon(mesh:Mesh,front:boolean,pad=.04){mesh.geometry.computeBoundingBox();mesh.updateWorldMatrix(true,false);const b=mesh.geometry.boundingBox!,p=pad;const points=front?[[b.min.x+p,b.min.y+p,b.max.z],[b.max.x-p,b.min.y+p,b.max.z],[b.max.x-p,b.max.y-p,b.max.z],[b.min.x+p,b.max.y-p,b.max.z]]:[[b.min.x+p,b.max.y,b.min.z+p],[b.max.x-p,b.max.y,b.min.z+p],[b.max.x-p,b.max.y,b.max.z-p],[b.min.x+p,b.max.y,b.max.z-p]];return points.map(p=>{const v=new Vector3(...p as[number,number,number]).applyMatrix4(mesh.matrixWorld).project(manager.camera);return[(v.x+1)*gl.drawingBufferWidth/2,(v.y+1)*gl.drawingBufferHeight/2]})}
function inside(x:number,y:number,poly:number[][]){let odd=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])odd=!odd}return odd}
async function leaks(id=selected,glyphs=false){
 const model=manager.models.get(id)!,names=id==='SCOPE'?['horizontal_panel','trigger_panel','vertical_panel','screen']:id==='GEN'?['function_panel','screen']:id==='PSU'?['supply-front','control-strip','supply-display']:id==='BOARD'?['breadboard-artwork']:['package-display-face']
 const fronts:Mesh[]=[];if(glyphs)model.traverse(o=>{if(o instanceof Mesh&&o.userData.segment)fronts.push(o)});else fronts.push(...names.map(name=>model.getObjectByName(name)).filter((v):v is Mesh=>v instanceof Mesh))
 if(!fronts.length)return{tested:0,changed:0,regions:[]}
 const regions=id==='BOARD'?[-1.25,-.98,-.83,.83,.98,1.25].map(z=>{const mesh=fronts[0];mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox!;return[[b.min.x+.4,z-.015],[b.max.x-.4,z-.015],[b.max.x-.4,z+.015],[b.min.x+.4,z+.015]].map(([x,z])=>{const v=new Vector3(x,b.max.y,z).applyMatrix4(mesh.matrixWorld).project(manager.camera);return[(v.x+1)*gl.drawingBufferWidth/2,(v.y+1)*gl.drawingBufferHeight/2]})}):fronts.map(mesh=>{const front=id==='SCOPE'||id==='GEN'||id==='PSU'||Math.abs(mesh.matrixWorld.elements[9])>.5;mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox!,pad=glyphs?Math.min(b.max.x-b.min.x,front?b.max.y-b.min.y:b.max.z-b.min.z)*.15:.04;return polygon(mesh,front,pad)}),original=snapshot()
 // Mutate the existing material in place: cloning changes opaque sort IDs.
 const saved=new Map<any,{color:any;emissive:any;intensity:number}>(),marked=new Set<Mesh>(),callbacks=new Map<Mesh,Mesh['onBeforeRender']>()
 model.traverse(o=>{if(!(o instanceof Mesh))return;const mark=glyphs?o.name==='package-display-face':id==='SCOPE'?(names.some(name=>o.name===`${name}_rim`)||o.name==='screen_recess'):id==='GEN'?['function_panel_rim','screen_recess'].includes(o.name):id==='PSU'?['supply-bezel','display-recess'].includes(o.name):id==='BOARD'?o.userData.breadboardDeck===true:o.name==='package-body';if(!mark)return;marked.add(o);for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(saved.has(mat)||!('color'in mat))continue;saved.set(mat,{color:mat.color.clone(),emissive:mat.emissive?.clone(),intensity:mat.emissiveIntensity})}})
 // Refresh only per-draw uniforms, keeping original material IDs and sort order.
 model.traverse(o=>{if(!(o instanceof Mesh)||(Array.isArray(o.material)?o.material:[o.material]).every(mat=>!saved.has(mat)))return;const previous=o.onBeforeRender;callbacks.set(o,previous);o.onBeforeRender=function(...args){previous.apply(this,args);const mat=args[4] as any,state=saved.get(mat);if(!state)return;const diagnostic=marked.has(this);mat.color.copy(state.color);if(diagnostic)mat.color.set('#ff00ff');if(state.emissive){mat.emissive.copy(state.emissive);mat.emissiveIntensity=state.intensity;if(diagnostic){mat.emissive.set('#ff00ff');mat.emissiveIntensity=1}}mat.needsUpdate=true}})
 const colored=snapshot(),raycaster=new Raycaster(),ndc=new Vector2(),opaque:Mesh[]=[]
 model.traverse(o=>{if(!(o instanceof Mesh)||!o.visible)return;for(let p=o.parent;p;p=p.parent)if(!p.visible)return;const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>m.visible&&m.depthTest&&m.depthWrite&&(!m.transparent||m.opacity>=.99)))opaque.push(o)})
 let tested=0,changed=0
 const minX=Math.max(0,Math.floor(Math.min(...regions.flat().map(p=>p[0])))),maxX=Math.min(gl.drawingBufferWidth,Math.ceil(Math.max(...regions.flat().map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...regions.flat().map(p=>p[1])))),maxY=Math.min(gl.drawingBufferHeight,Math.ceil(Math.max(...regions.flat().map(p=>p[1]))))
 for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){if(!regions.some(poly=>inside(x+.5,y+.5,poly)))continue;tested++;const i=(y*gl.drawingBufferWidth+x)*4;if(Math.max(Math.abs(original[i]-colored[i]),Math.abs(original[i+1]-colored[i+1]),Math.abs(original[i+2]-colored[i+2]))>35){
 // CPU rays only mask legitimate foreground controls; evidence remains actual GPU pixels.
 ndc.set((x+.5)/gl.drawingBufferWidth*2-1,(y+.5)/gl.drawingBufferHeight*2-1);raycaster.setFromCamera(ndc,manager.camera)
 const hit=raycaster.intersectObjects(opaque,false)[0]
 // Erode foreground edges by two physical pixels to exclude MSAA sample coverage.
 if(hit&&fronts.includes(hit.object as Mesh)&&(id==='BOARD'?[[-2,0],[2,0],[0,-2],[0,2],[-.125,-.375],[.375,-.125],[-.375,.125],[.125,.375],[-.49,-.49],[.49,-.49],[-.49,.49],[.49,.49]]:[[-2,0],[2,0],[0,-2],[0,2]]).every(([dx,dy])=>{ndc.set((x+.5+dx)/gl.drawingBufferWidth*2-1,(y+.5+dy)/gl.drawingBufferHeight*2-1);raycaster.setFromCamera(ndc,manager.camera);return raycaster.intersectObjects(opaque,false)[0]?.object===hit.object}))changed++
 }}
 for(const[mesh,callback]of callbacks)mesh.onBeforeRender=callback
 for(const[mat,state]of saved){mat.color.copy(state.color);if(state.emissive){mat.emissive.copy(state.emissive);mat.emissiveIntensity=state.intensity}mat.needsUpdate=true}
 snapshot();return{tested,changed,regions}
}

function setOn(on:boolean){
 const levels:Record<string,number>={}
 for(const module of graph.modules){const part=getPartForModule(module);if(part?.package.family!=='seven-segment')continue;const cathode=part.package.pins.some(pin=>pin.name.startsWith('CC'));for(const pin of part.package.pins){if(/^(CC|CA)\d*$/.test(pin.name))levels[`${module.id}.${pin.id}`]=pin.name.startsWith('CC')?0:1;else if(/^[a-g](\d+)?$|^DP(\d+)?$/.test(pin.name))levels[`${module.id}.${pin.id}`]=on?(cathode?1:0):(cathode?0:1)}}
 manager.setSimulationStates(Object.fromEntries(graph.modules.map(module=>[module.id,{state:on?'ON':'OFF'}])),levels)
 let lit=0;manager.scene.traverse(o=>{if(o instanceof Mesh&&o.userData.segment)for(const mat of Array.isArray(o.material)?o.material:[o.material])if('emissiveIntensity'in mat&&mat.emissiveIntensity>0)lit++});return lit
}
function compareGrid(){
 const c=manager.camera,near=c.near,far=c.far,tight=snapshot();c.near=.005;c.far=150;c.updateProjectionMatrix();const broad=snapshot();manager.grid.visible=false;const hidden=snapshot();manager.grid.visible=true;c.near=near;c.far=far;c.updateProjectionMatrix();snapshot()
 let ink=0,different=0,foregroundChanged=0,foregroundSamples=0
 const dpr=renderer.getPixelRatio(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight
 const region=polygon(manager.models.get('DISPLAY')!.getObjectByName('package-display-face') as Mesh,false)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,fromTop=height-y-1
 if(x>300*dpr&&x<1500*dpr&&fromTop>730*dpr&&fromTop<880*dpr){if(Math.max(...[0,1,2].map(k=>Math.abs(broad[i+k]-hidden[i+k])))>2)ink++;if(Math.max(...[0,1,2].map(k=>Math.abs(broad[i+k]-tight[i+k])))>3)different++}
 if(inside(x+.5,y+.5,region)){foregroundSamples++;if(Math.max(...[0,1,2].map(k=>Math.abs(broad[i+k]-hidden[i+k])))>3)foregroundChanged++}
 }
 return{ink,different,foregroundSamples,foregroundChanged,near,far}
}

async function gridInvariant(){
 const saved=graph,baseline=snapshot(),results=[]
 const stages=[{name:'add',graph:{...saved,modules:[...saved.modules,{id:'DISTANT',type:'GENERATOR',position:{x:100,y:0,z:100}}]}},{name:'move',graph:{...saved,modules:saved.modules.map(module=>module.id==='SCOPE'?{...module,position:{x:-200,y:0,z:100}}:module)}},{name:'delete',graph:{...saved,modules:saved.modules.filter(module=>module.id!=='SCOPE')}},{name:'empty',graph:{...saved,modules:[],connections:[]}}]
 for(const stage of stages){graph=stage.graph as CircuitGraph;manager.syncGraph(graph);await frame();const image=snapshot();let changed=0;for(let y=730;y<880;y++)for(let x=300;x<Math.min(1500,gl.drawingBufferWidth);x++){const i=((gl.drawingBufferHeight-y-1)*gl.drawingBufferWidth+x)*4;if(Math.max(...[0,1,2].map(k=>Math.abs(image[i+k]-baseline[i+k])))>3)changed++}results.push({stage:stage.name,changed,metadata:metadata()})}
 graph=saved;manager.syncGraph(saved);await frame();return results
}
function gridInk(){const visible=snapshot();manager.grid.visible=false;const hidden=snapshot();manager.grid.visible=true;snapshot();let ink=0;for(let i=0;i<visible.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(visible[i+k]-hidden[i+k])))>2)ink++;return ink}

Object.assign(window,{depthHarness:{manager,renderer,fixture,setGraph(next:CircuitGraph){graph=next;manager.syncGraph(next);renderer.shadowMap.needsUpdate=true},pose,metadata,frame,leaks,setOn,compareGrid,gridInvariant,gridInk,setLegacyClips(){manager.camera.near=.005;manager.camera.far=150;manager.camera.updateProjectionMatrix()},setNear(value:number){manager.camera.near=value;manager.camera.updateProjectionMatrix()}}})
fixture();pose('DISPLAY');await frame();renderer.shadowMap.autoUpdate=false;document.body.dataset.ready='true'
