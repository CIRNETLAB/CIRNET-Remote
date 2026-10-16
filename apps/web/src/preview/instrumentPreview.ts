import { AmbientLight,CanvasTexture,Color,DirectionalLight,GridHelper,Group,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene,SRGBColorSpace,WebGLRenderer } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { instrumentAssets,type InstrumentAssetKind } from '../data/instrumentAssets'
import { createInstrumentAssetProvider } from '../services/assets/gltfAssets'
import { addFunctionGeneratorModel } from '../three/FunctionGeneratorModel'
import { drawInstrumentArtwork,generatorScreenArtwork } from '../three/FunctionGeneratorArtwork'
import { addOscilloscopeModel } from '../three/OscilloscopeModel'
import { drawScopeArtwork,scopeScreenArtwork } from '../three/OscilloscopeArtwork'
import { disposeObject } from '../three/ObjectResources'

const kind:InstrumentAssetKind=document.body.dataset.instrument==='generator'?'generator':'oscilloscope'
const scope=kind==='oscilloscope',targetY=scope?1.9:1.8
const status=document.querySelector<HTMLElement>('#status')!,testButton=document.querySelector<HTMLButtonElement>('#canvas-test')!
const renderer=new WebGLRenderer({antialias:true})
renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.append(renderer.domElement)
const scene=new Scene();scene.background=new Color('#111b24')
const grid=new GridHelper(16,32,'#425967','#263945');scene.add(grid)
const camera=new PerspectiveCamera(32,innerWidth/innerHeight,.1,100);camera.position.set(-4.2,4,9)
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,targetY,0);controls.update()
scene.add(new AmbientLight('#d8e9fa',1.1))
const key=new DirectionalLight('#fff4e5',targetY);key.position.set(-4,8,7);scene.add(key)
const fill=new DirectionalLight('#a9d8f8',.75);fill.position.set(5,3,-4);scene.add(fill)
let active=true,fallback:Group|null=null,screen:Mesh|null=null,dynamic:CanvasTexture|null=null
const render=()=>{if(active) renderer.render(scene,camera)}
const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);render()}
const listeners:{button:HTMLButtonElement;handler:()=>void}[]=[]
function view(selector:string,position:readonly[number,number,number]) {
  const button=document.querySelector<HTMLButtonElement>(selector)!
  const handler=()=>{camera.position.set(...position);controls.target.set(0,targetY,0);controls.update();render()}
  listeners.push({button,handler});button.addEventListener('click',handler)
}
view('#front-view',[0,targetY,11.6]);view('#side-view',[11.6,targetY,0]);view('#angled-view',[-4.2,4,9])
controls.addEventListener('change',render);window.addEventListener('resize',resize);resize()

function screenMesh(root:Group) {
  const object=root.getObjectByName('screen')
  if(!(object instanceof Mesh)||!(object.material instanceof MeshBasicMaterial)) throw new Error('Imported instrument has no supported named screen.')
  return object
}
function paintScreen() {
  if(!active||!screen||!(screen.material instanceof MeshBasicMaterial)) return
  if(!dynamic) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=scope?704:768
    dynamic=new CanvasTexture(canvas);dynamic.colorSpace=SRGBColorSpace
    // The exported glTF screen keeps image-top V=0; procedural models use V=1.
    dynamic.flipY=renderer.domElement.dataset.assetSource!=='imported'
    screen.material.map?.dispose();screen.material.map=dynamic;screen.material.needsUpdate=true
  }
  const context=(dynamic.image as HTMLCanvasElement).getContext('2d')
  if(!context) {status.textContent='CanvasTexture is unavailable in this browser.';return}
  if(scope) drawScopeArtwork(context,scopeScreenArtwork())
  else drawInstrumentArtwork(context,generatorScreenArtwork())
  dynamic.needsUpdate=true;render();status.textContent='CanvasTexture applied to named screen mesh'
}
testButton.addEventListener('click',paintScreen)

const provider=createInstrumentAssetProvider(),descriptor=instrumentAssets[kind]
const lease=provider.acquire({...descriptor,url:import.meta.env.BASE_URL.replace(/\/$/,'')+descriptor.url})
async function load() {
  try {
    const imported=await lease.ready
    if(!active) return
    screen=screenMesh(imported.root);scene.add(imported.root)
    renderer.domElement.dataset.assetSource='imported'
    status.textContent=scope?'GLB loaded · 3 BNC · 7 knob pivots':'GLB loaded · 3 BNC · centered encoder pivot'
  } catch {
    lease.release()
    if(!active) return
    fallback=new Group()
    if(scope) addOscilloscopeModel(fallback)
    else addFunctionGeneratorModel(fallback)
    screen=screenMesh(fallback);scene.add(fallback)
    renderer.domElement.dataset.assetSource='procedural'
    status.textContent='Procedural fallback · imported GLB unavailable'
  }
  testButton.disabled=false;render()
}
function dispose() {
  if(!active) return
  active=false;testButton.disabled=true
  window.removeEventListener('resize',resize);window.removeEventListener('pagehide',dispose)
  controls.removeEventListener('change',render);controls.dispose()
  for(const {button,handler} of listeners) button.removeEventListener('click',handler)
  testButton.removeEventListener('click',paintScreen)
  // Leases own imported resources, including a replacement CanvasTexture.
  lease.release();provider.dispose()
  if(fallback) {disposeObject(fallback);fallback.clear()}
  disposeObject(grid);scene.clear();renderer.dispose()
  screen=null;dynamic=null;fallback=null
}
window.addEventListener('pagehide',dispose,{once:true})
void load()
