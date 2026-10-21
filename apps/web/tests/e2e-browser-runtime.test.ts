import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,writeFile,readFile,readdir,lstat,symlink} from 'node:fs/promises'
import {join} from 'node:path'
import {randomBytes,createHash} from 'node:crypto'
import {copyBrowserRuntime} from '../scripts/e2e-browser-runtime.mjs'

// Keep the allocator's own import.meta rooted in its original module after the
// unit harness bundles this test. Every fixture byte starts outside Git paths.
const {getArtifactDirectory}=await import(new URL('../../../scripts/artifact-paths.mjs',import.meta.url).href)
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
async function fixture(){
 const owned=getArtifactDirectory('brt-'+randomBytes(4).toString('hex')) as string
 const source=join(owned,'cache'),destination=join(owned,'runtime')
 await mkdir(source,{recursive:true});await mkdir(destination)
 return {owned,source,destination}
}
function boundaryDestination(executableLength:number){
 const name='path-boundary-'+randomBytes(4).toString('hex')
 const padding=executableLength-join(getArtifactDirectory(),name,'browser-1','browser.exe').length
 assert.ok(padding>=0,'The external artifact parent must leave room for the Windows launch-path boundary.')
 const destination=getArtifactDirectory(name+'x'.repeat(padding)) as string
 assert.equal(join(destination,'browser-1','browser.exe').length,executableLength)
 return destination
}

test('browser runtime copy preserves installed binaries, revision directories and resource markers while excluding prior logs',async()=>{
 const h=await fixture(),runtime=join(h.source,'chromium_headless_shell-1248','platform-shell')
 await mkdir(runtime,{recursive:true});await mkdir(join(h.source,'.links'))
 const binary=Buffer.from([0,1,2,3,255,254,17])
 await writeFile(join(runtime,'browser.exe'),binary)
 await writeFile(join(runtime,'resource.pak'),'pinned resources')
 await writeFile(join(h.source,'chromium_headless_shell-1248','INSTALLATION_COMPLETE'),'')
 await writeFile(join(runtime,'debug.log'),'historical GPU diagnostic')
 await writeFile(join(runtime,'CHROME_DEBUG.LOG'),'historical browser diagnostic')
 await writeFile(join(h.source,'.links','installed-package'),'source link')
 const original=digest(await readFile(join(runtime,'browser.exe')))
 assert.equal(await copyBrowserRuntime(h.source,h.destination),h.destination)
 const copied=join(h.destination,'chromium_headless_shell-1248','platform-shell')
 assert.equal(digest(await readFile(join(copied,'browser.exe'))),original)
 assert.equal(await readFile(join(copied,'resource.pak'),'utf8'),'pinned resources')
 assert.equal((await lstat(join(h.destination,'chromium_headless_shell-1248','INSTALLATION_COMPLETE'))).isFile(),true)
 assert.deepEqual((await readdir(copied)).sort(),['browser.exe','resource.pak'])
 assert.deepEqual(await readdir(h.destination),['chromium_headless_shell-1248'])
 assert.equal(await readFile(join(runtime,'debug.log'),'utf8'),'historical GPU diagnostic')
 assert.equal(digest(await readFile(join(runtime,'browser.exe'))),original)
 // A hardcoded executable-relative logger now writes to the external copy.
 await writeFile(join(copied,'debug.log'),'new GPU diagnostic')
 assert.equal(await readFile(join(runtime,'debug.log'),'utf8'),'historical GPU diagnostic')
})

test('runtime cache includes all installed public browser and helper directories',async()=>{
 const h=await fixture()
 for(const name of ['chromium-1248','chromium_headless_shell-1248','ffmpeg-1013','winldd-1007']){
  await mkdir(join(h.source,name));await writeFile(join(h.source,name,'artifact.bin'),name)
 }
 await copyBrowserRuntime(h.source,h.destination)
 assert.deepEqual((await readdir(h.destination)).sort(),['chromium-1248','chromium_headless_shell-1248','ffmpeg-1013','winldd-1007'].sort())
})

test('runtime resources are dereferenced into owned output instead of retaining links to the install cache',async t=>{
 const h=await fixture(),resources=join(h.owned,'resources'),runtime=join(h.source,'browser-1')
 await mkdir(resources);await mkdir(runtime);await writeFile(join(resources,'gpu.bin'),'pinned GPU resource')
 try{await symlink(resources,join(runtime,'linked-resources'),process.platform==='win32'?'junction':'dir')}
 catch(error){if(['EPERM','EACCES','ENOTSUP'].includes((error as NodeJS.ErrnoException).code??'')){t.skip('This host cannot create a directory symlink.');return}throw error}
 await copyBrowserRuntime(h.source,h.destination)
 const copied=join(h.destination,'browser-1','linked-resources')
 assert.equal((await lstat(copied)).isSymbolicLink(),false)
 assert.equal(await readFile(join(copied,'gpu.bin'),'utf8'),'pinned GPU resource')
 await writeFile(join(copied,'gpu.bin'),'owned copy changed')
 assert.equal(await readFile(join(resources,'gpu.bin'),'utf8'),'pinned GPU resource')
})

test('missing or empty browser cache fails closed before a source-runtime fallback can be used',async()=>{
 const h=await fixture()
 await assert.rejects(copyBrowserRuntime(join(h.owned,'missing'),h.destination),/cache is unavailable/)
 await mkdir(join(h.source,'.links'))
 await assert.rejects(copyBrowserRuntime(h.source,h.destination),/cache is empty/)
 assert.deepEqual(await readdir(h.destination),[])
})

test('Windows accepts a copied executable path at the 259-character boundary',async()=>{
 const h=await fixture(),runtime=join(h.source,'browser-1')
 await mkdir(runtime);await writeFile(join(runtime,'browser.exe'),'pinned browser')
 const destination=boundaryDestination(259)
 assert.equal(await copyBrowserRuntime(h.source,destination,{platform:'win32'}),destination)
 assert.equal(await readFile(join(destination,'browser-1','browser.exe'),'utf8'),'pinned browser')
})

test('Windows rejects a 260-character copied executable path before publishing runtime files',async()=>{
 const h=await fixture(),runtime=join(h.source,'browser-1')
 await mkdir(runtime);await writeFile(join(runtime,'browser.exe'),'pinned browser')
 const tooLong=boundaryDestination(260)
 assert.ok(join(tooLong,'browser-1','browser.exe').length>259)
 await assert.rejects(copyBrowserRuntime(h.source,tooLong,{platform:'win32'}),/shorter.*NETCIRCUIT_ARTIFACTS_DIR/)
 assert.deepEqual(await readdir(tooLong),[],'Preflight must fail before copying any installed runtime.')
})
