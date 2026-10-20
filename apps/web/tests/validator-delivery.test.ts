import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {build as buildVite} from 'vite'

test('production main entry does not eagerly import any complete validator registry',async()=>{
  const result=await buildVite({configFile:'vite.config.ts',logLevel:'silent',build:{write:false,reportCompressedSize:false,minify:false}})
  const builds=Array.isArray(result)?result:[result]
  const chunks=builds.flatMap(output=>'output' in output?output.output:[]).filter(output=>output.type==='chunk')
  const outputs=new Map(chunks.map(chunk=>[chunk.fileName,chunk]))
  const entry=chunks.find(chunk=>chunk.isEntry&&chunk.facadeModuleId?.replaceAll('\\','/').endsWith('/index.html'))
    ??chunks.find(chunk=>chunk.isEntry)
  assert.ok(entry,'the production browser entry must exist')
  const eager=new Set<string>()
  const walk=(name:string)=>{if(eager.has(name))return;eager.add(name);for(const target of outputs.get(name)?.imports??[])walk(target)}
  walk(entry.fileName)
  const inputs=[...eager].flatMap(name=>outputs.get(name)?.moduleIds??[]).map(name=>name.replaceAll('\\','/'))
  assert.ok(!inputs.some(name=>/generated\/validators(?:\.(?:editor|structural))?\.js$/.test(name)),inputs.filter(name=>name.includes('validators')).join('\n'))
  assert.ok(chunks.some(chunk=>chunk.dynamicImports.length),'remaining validators must be reachable through explicit workflow loading')
})

test('cold offline authored workflows validate local configuration and assignment references without full profile preparation',async()=>{
  const outfile=resolve('.test-build/cold-authored-workflows.mjs')
  await build({stdin:{contents:`
    import {strict as assert} from 'node:assert'
    import {parseLab} from './src/contracts/validation'
    import {parseAuthoringDefinition} from './src/application/assignments/authoring'
    import {buildPreRunConfiguration} from './src/application/instruments/configuration'
    import {stationFixture} from './tests/helpers/station'
    parseLab('CaptureConfiguration',{signals:[],duration_ns:1000})
    parseLab('ClockConfiguration',{signal:'CLK',period_ns:1000,cycles:1})
    parseLab('GeneratorConfiguration',{channel:1,waveform:'SINE',frequency_hz:1000,amplitude_vpp:1,offset_v:0,enabled:false})
    parseLab('TestVector',{time_ns:0,inputs:{x:1}})
    buildPreRunConfiguration({capture:{signals:[],duration_ns:1000},clock:null,generators:[],testVectors:[]},stationFixture().capabilities)
    const graph={schema_version:'1.2',circuit_id:'reference',modules:[],connections:[]}
    const definition={schema_version:'2.0',assignment_id:'cold-assignment',title:'Offline reference',assessment_policy:'FUNCTIONAL_ONLY',lab_endpoints:[],reference_design_graph:graph}
    assert.equal(parseAuthoringDefinition(JSON.stringify(definition)).reference_design_graph.schema_version,'1.2')
    assert.throws(()=>parseLab('InventedUnknownContract',{}),error=>error.issues[0].code==='UNKNOWN_CONTRACT')
  `,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external'})
  const result=spawnSync(process.execPath,[outfile],{encoding:'utf8'})
  assert.equal(result.status,0,result.stderr+result.stdout)
})
