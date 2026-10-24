import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {getArtifactDirectory} from './artifact-paths.mjs'

async function targetModule() {
  assert.ok(existsSync(new URL('./e2e-interface-target.mjs',import.meta.url)), 'Remote must own the explicit Interface product target adapter.')
  return import('./e2e-interface-target.mjs')
}
test('an integrated browser gate requires an explicit product and cannot fall back to retained Web',async()=>{
  const {interfaceProduct}=await targetModule()
  assert.throws(()=>interfaceProduct({}),/NETCIRCUIT_INTERFACE_ROOT/)
  assert.throws(()=>interfaceProduct({NETCIRCUIT_INTERFACE_ROOT:'apps/web'}),/absolute/)
})
test('the product target validates the pinned browser toolchain before backend startup',async()=>{
  const {interfaceProduct}=await targetModule()
  const directory=getArtifactDirectory('interface-target-'+randomUUID())
  await mkdir(resolve(directory,'scripts'))
  await writeFile(resolve(directory,'package.json'),JSON.stringify({scripts:{'test:e2e':'node scripts/e2e.mjs test'},devDependencies:{'@playwright/test':'1.64.1'}}))
  await writeFile(resolve(directory,'scripts/e2e.mjs'),'')
  assert.equal(interfaceProduct({NETCIRCUIT_INTERFACE_ROOT:directory}),directory)
  await writeFile(resolve(directory,'package.json'),JSON.stringify({devDependencies:{'@playwright/test':'1.0.0'}}))
  assert.throws(()=>interfaceProduct({NETCIRCUIT_INTERFACE_ROOT:directory}),/Playwright 1.64.1/)
})
test('Interface specialized configs inherit external output and reporter controls',async()=>{
  const {readFile}=await import('node:fs/promises')
  const directory=process.env.NETCIRCUIT_INTERFACE_ROOT
  assert.ok(directory,'Pass the explicit extracted product to policy verification.')
  for(const name of ['camera','depth']) {
    const source=await readFile(resolve(directory,`playwright.${name}.config.ts`),'utf8')
    assert.match(source,/import base from ['"]\.\/playwright.config['"]/,name)
    assert.doesNotMatch(source,/outputDir\s*:\s*['"]\.test-build/,name)
  }
})

test('Remote consumes every output form and adopts one session before child startup',async()=>{
  const input=getArtifactDirectory('interface-output-input-'+randomUUID())
  await mkdir(resolve(input,'scripts'))
  await writeFile(resolve(input,'package.json'),JSON.stringify({devDependencies:{'@playwright/test':'1.64.1'}}))
  await writeFile(resolve(input,'scripts/e2e.mjs'),'')
  const originalSession=process.env.NETCIRCUIT_ARTIFACTS_SESSION
  const originalMarker=readFileSync(resolve(originalSession,'.netcircuit-artifact-session.json'),'utf8')
  const moduleUrl=new URL('./e2e-interface-target.mjs',import.meta.url).href
  const invoke=(args,overrides={})=>spawnSync(process.execPath,['--input-type=module','-e',`
    import {prepareInterfaceRun} from ${JSON.stringify(moduleUrl)};
    const args=JSON.parse(process.argv[1]);const selected=prepareInterfaceRun(args);
    console.log(JSON.stringify({...selected,args,environment:Object.fromEntries(
      ['NETCIRCUIT_ARTIFACTS_SESSION','NETCIRCUIT_ARTIFACTS_CONTEXT','TMP','TEMP','TMPDIR','npm_config_cache']
      .map(key=>[key,process.env[key]]))}));`,JSON.stringify(args)],{
    encoding:'utf8',env:{...process.env,NETCIRCUIT_INTERFACE_ROOT:input,...overrides},windowsHide:true})
  for(const flag of ['--output','--output=','-o','-o=']) {
    const parent=resolve(originalSession,'interface-output-parent-'+randomUUID())
    const args=flag.endsWith('=')?[flag+parent,'--forbid-only']:[flag,parent,'--forbid-only']
    const result=invoke(args)
    assert.equal(result.status,0,result.stderr)
    const selected=JSON.parse(result.stdout)
    assert.deepEqual(selected.args,['--forbid-only'])
    assert.equal(selected.product,input,'an exported input from the inherited session remains admitted')
    assert.notEqual(selected.session,originalSession)
    assert.equal(resolve(selected.session,'..'),parent)
    assert.equal(selected.environment.NETCIRCUIT_ARTIFACTS_SESSION,selected.session)
    assert.deepEqual(JSON.parse(selected.environment.NETCIRCUIT_ARTIFACTS_CONTEXT),JSON.parse(process.env.NETCIRCUIT_ARTIFACTS_CONTEXT))
    for(const name of ['TMP','TEMP','TMPDIR'])assert.equal(selected.environment[name],resolve(selected.session,'tmp'))
    assert.equal(selected.environment.npm_config_cache,resolve(selected.session,'npm-cache'))
  }
  for(const args of [['--output'],['-o='],['--output',fileURLToPath(new URL('..',import.meta.url))],['--output','--forbid-only']]) {
    const result=invoke(args)
    assert.notEqual(result.status,0,'missing/unsafe output must fail in preflight')
  }
  const unused=resolve(originalSession,'unallocated-output-'+randomUUID())
  for(const overrides of [
    {NETCIRCUIT_ARTIFACTS_SESSION:dirname(originalSession)},
    {NETCIRCUIT_ARTIFACTS_CONTEXT:JSON.stringify({...JSON.parse(process.env.NETCIRCUIT_ARTIFACTS_CONTEXT),owner:'different-owner'})},
  ]) {
    const result=invoke(['--output',unused],overrides)
    assert.notEqual(result.status,0,'new output must not bypass inherited-session validation')
    assert.equal(existsSync(unused),false,'invalid input ownership must fail before output allocation')
  }
  assert.equal(readFileSync(resolve(originalSession,'.netcircuit-artifact-session.json'),'utf8'),originalMarker)
})
