import { Group,Mesh,Texture,type BufferGeometry,type Material } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { AssetProvider,type AssetDescriptor,type AssetLoader } from '../../application/assets/AssetProvider'
import { disposeObject } from '../../three/ObjectResources'

interface ClosableImage { close():void }
export interface ImportedModel { root:Group; ownedImages:Set<ClosableImage> }
function images(root:Group) {
  const owned=new Set<ClosableImage>()
  root.traverse(object=>{
    if(!(object instanceof Mesh)) return
    for(const material of Array.isArray(object.material)?object.material:[object.material]) for(const value of Object.values(material)) {
      if(value instanceof Texture) {const image:unknown=value.image;if(image&&typeof image==='object'&&'close' in image&&typeof image.close==='function') owned.add(image as ClosableImage)}
    }
  })
  return owned
}
function dispose(resource:ImportedModel) {
  disposeObject(resource.root);resource.root.clear()
  for(const image of resource.ownedImages) image.close()
  resource.ownedImages.clear()
}
function clone(resource:ImportedModel):ImportedModel {
  const root=resource.root.clone(true),geometries=new Map<BufferGeometry,BufferGeometry>(),materials=new Map<Material,Material>(),textures=new Map<Texture,Texture>()
  const copyMaterial=(original:Material)=>{
    let result=materials.get(original)
    if(!result) {
      result=original.clone();materials.set(original,result)
      for(const [key,value] of Object.entries(result)) if(value instanceof Texture) {
        let texture=textures.get(value);if(!texture) {texture=value.clone();textures.set(value,texture)}
        Reflect.set(result,key,texture)
      }
    }
    return result
  }
  root.traverse(object=>{
    if(!(object instanceof Mesh)) return
    const original=object.geometry as BufferGeometry
    let geometry=geometries.get(original)
    if(!geometry) {geometry=original.clone();geometries.set(original,geometry)}
    object.geometry=geometry
    object.material=Array.isArray(object.material)?object.material.map(copyMaterial):copyMaterial(object.material)
  })
  // Decoded image bitmaps belong to the shared template until the last lease.
  return {root,ownedImages:new Set()}
}
async function readBounded(response:Response,maximum:number,signal:AbortSignal) {
  const declared=response.headers.get('Content-Length')
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>maximum)) {
    await response.body?.cancel();throw new Error('Imported model exceeds its byte bound.')
  }
  const reader=response.body?.getReader();if(!reader) throw new Error('Imported model response is empty.')
  const chunks:Uint8Array[]=[];let length=0
  const cancel=()=>{void reader.cancel().catch(()=>undefined)}
  signal.addEventListener('abort',cancel,{once:true})
  try {
    while(true) {
      const {done,value}=await reader.read()
      if(signal.aborted) throw new Error('Imported model loading was cancelled.')
      if(done) break
      length+=value.byteLength
      if(length>maximum) {await reader.cancel();throw new Error('Imported model exceeds its byte bound.')}
      chunks.push(value)
    }
  } finally {signal.removeEventListener('abort',cancel);reader.releaseLock()}
  const bytes=new Uint8Array(length);let offset=0
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length}
  return bytes.buffer
}

export function createGltfAssetLoader(options:{fetcher?:typeof fetch;parse?:(bytes:ArrayBuffer)=>Promise<Group>;decodeTimeoutMs?:number;fetchTimeoutMs?:number}={}):AssetLoader<ImportedModel> {
  const parse=options.parse??(async(bytes:ArrayBuffer)=>(await new GLTFLoader().parseAsync(bytes,'')).scene)
  return {clone,dispose,async load(asset:AssetDescriptor,signal:AbortSignal) {
    if(!/^[a-f0-9]{64}$/.test(asset.revision)) throw new Error('Imported model revision must be its SHA-256 digest.')
    const request=new AbortController(),abort=()=>request.abort()
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted) request.abort()
    const timeout=setTimeout(()=>request.abort(),options.fetchTimeoutMs??15_000)
    let bytes:ArrayBuffer
    try {
      const response=await (options.fetcher??globalThis.fetch)(asset.url,{signal:request.signal,credentials:'same-origin'})
      if(!response.ok) {await response.body?.cancel();throw new Error('Imported model request failed: '+response.status)}
      const media=response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
      if(media!=='model/gltf-binary'&&media!=='application/octet-stream') {await response.body?.cancel();throw new Error('Imported model response has an unexpected media type.')}
      bytes=await readBounded(response,asset.maxBytes,request.signal)
      const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes)
      const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')
      if(actual!==asset.revision) throw new Error('Imported model revision integrity check failed.')
    } finally {clearTimeout(timeout);signal.removeEventListener('abort',abort)}
    if(signal.aborted) throw new Error('Imported model loading was cancelled.')
    return new Promise<ImportedModel>((resolve,reject)=>{
      let settled=false
      const cancel=()=>{if(!settled) {settled=true;clearTimeout(timer);reject(new Error('Imported model decoding was cancelled.'))}}
      const timer=setTimeout(()=>{if(!settled) {settled=true;signal.removeEventListener('abort',cancel);reject(new Error('Imported model decoding exceeded its time bound.'))}},options.decodeTimeoutMs??15_000)
      signal.addEventListener('abort',cancel,{once:true});if(signal.aborted) cancel()
      void Promise.resolve().then(()=>parse(bytes)).then(root=>{
        const resource={root,ownedImages:images(root)}
        if(settled) {dispose(resource);return}
        settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);resolve(resource)
      },error=>{if(!settled) {settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(error)}})
    })
  }}
}
export function createInstrumentAssetProvider(options:Parameters<typeof createGltfAssetLoader>[0]={}) {
  return new AssetProvider(createGltfAssetLoader(options),{maxEntries:2,maxReferences:8})
}
