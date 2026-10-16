import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { BoxGeometry,Group,Mesh,MeshBasicMaterial,Texture } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { instrumentAssets } from '../src/data/instrumentAssets'
import { createGltfAssetLoader,createInstrumentAssetProvider } from '../src/services/assets/gltfAssets'

function response(bytes:Uint8Array) {return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'model/gltf-binary'}})}
test('owned GLB revisions match delivered bytes and the actual decoder produces isolated model leases',async()=>{
  for(const asset of Object.values(instrumentAssets)) {
    const bytes=await readFile(new URL('../public'+asset.url,import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.revision)
    assert.ok(bytes.length<=asset.maxBytes)
    let fetched=0,decoded=0
    const decoder=new GLTFLoader().register(()=>({name:'TEST_PNG_DECODER',loadTexture:()=>Promise.resolve(new Texture())}))
    const provider=createInstrumentAssetProvider({fetcher:async()=>{fetched++;return response(bytes)},parse:async(buffer)=>{decoded++;return (await decoder.parseAsync(buffer,'')).scene}})
    const first=provider.acquire(asset),second=provider.acquire(asset),[one,two]=await Promise.all([first.ready,second.ready])
    assert.equal(fetched,1);assert.equal(decoded,1)
    const body=one.root.getObjectByName('enclosure'),other=two.root.getObjectByName('enclosure')
    assert.ok(body instanceof Mesh&&other instanceof Mesh)
    assert.notEqual(body.geometry,other.geometry);assert.notEqual(body.material,other.material)
    let disposed=0;other.geometry.addEventListener('dispose',()=>disposed++)
    first.release();assert.equal(disposed,0);second.release();assert.equal(disposed,1);provider.dispose()
  }
})

test('integrity, media type and streamed byte bounds reject a model before decoding',async()=>{
  const bytes=new Uint8Array([1,2,3]),revision=createHash('sha256').update(bytes).digest('hex')
  const asset={url:'/asset.glb',revision,maxBytes:3};let parsed=0
  const parse=async()=>{parsed++;return new Group()},signal=new AbortController().signal
  await assert.rejects(createGltfAssetLoader({fetcher:async()=>response(bytes),parse}).load({...asset,revision:'0'.repeat(64)},signal),/integrity/)
  await assert.rejects(createGltfAssetLoader({fetcher:async()=>new Response(bytes,{headers:{'Content-Type':'text/html'}}),parse}).load(asset,signal),/media type/)
  await assert.rejects(createGltfAssetLoader({fetcher:async()=>response(bytes),parse}).load({...asset,maxBytes:2},signal),/byte bound/)
  assert.equal(parsed,0)
})

test('HTTP failures cancel the response stream before releasing request ownership',async()=>{
  let cancelled=0,parsed=0
  const body=new ReadableStream<Uint8Array>({cancel(){cancelled++}})
  const loader=createGltfAssetLoader({fetcher:async()=>new Response(body,{status:503}),parse:async()=>{parsed++;return new Group()}})
  await assert.rejects(loader.load(instrumentAssets.oscilloscope,new AbortController().signal),/request failed: 503/)
  assert.equal(cancelled,1);assert.equal(parsed,0)
})

test('late decode after cancellation is disposed rather than leaked or attached',async()=>{
  const bytes=new Uint8Array([1]),asset={url:'/asset.glb',revision:createHash('sha256').update(bytes).digest('hex'),maxBytes:1}
  let resolve!:(root:Group)=>void,entered!:()=>void
  const started=new Promise<void>(yes=>{entered=yes}),parsed=new Promise<Group>(yes=>{resolve=yes})
  const loader=createGltfAssetLoader({fetcher:async()=>response(bytes),parse:async()=>{entered();return parsed}}),request=new AbortController()
  const loading=loader.load(asset,request.signal);await started
  const cancelled=assert.rejects(loading,/cancel/i);request.abort();await cancelled
  let imageClosures=0
  const texture=new Texture({close(){imageClosures++}} as unknown as TexImageSource)
  const root=new Group(),geometry=new BoxGeometry(),material=new MeshBasicMaterial({map:texture});root.add(new Mesh(geometry,material))
  let disposed=0;geometry.addEventListener('dispose',()=>disposed++);resolve(root)
  await Promise.resolve();await Promise.resolve();await Promise.resolve()
  assert.equal(disposed,1);assert.equal(imageClosures,1);assert.equal(root.children.length,0)
})

test('fetch and decode time bounds reject unfinished work and dispose late decoded resources',async()=>{
  const signal=new AbortController().signal
  const stalledFetch:typeof fetch=async(_url,options)=>new Promise((_resolve,reject)=>options!.signal!.addEventListener('abort',()=>reject(new Error('Fetch was aborted.')),{once:true}))
  await assert.rejects(createGltfAssetLoader({fetcher:stalledFetch,fetchTimeoutMs:5}).load(instrumentAssets.oscilloscope,signal),/aborted/)
  const bytes=new Uint8Array([1]),asset={url:'/asset.glb',revision:createHash('sha256').update(bytes).digest('hex'),maxBytes:1}
  let finish!:(root:Group)=>void
  const parsed=new Promise<Group>(resolve=>{finish=resolve})
  const loading=createGltfAssetLoader({fetcher:async()=>response(bytes),parse:()=>parsed,decodeTimeoutMs:5}).load(asset,signal)
  await assert.rejects(loading,/time bound/)
  const root=new Group(),geometry=new BoxGeometry();root.add(new Mesh(geometry,new MeshBasicMaterial()))
  let disposed=0;geometry.addEventListener('dispose',()=>disposed++);finish(root)
  await Promise.resolve();await Promise.resolve();await Promise.resolve()
  assert.equal(disposed,1)
})
