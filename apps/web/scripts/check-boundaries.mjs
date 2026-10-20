/** AST/import-graph architecture gate. Run from apps/web; optional source root is for fixture tests. */
import { existsSync,readFileSync,readdirSync,statSync } from 'node:fs'
import { dirname,extname,resolve,relative } from 'node:path'
import ts from 'typescript'
import { parse as parseSfc } from '@vue/compiler-sfc'

const root=resolve(process.argv[2]??'src'),files=new Map(),violations=new Set()
const label=file=>relative(root,file).replaceAll('\\','/')
const report=(policy,trace,reason)=>violations.add(`${policy}: ${trace.map(file=>files.has(file)?label(file):file).join(' -> ')}: ${reason}`)
function walk(directory) {
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    if(entry.isDirectory()&&!['node_modules','.git','.test-build'].includes(entry.name))walk(resolve(directory,entry.name))
    else if(entry.isFile()&&/\.(?:ts|js|mjs|vue)$/.test(entry.name)) {
      const file=resolve(directory,entry.name),text=readFileSync(file,'utf8')
      let source=text,sfcSources=[]
      if(extname(file)==='.vue') {
        const parsed=parseSfc(text,{filename:file})
        if(parsed.errors.length)throw new Error(`Invalid SFC ${label(file)}: ${parsed.errors[0]}`)
        const scripts=[parsed.descriptor.script,parsed.descriptor.scriptSetup].filter(Boolean)
        source=scripts.map(script=>script.content).join('\n');sfcSources=scripts.flatMap(script=>script.src?[script.src]:[])
      }
      files.set(file,{source:ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),edges:sfcSources.map(spec=>({spec,runtime:true})),dynamic:false,globals:[]})
    }
  }
}
if(!existsSync(root)||!statSync(root).isDirectory())throw new Error(`Source root does not exist: ${root}`)
walk(root)
if(!files.size)throw new Error('No source files found; refusing an empty boundary check.')
const globals=new Set(['fetch','WebSocket','XMLHttpRequest','window','document','localStorage','sessionStorage','indexedDB','navigator'])
const networkGlobals=new Set(['fetch','WebSocket','XMLHttpRequest'])
function globalAccess(node) {
  if(ts.isIdentifier(node))return {root:node,path:[]}
  if(ts.isPropertyAccessExpression(node)) {
    const base=globalAccess(node.expression)
    return base?{root:base.root,path:[...base.path,node.name.text]}:null
  }
  if(ts.isElementAccessExpression(node)&&node.argumentExpression&&ts.isStringLiteralLike(node.argumentExpression)) {
    const base=globalAccess(node.expression)
    return base?{root:base.root,path:[...base.path,node.argumentExpression.text]}:null
  }
  return null
}
function identifierReference(node) {
  const parent=node.parent
  if((ts.isPropertyAccessExpression(parent)&&parent.name===node)||ts.isQualifiedName(parent)||ts.isImportSpecifier(parent)||ts.isExportSpecifier(parent))return false
  if(parent.name===node&&!ts.isShorthandPropertyAssignment(parent))return false
  return true
}
for(const item of files.values()) {
  const edge=(literal,runtime)=>{if(literal&&ts.isStringLiteralLike(literal))item.edges.push({spec:literal.text,runtime})}
  const visit=node=>{
    if(ts.isImportDeclaration(node)) {
      const clause=node.importClause,bindings=clause?.namedBindings
      const runtime=!clause||!clause.isTypeOnly&&!(bindings&&ts.isNamedImports(bindings)&&!clause.name&&bindings.elements.length>0&&bindings.elements.every(part=>part.isTypeOnly))
      edge(node.moduleSpecifier,runtime)
    } else if(ts.isExportDeclaration(node)&&node.moduleSpecifier) {
      const runtime=!node.isTypeOnly&&!(node.exportClause&&ts.isNamedExports(node.exportClause)&&node.exportClause.elements.length>0&&node.exportClause.elements.every(part=>part.isTypeOnly))
      edge(node.moduleSpecifier,runtime)
    } else if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))edge(node.argument.literal,false)
    else if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference))edge(node.moduleReference.expression,!node.isTypeOnly)
    else if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')) {
      if(node.arguments.length===1&&ts.isStringLiteralLike(node.arguments[0]))edge(node.arguments[0],true)
      else item.dynamic=true
    }
    if(ts.isIdentifier(node)&&globals.has(node.text)&&identifierReference(node))item.globals.push({node,name:node.text})
    if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)) {
      const access=globalAccess(node),name=access?.path.at(-1)
      if(access&&name&&['globalThis','window','self','global'].includes(access.root.text)&&globals.has(name)) {
        item.globals.push({node:access.root,name:[access.root.text,...access.path].join('.')})
      }
    }
    ts.forEachChild(node,visit)
  }
  visit(item.source)
}
function local(from,spec) {
  if(!spec.startsWith('.')&&!spec.startsWith('@/'))return null
  const base=spec.startsWith('@/')?resolve(root,spec.slice(2)):resolve(dirname(from),spec.split('?')[0])
  const candidates=[base,...(base.endsWith('.js')?[base.slice(0,-3)+'.ts']:[]),...['.ts','.vue','.js','.mjs','.d.ts'].map(extension=>base+extension),...['index.ts','index.vue','index.js'].map(name=>resolve(base,name))]
  return candidates.find(file=>files.has(file))??null
}
for(const item of files.values())for(const edge of item.edges) {
  edge.target=local(item.source.fileName,edge.spec)
  if(!edge.target&&(edge.spec.startsWith('.')||edge.spec.startsWith('@/'))&&!/\.(?:json|svg|png|jpe?g|webp|css|gltf|glb|wasm|bin)(?:\?|$)/.test(edge.spec)) {
    report('browser',[item.source.fileName,edge.spec],'unresolved relative source import')
  }
}

