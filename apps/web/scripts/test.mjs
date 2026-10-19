import { build } from 'esbuild'
import { readdir, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const files = (await readdir('tests')).filter((file) => file.endsWith('.test.ts')).sort()
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
    sourcemap: 'inline',
  })
}
console.log(JSON.stringify({ phase: 'run-tests', files: files.length, concurrency: testConcurrency }))
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${testConcurrency}`, ...files.map((file) => `.test-build/${file.replace('.ts', '.mjs')}`)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
