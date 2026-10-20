import { build } from 'esbuild'
import { readdir, mkdir, readFile } from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {resolve} from 'node:path'
import { spawnSync } from 'node:child_process'

const selected=process.argv.slice(2)
const productContracts=existsSync(resolve('src/contracts/structural.ts'))
const contractProfiles=resolve('tests/helpers/contractProfiles.ts')
if(productContracts&&!existsSync(contractProfiles))throw new Error('Product tests require the offline contract profile preparation helper.')
// The generic batching harness also runs isolated fixture projects. Only the
// real product has synchronous validators that need a prepared test workflow.
const workflowPlugins=productContracts?[{name:'unit-contract-workflow',setup(builder){
  builder.onLoad({filter:/\.test\.ts$/},async args=>({contents:`import ${JSON.stringify(contractProfiles.replaceAll('\\','/'))}\n${await readFile(args.path,'utf8')}`,loader:'ts'}))
}}]:[]
const files = (await readdir('tests')).filter((file) => file.endsWith('.test.ts')&&(!selected.length||selected.includes(file))).sort()
if(!files.length)throw new Error('No matching tests.')
// Inline source maps repeat the large geometry/catalog modules in each bundle.
// Bound both compilation and runtime workers independently of the host CPU count.
const buildBatchSize = 8
const testConcurrency = 2
await mkdir('.test-build', { recursive: true })
for (let offset = 0; offset < files.length; offset += buildBatchSize) {
  const batch = files.slice(offset, offset + buildBatchSize)
  console.log(JSON.stringify({ phase: 'build-tests', files: batch.length, completed: offset, total: files.length }))
  await build({
    entryPoints: batch.map((file) => `tests/${file}`),
    outdir: '.test-build',
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    plugins:workflowPlugins,
    sourcemap: 'inline',
  })
}
console.log(JSON.stringify({ phase: 'run-tests', files: files.length, concurrency: testConcurrency }))
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${testConcurrency}`, ...files.map((file) => `.test-build/${file.replace('.ts', '.mjs')}`)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
