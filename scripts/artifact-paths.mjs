/** Remote compatibility adapter to the independently installed DEV allocator. */
import {readFileSync,realpathSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {resolve,dirname,relative,isAbsolute} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

const root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'))
const cache=resolve(root,'.build/contracts-tools')
let allocator
try {
  const pin=JSON.parse(readFileSync(resolve(root,'integration/contracts-version.json'),'utf8')).dev
  const metadata=JSON.parse(readFileSync(resolve(cache,'allocator.json'),'utf8'))
  const resource=realpathSync(resolve(cache,'allocator.mjs'))
  const position=relative(cache,resource)
  if(isAbsolute(position)||position.startsWith('..'))throw Error('Allocator cache resource escaped its compilation directory.')
  const digest=createHash('sha256').update(readFileSync(resource)).digest('hex')
  if(metadata.name!==pin.name||metadata.version!==pin.version||metadata.sha256!==pin.node_sha256||digest!==pin.node_sha256)throw Error('Allocator cache does not match the pinned DEV wheel.')
  allocator=await import(pathToFileURL(resource).href)
} catch(error) {
  throw Error(`DEV allocator unavailable or corrupt: ${error.message} Run python scripts/install_contracts.py --dev-only with the pinned DEV wheel manifest before verification.`)
}
const context=value=>value===undefined&&!process.env.NETCIRCUIT_ARTIFACTS_CONTEXT?{owner:`git:${root}`,roots:[root]}:value
export function getArtifactContext(options={}) { return allocator.getArtifactContext({...options,context:context(options.context)}) }
export function getArtifactDirectory(subdirectory='',options={}) { return allocator.getArtifactDirectory(subdirectory,{...options,context:context(options.context)}) }
export function validateArtifactDirectory(directory,options={}) { return allocator.validateArtifactDirectory(directory,{...options,context:context(options.context)}) }
export function cleanupArtifactSession(directory,options={}) { return allocator.cleanupArtifactSession(directory,{...options,context:context(options.context)}) }
export function runArtifactCli(args=process.argv.slice(2)) {
  const selected=[...args]
  if(!selected.includes('--context')&&!process.env.NETCIRCUIT_ARTIFACTS_CONTEXT)selected.push('--context',JSON.stringify(context()))
  return allocator.runArtifactCli(selected)
}
export const runCli=runArtifactCli
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runArtifactCli()
