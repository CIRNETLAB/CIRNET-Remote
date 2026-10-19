/** Check changed evidence paths, including the index. Never deletes files. */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const visual = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.zip'])
const generatedRoots = /(^|\/)(?:\.test-build|playwright-report|test-results|blob-report)(\/|$)|^docs\/verification\//
const approvedInputs = /^(?:assets\/|apps\/web\/(?:public\/models|src\/assets)\/|(?:tests|contracts)\/(?:.*\/)?fixtures\/|device-library\/|docs\/(?:design|references)\/)/
const legacy = JSON.parse(readFileSync(new URL('./legacy-verification-evidence.json', import.meta.url), 'utf8')).sha256
export function artifactViolation(path) {
  if (path === 'scripts/legacy-verification-evidence.json') return undefined // reviewed policy data, never generated output
  const extension = extname(path).toLowerCase()
  if (['.md', '.markdown'].includes(extension)) return undefined
  if (generatedRoots.test(path)) return 'generated verification output; store outside the repository'
  if (visual.has(extension) && !approvedInputs.test(path)) return 'visual/binary output without approved source-asset or baseline provenance; review its role explicitly'
  if (extension === '.html' && !/^apps\/web\/(?:index\.html$|(?:function-generator|oscilloscope)-preview\.html$|e2e\/[^/]+-harness\.html$|public\/)/.test(path)) return 'HTML/report output without approved source-input provenance'
  if (/(^|\/)(?:trace\.zip|junit\.xml|.*(?:benchmark|evidence|diagnostic).*\.(?:json|html|log))$/i.test(path) && !approvedInputs.test(path)) return 'raw verification diagnostic output'
}
export function contentViolation(path, contents) {
  if (/\.(md|markdown|html)$/i.test(path) && /data\s*:\s*(?:image|video)\//i.test(contents)) return 'embedded data-URI visual evidence is not permitted'
  if (/\.json$/i.test(path) && !approvedInputs.test(path) && /"(?:screenshots|capturedAtUtc|backend_log|latency_by_operation)"\s*:/.test(contents)) return 'raw generated verification metrics/evidence'
}
export function changedPaths(root, base) {
  const git = (...args) => execFileSync('git', ['-c', 'core.safecrlf=false', '-C', root, ...args], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean)
  const paths = new Set([
    ...git('diff', '--name-only', '-z', '--diff-filter=ACMRTUXB'),
    ...git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRTUXB'),
    ...git('ls-files', '--others', '--exclude-standard', '-z'),
  ])
  if (base) for (const path of git('diff', base, 'HEAD', '--name-only', '-z', '--diff-filter=ACMRTUXB')) paths.add(path)
  return [...paths].sort()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args.splice(index, 2)[1] }
    const root = resolve(option('--root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'))
    const base = option('--base')
    if (args.length) throw new Error('Usage: [--base COMMIT] [--root CHECKOUT]')
    const gitBytes = (...args) => execFileSync('git', ['-C', root, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const gitText = (...args) => gitBytes(...args).toString('utf8')
    const violations = changedPaths(root, base).map(path => {
      if (legacy[path]) {
        const versions = []
        if (existsSync(resolve(root, path))) versions.push(readFileSync(resolve(root, path)))
        try { versions.push(gitBytes('show', ':' + path)) } catch { /* untracked */ }
        if (base) { try { versions.push(gitBytes('show', 'HEAD:' + path)) } catch { /* deleted */ } }
        // Git text checkout conversion may use CRLF on Windows. The baseline
        // hashes the original Git blob; normalize only those JSON text files.
        if (versions.length && versions.every(bytes => createHash('sha256').update(path.endsWith('.json') ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes).digest('hex') === legacy[path])) return [path, undefined]
      }
      let reason = artifactViolation(path)
      if (!reason && /\.(md|markdown|html|json)$/i.test(path)) {
        const contents = []
        if (existsSync(resolve(root, path))) contents.push(readFileSync(resolve(root, path), 'utf8'))
        // Read index content independently: restoring the worktree cannot hide it.
        try { contents.push(gitText('show', ':' + path)) } catch { /* untracked */ }
        if (base) { try { contents.push(gitText('show', 'HEAD:' + path)) } catch { /* deleted */ } }
        reason = contents.map(content => contentViolation(path, content)).find(Boolean)
      }
      return [path, reason]
    }).filter(([, reason]) => reason)
    for (const [path, reason] of violations) console.log(`artifact-check: ERROR: ${path}: ${reason}`)
    if (violations.length) process.exitCode = 1
    else console.log('artifact-check: PASS (worktree + index' + (base ? ' + committed diff' : '') + ')')
  } catch (error) { console.error(`artifact-check: ${error.message}`); process.exitCode = 1 }
}
