import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const cli = resolve(dirname(fileURLToPath(import.meta.url)), 'check-verification-artifacts.mjs')
test('checks unstaged and staged generated evidence without rejecting product assets or Markdown', () => {
  const repo = mkdtempSync(join(tmpdir(), 'netcircuit-artifact-git-test-'))
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  const write = (path, value) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), value) }
  const check = (...args) => spawnSync(process.execPath, [cli, '--root', repo, ...args], { encoding: 'utf8' })
  try {
    git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'fixture')
    write('docs/verification/legacy.png', 'historical'); git('add', '.'); git('commit', '-qm', 'baseline fixture')
    assert.equal(check().status, 0, 'unchanged historical output is separately inventoried')
    const retained='docs/verification/ribbon-shell/after-file.png'
    write(retained,readFileSync(resolve(dirname(cli),'..',retained)))
    const retainedJson='docs/verification/ribbon-shell/source-hashes.json'
    write(retainedJson,readFileSync(resolve(dirname(cli),'..',retainedJson)))
    git('add',retained,retainedJson);git('commit','-qm','retain exact pre-policy evidence')
    assert.equal(check('--base','HEAD~1').status,0,'preserved original bytes do not block a refactor PR')
    write(retained,'modified old evidence')
    assert.equal(check().status,1,'the legacy list cannot exempt modifications')
    git('restore','--',retained)
    write('apps/web/public/models/product/texture.png', 'legitimate asset')
    write('tests/fixtures/golden/approved.png', 'approved input')
    write('tests/fixtures/golden/before.png', 'approved historical fixture')
    write('assets/Image_sample/interface_1.png', 'user reference')
    write('apps/web/oscilloscope-preview.html', '<html><canvas></canvas></html>')
    write('docs/verification/results.md', 'Markdown evidence')
    assert.equal(check().status, 0)
    write('apps/web/public/screenshot.png','unapproved output')
    assert.match(check().stdout,/public\/screenshot.png/)
    rmSync(join(repo,'apps/web/public/screenshot.png'))
    write('docs/verification/results.md', '![embedded](data:image/png;base64,AAAA)')
    git('add', 'docs/verification/results.md')
    write('docs/verification/results.md', 'Markdown evidence')
    assert.match(check().stdout, /embedded|data.URI/i)
    git('reset', '-q', 'HEAD', '--', 'docs/verification/results.md')
    write('reports/index.html', '<html><img src="data:image/png;base64,AAAA"></html>')
    assert.match(check().stdout, /index.html/)
    rmSync(join(repo, 'reports'), { recursive: true })
    write('docs/verification/new-evidence.json', '{}')
    assert.equal(check().status, 1)
    git('add', 'docs/verification/new-evidence.json')
    // A staged image is still rejected if its worktree content is restored.
    write('docs/verification/legacy.png', 'new screenshot'); git('add', 'docs/verification/legacy.png')
    write('docs/verification/legacy.png', 'historical')
    const staged = check(); assert.equal(staged.status, 1); assert.match(staged.stdout, /legacy.png/)
    git('commit', '-qm', 'bad fixture commit')
    assert.equal(check('--base', 'HEAD~1').status, 1)
    write('misc/unreviewed-screenshot.png', 'unknown provenance')
    assert.match(check().stdout, /unreviewed-screenshot/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