// TypeScript binding distinguishes local variables named document/window from
// browser globals. The no-lib program binds scopes without requiring DOM types.
const host=ts.createCompilerHost({noLib:true,noResolve:true,allowJs:true})
host.getSourceFile=file=>files.get(resolve(file))?.source
host.fileExists=file=>files.has(resolve(file));host.readFile=file=>files.get(resolve(file))?.source.text
const program=ts.createProgram([...files.keys()].filter(file=>extname(file)!=='.vue'),{noLib:true,noResolve:true,allowJs:true},host)
const checker=program.getTypeChecker()
const bound=node=>!!checker.getSymbolAtLocation(node)?.declarations?.length
const privateModule=spec=>/(?:hardware[_-]client|hardware-service|contracts\/hardware|rpc_v\d|@grpc|^grpc|^(?:node:)?(?:net|tls|fs|child_process|http|https|http2|dgram)(?:\/|$))/.test(spec)
const pure=file=>/^(?:domain\/|application\/|editor\/PointerGestureSession\.ts$)/.test(label(file))
// Pure number-preserving JSON is the sole external core dependency. New
// packages require an explicit policy decision; a transport package cannot
// bypass the boundary merely by avoiding a known client's package name.
const corePackages=new Set(['lossless-json'])
const coreDependency=(spec,target)=>(!spec.startsWith('.')&&!spec.startsWith('@/')&&!corePackages.has(spec))
  ||!!target&&/^(?:stores|components|composables|three|services\/(?:api|websocket|session|assets))\//.test(label(target))
const rendererDependency=(spec,target)=>/^(?:vue(?:\/|$)|@vue\/|pinia(?:\/|$)|axios(?:\/|$)|undici(?:\/|$)|socket\.io|ws$)/.test(spec)
  ||privateModule(spec)||!!target&&/^(?:stores|services\/(?:api|websocket))\//.test(label(target))
function traverse(start,policy,reject,checkGlobals=null) {
  const visited=new Set()
  const visit=(file,trace)=>{
    if(visited.has(file))return
    visited.add(file);const item=files.get(file)
    if(item.dynamic)report(policy,trace,'nonliteral dynamic import is not auditable')
    if(checkGlobals)for(const global of item.globals)if(checkGlobals.has(global.name.split('.').at(-1))&&!bound(global.node))report(policy,trace,`browser/network global ${global.name}`)
    for(const edge of item.edges) {
      if(reject(edge.spec,edge.target))report(policy,[...trace,edge.target??edge.spec],`forbidden dependency ${edge.spec}`)
      else if(edge.target)visit(edge.target,[...trace,edge.target])
    }
  }
  visit(start,[start])
}
for(const [file,item] of files) {
  if(pure(file))traverse(file,'core',coreDependency,globals)
  if(label(file).startsWith('three/'))traverse(file,'renderer',rendererDependency,networkGlobals)
  for(const edge of item.edges)if(privateModule(edge.spec)||edge.target&&privateModule(label(edge.target)))report('browser',[file,edge.target??edge.spec],'private hardware/RPC client')
}
for(const start of files.keys())if(label(start).startsWith('stores/')) {
  const visited=new Set(),path=[]
  const visit=file=>{
    const at=path.indexOf(file)
    if(at>=0) {
      const cycle=[...path.slice(at),file]
      if(cycle.some(item=>label(item).startsWith('stores/')))report('store cycle',cycle,'runtime import cycle')
      return
    }
    if(visited.has(file))return
    visited.add(file);path.push(file)
    if(files.get(file).dynamic)report('store',path,'nonliteral dynamic import is not auditable')
    for(const edge of files.get(file).edges)if(edge.runtime&&edge.target)visit(edge.target)
    path.pop()
  }
  visit(start)
}
for(const violation of [...violations].sort())console.log(violation)
if(violations.size)process.exitCode=1
else console.log(`Web AST boundaries PASS (${files.size} source modules)`)
