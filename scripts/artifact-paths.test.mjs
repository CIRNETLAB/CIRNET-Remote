import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'scripts/artifact-paths.mjs')
const environment = () => {
  const env = { ...process.env }
  delete env.NETCIRCUIT_ARTIFACTS_DIR
  delete env.NETCIRCUIT_ARTIFACTS_SESSION
  return env
}
function invoke(args = [], options = {}) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: environment(), cwd: root, ...options })
}

test('default output is external, writable and independent of working directory', () => {
  const sessions = []
  try {
    for (const cwd of [root, join(root, 'apps/web')]) {
      const result = invoke(['screenshots'], { cwd })
      assert.equal(result.status, 0, result.stderr)
      const directory = result.stdout.trim(); const session = dirname(directory)
      sessions.push(session)
      const path = relative(root, realpathSync(directory))
      assert.ok(isAbsolute(path) || path === '..' || path.startsWith('..\\') || path.startsWith('../'))
      writeFileSync(join(directory, 'actual-evidence.txt'), 'created outside the repository')
      assert.ok(existsSync(join(directory, 'actual-evidence.txt')))
    }
    assert.notEqual(sessions[0], sessions[1])
  } finally {
    for (const session of sessions) assert.equal(invoke(['--cleanup', session]).status, 0)
  }
})

test('rejects repository, nested repository outputs and Git administration directories before writing', () => {
  const git = (flag) => execFileSync('git', ['rev-parse', flag], { cwd: root, encoding: 'utf8' }).trim()
  for (const directory of [root, join(root, 'docs/verification/new-output'), resolve(root, git('--git-dir')), resolve(root, git('--git-common-dir'))]) {
    const result = invoke([], { env: { ...environment(), NETCIRCUIT_ARTIFACTS_DIR: directory } })
    assert.notEqual(result.status, 0, directory)
    assert.match(result.stderr, /outside|repository|Git/)
  }
})

test('canonicalizes existing symlinks, rejects traversal and shares only the inherited session', () => {
  const external = mkdtempSync(join(tmpdir(), 'netcircuit-path-test-'))
  let session
  try {
    symlinkSync(root, join(external, 'checkout'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.notEqual(invoke(['--directory', join(external, 'checkout/not-created')]).status, 0)
    assert.ok(!existsSync(join(root, 'not-created')))
    const first = invoke([], { env: { ...environment(), NETCIRCUIT_ARTIFACTS_DIR: external } })
    assert.equal(first.status, 0, first.stderr); session = first.stdout.trim()
    const inherited = { ...environment(), NETCIRCUIT_ARTIFACTS_SESSION: session }
    assert.equal(invoke(['screens'], { env: inherited }).stdout.trim(), join(session, 'screens'))
    assert.notEqual(invoke(['../escape'], { env: inherited }).status, 0)
    mkdirSync(join(session, 'links'))
    symlinkSync(root, join(session, 'links/repo'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.notEqual(invoke(['links/repo/forbidden'], { env: inherited }).status, 0)
  } finally {
    if (session) assert.equal(invoke(['--cleanup', session]).status, 0)
    rmSync(external, { recursive: true, force: true })
  }
})

test('cleanup refuses unowned folders and symlink substitutions and preserves neighboring data', () => {
  const external = mkdtempSync(join(tmpdir(), 'netcircuit-cleanup-test-'))
  let session
  try {
    writeFileSync(join(external, 'user-data.txt'), 'keep')
    assert.notEqual(invoke(['--cleanup', external]).status, 0)
    const first = invoke(['--directory', external]); assert.equal(first.status, 0, first.stderr)
    session = first.stdout.trim()
    const link = join(external, 'alias')
    symlinkSync(session, link, process.platform === 'win32' ? 'junction' : 'dir')
    assert.notEqual(invoke(['--cleanup', link]).status, 0)
    assert.equal(invoke(['--cleanup', session]).status, 0); session = undefined
    assert.ok(existsSync(join(external, 'user-data.txt')))
  } finally {
    if (session) invoke(['--cleanup', session])
    rmSync(external, { recursive: true, force: true })
  }
})
