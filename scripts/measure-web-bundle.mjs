/** Measure actual production eager imports; raw/gzip are distinct from browser timing. */
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {gzipSync} from 'node:zlib'
import {getArtifactDirectory} from './artifact-paths.mjs'

const label=process.argv[2]??'current'
if(!/^[a-z0-9-]+$/i.test(label))throw new Error('Use an alphanumeric measurement label.')
if(!process.env.NETCIRCUIT_INTERFACE_ROOT)throw new Error('Select the independent Interface artifact with NETCIRCUIT_INTERFACE_ROOT.')
const distribution=resolve(process.env.NETCIRCUIT_INTERFACE_ROOT,'dist')
const manifest=JSON.parse(readFileSync(join(distribution,'.vite/manifest.json'),'utf8'))
const visited=new Set()
function walk(key){if(visited.has(key))return;visited.add(key);for(const dependency of manifest[key]?.imports??[])walk(dependency)}
walk('index.html')
const files=[...visited].flatMap(key=>manifest[key]?.file.endsWith('.js')?[manifest[key].file]:[])
const chunks=files.map(file=>{const bytes=readFileSync(join(distribution,file));return {file,raw:bytes.length,gzip:gzipSync(bytes).length}})
const report={label,node:process.version,eagerChunks:chunks,raw:chunks.reduce((sum,item)=>sum+item.raw,0),gzip:chunks.reduce((sum,item)=>sum+item.gzip,0),timing:'NOT_MEASURED: byte counts do not establish parse/bootstrap latency'}
writeFileSync(join(getArtifactDirectory('bundle'),label+'.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
