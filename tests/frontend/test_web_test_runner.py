from tests.support.release_inputs import interface_root
"""The real Node test harness must stay bounded on small CI runners."""
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[2]
RUNNER=interface_root() / 'scripts/test.mjs'


def run_fixtures(directory,count,*,failing=False):
    (directory/'tests').mkdir()
    (directory/'workers.mjs').write_text('''
import { mkdir, readFile, writeFile, rmdir } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
export async function record(id, delta) {
  for (;;) {
    try { await mkdir('workers.lock'); break }
    catch (error) { if (error.code !== 'EEXIST') throw error; await setTimeout(5) }
  }
  try {
    let state = { active: 0, maximum: 0, completed: [] }
    try { state = JSON.parse(await readFile('workers.json', 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    state.active += delta; state.maximum = Math.max(state.maximum, state.active)
    if (delta < 0) state.completed.push(id)
    await writeFile('workers.json', JSON.stringify(state))
  } finally { await rmdir('workers.lock') }
}
''',encoding='utf-8')
    for index in range(count):
        (directory/'tests'/f'case-{index:02}.test.ts').write_text(f'''
import test from 'node:test'
import assert from 'node:assert/strict'
import {{ setTimeout }} from 'node:timers/promises'
import {{ record }} from '../workers.mjs'
test('fixture {index}', async () => {{
  await record({index}, 1)
  try {{ await setTimeout(150); assert.equal({str(failing and index==0).lower()}, false) }}
  finally {{ await record({index}, -1) }}
}})
''',encoding='utf-8')
    result=subprocess.run([shutil.which('node') or 'node',str(RUNNER)],cwd=directory,
        env={**os.environ,'FORCE_COLOR':'0'},capture_output=True,text=True,timeout=90)
    return result,json.loads((directory/'workers.json').read_text(encoding='utf-8'))


def test_runner_executes_every_batch_without_exceeding_two_concurrent_workers(tmp_path):
    result,state=run_fixtures(tmp_path,17)
    assert result.returncode==0,result.stdout+result.stderr
    assert state['active']==0 and sorted(state['completed'])==list(range(17))
    assert state['maximum']<=2,f"CI worker limit exceeded: {state['maximum']} workers"
    events=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{"phase":')]
    batches=[event['files'] for event in events if event['phase']=='build-tests']
    assert sum(batches)==17 and max(batches)<=8,batches


def test_runner_returns_failure_for_a_real_failing_test(tmp_path):
    result,state=run_fixtures(tmp_path,1,failing=True)
    assert result.returncode!=0
    assert state['active']==0 and state['completed']==[0]
    assert 'fixture 0' in result.stdout+result.stderr
