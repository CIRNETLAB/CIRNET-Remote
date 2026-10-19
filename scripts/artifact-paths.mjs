/** Shared verification output allocator. Never writes evidence into a checkout. */
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync, lstatSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, relative, isAbsolute, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const marker = '.netcircuit-artifact-session.json'
const sessions = new Map()
function canonical(path) {
  const absolute = resolve(path)
  if (existsSync(absolute)) return realpathSync(absolute)
  const parent = dirname(absolute)
  if (parent === absolute) throw new Error(`Cannot resolve artifact path: ${absolute}`)
  return join(canonical(parent), basename(absolute))
}
function inside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')))
}
function protectedPaths() {
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', windowsHide: true }).trim()
  // Fail closed if Git cannot enumerate sibling worktrees or administrative paths.
  const worktrees = git('worktree', 'list', '--porcelain', '-z').split('\0').filter(line => line.startsWith('worktree ')).map(line => line.slice(9))
  return [...new Set([repository, git('rev-parse', '--absolute-git-dir'), resolve(repository, git('rev-parse', '--git-common-dir')), ...worktrees].map(canonical))]
}
export function validateArtifactDirectory(directory) {
  if (!isAbsolute(directory)) throw new Error('Artifact directory must be absolute and outside the repository.')
  const result = canonical(directory)
  for (const protectedPath of protectedPaths()) {
    if (inside(protectedPath, result)) throw new Error(`Artifact directory must be outside every repository/worktree and Git directory: ${directory}`)
  }
  return result
}
function readSession(directory) {
  const actual = validateArtifactDirectory(directory)
  if (resolve(directory) !== actual || lstatSync(actual).isSymbolicLink()) throw new Error('Artifact session cannot be a symlink alias.')
  const ownership = JSON.parse(readFileSync(join(actual, marker), 'utf8'))
  if (ownership.version !== 1 || ownership.directory !== actual || ownership.repository !== canonical(repository) || !/^netcircuit-[A-Za-z0-9]+$/.test(basename(actual))) {
    throw new Error('Refusing an unowned artifact session.')
  }
  return actual
}
export function getArtifactDirectory(subdirectory = '', options = {}) {
  if (process.env.NETCIRCUIT_ARTIFACTS_DIR) validateArtifactDirectory(process.env.NETCIRCUIT_ARTIFACTS_DIR)
  let session
  if (!options.directory && process.env.NETCIRCUIT_ARTIFACTS_SESSION) {
    session = readSession(process.env.NETCIRCUIT_ARTIFACTS_SESSION)
  } else {
    const parent = validateArtifactDirectory(options.directory ?? process.env.NETCIRCUIT_ARTIFACTS_DIR ?? tmpdir())
    session = sessions.get(parent)
    if (!session) {
      mkdirSync(parent, { recursive: true })
      // Recheck after creation; a pre-existing symlink must never redirect output.
      const checked = validateArtifactDirectory(parent)
      session = realpathSync(mkdtempSync(join(checked, 'netcircuit-')))
      writeFileSync(join(session, marker), JSON.stringify({ version: 1, directory: session, repository: canonical(repository), id: randomUUID(), createdAt: new Date().toISOString() }) + '\n', { flag: 'wx' })
      sessions.set(parent, session)
    }
    if (!options.directory) process.env.NETCIRCUIT_ARTIFACTS_SESSION = session
  }
  if (isAbsolute(subdirectory) || subdirectory.split(/[\\/]/).includes('..')) throw new Error('Artifact subdirectory must stay inside its session.')
  const output = validateArtifactDirectory(join(session, subdirectory))
  if (!inside(session, output)) throw new Error('Artifact subdirectory escapes its session.')
  mkdirSync(output, { recursive: true })
  if (!inside(session, validateArtifactDirectory(output))) throw new Error('Artifact output changed while creating it.')
  return output
}
export function cleanupArtifactSession(directory) {
  const session = readSession(directory)
  // rm does not follow directory symlinks within the owned session.
  rmSync(session, { recursive: true, force: false })
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args[0] === '--validate') {
      if (args.length !== 2) throw new Error('Usage: --validate EXTERNAL_DIRECTORY')
      console.log(validateArtifactDirectory(args[1]))
    } else if (args[0] === '--cleanup') {
      if (args.length !== 2) throw new Error('Usage: --cleanup SESSION')
      cleanupArtifactSession(args[1])
    } else {
      const index = args.indexOf('--directory')
      const directory = index >= 0 ? args.splice(index, 2)[1] : undefined
      if (args.length > 1 || (index >= 0 && !directory)) throw new Error('Usage: [subdirectory] [--directory EXTERNAL_PARENT]')
      console.log(getArtifactDirectory(args[0], { directory }))
    }
  } catch (error) {
    console.error(`artifact-paths: ${error.message}`)
    process.exitCode = 1
  }
}
