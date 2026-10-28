/** Bootstrap-safe consumer of the pinned DEV allocator's ownership policy. */
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const [command,session,...extra] = process.argv.slice(2)
if (command !== '--cleanup' || !session || extra.length) {
  throw Error('Usage: node scripts/cleanup-artifact-session.mjs --cleanup SESSION')
}
const context = process.env.NETCIRCUIT_ARTIFACTS_CONTEXT
if (!context) throw Error('Canonical artifact context is required for cleanup.')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const published = process.env.NETCIRCUIT_ARTIFACTS_CLI
let cli
if (published) {
  const pin = JSON.parse(readFileSync(resolve(root, 'integration/contracts-version.json'), 'utf8')).dev.node_sha256
  const digest = createHash('sha256').update(readFileSync(published)).digest('hex')
  if (digest !== pin) throw Error('Published allocator CLI differs from the pinned DEV resource.')
  cli = published
} else {
  // This adapter verifies its own materialized resource pin. A failed published
  // CLI validation never reaches this branch.
  cli = resolve(root, 'scripts/artifact-paths.mjs')
}
const child = spawnSync(process.execPath, [cli, '--cleanup', session, '--context', context], {stdio:'inherit'})
if (child.error) throw child.error
process.exit(child.status ?? 1)
