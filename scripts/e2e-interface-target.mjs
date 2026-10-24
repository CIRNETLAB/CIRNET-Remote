import {existsSync,readFileSync,realpathSync} from 'node:fs'
import {isAbsolute,resolve,relative} from 'node:path'
import {getArtifactDirectory,getArtifactContext} from './artifact-paths.mjs'

/** An exported Interface product is executable input, never an implicit sibling. */
export function interfaceProduct(environment=process.env) {
  const configured=environment.NETCIRCUIT_INTERFACE_ROOT
  if(!configured)throw new Error('NETCIRCUIT_INTERFACE_ROOT must explicitly select an extracted Interface product; retained apps/web is not a fallback.')
  if(!isAbsolute(configured))throw new Error('NETCIRCUIT_INTERFACE_ROOT must be an absolute product path.')
  const directory=realpathSync(configured)
  const manifest=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'))
  if(manifest.devDependencies?.['@playwright/test']!=='1.64.1')throw new Error('The Interface product must retain pinned Playwright 1.64.1.')
  if(!existsSync(resolve(directory,'scripts/e2e.mjs')))throw new Error('The Interface product has no browser launcher.')
  return directory
}

/** Admit input under its inherited context before selecting new output. */
export function prepareInterfaceRun(args) {
  let output
  for(let index=0;index<args.length;) {
    const argument=args[index]
    if(!['--output','-o'].includes(argument)&&!argument.startsWith('--output=')&&!argument.startsWith('-o=')){index++;continue}
    if(output!==undefined)throw new Error('Select only one --output/-o directory.')
    const equals=argument.indexOf('=')
    const value=equals===-1?args[index+1]:argument.slice(equals+1)
    if(!value||value.startsWith('-'))throw new Error('--output/-o requires an external output directory.')
    output=resolve(value)
    args.splice(index,equals===-1?2:1)
  }
  const product=interfaceProduct(),context=getArtifactContext()
  // A released product in the verified input session stays admitted even when
  // all new runtime state is directed to a different session.
  const inherited=process.env.NETCIRCUIT_ARTIFACTS_SESSION?getArtifactDirectory():undefined
  if(!context.roots.includes(product)) {
    const position=inherited?relative(inherited,product):'..'
    if(isAbsolute(position)||position==='..'||position.startsWith('../')||position.startsWith('..\\'))
      throw new Error('Include the Interface checkout in NETCIRCUIT_ARTIFACTS_CONTEXT before allocating the integrated session.')
  }
  const session=output===undefined?getArtifactDirectory():getArtifactDirectory('',{directory:output})
  process.env.NETCIRCUIT_ARTIFACTS_SESSION=session
  process.env.NETCIRCUIT_ARTIFACTS_CONTEXT=JSON.stringify(context)
  const temporary=getArtifactDirectory('tmp')
  process.env.TMP=temporary;process.env.TEMP=temporary;process.env.TMPDIR=temporary
  process.env.npm_config_cache=getArtifactDirectory('npm-cache')
  return {product,context,session}
}
