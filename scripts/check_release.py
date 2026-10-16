"""Run named release gates; --show-plan lists exact commands without execution.

The default all group requires a real isolated PostgreSQL test database, Chromium,
and an external writable package workspace. The optional load group is explicit.
"""
import argparse
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
MANDATORY=('contracts','python','web','postgres','browser','package')
GROUPS=(*MANDATORY,'load','all')


def release_plan(groups,package_temporary_root=None):
    selected=(set(MANDATORY) if 'all' in groups else set()) | (set(groups)-{'all'})
    steps=[]
    npm=shutil.which('npm.cmd' if os.name=='nt' else 'npm') or 'npm'
    def add(group,command,cwd='.'):
        steps.append({'group':group,'command':[str(part) for part in command],'cwd':cwd})
    def python(group,*arguments):add(group,[sys.executable,*arguments])
    def pytest(group,*paths):
        target=(ROOT/'.build'/f'pytest-release-{group}').resolve()
        if not target.is_relative_to(ROOT) or target.parent!=ROOT/'.build':
            raise ValueError('Release pytest scratch must stay inside the checkout .build directory.')
        python(group,'-m','pytest','-q',*paths,'--basetemp',target)
    if 'contracts' in selected:
        python('contracts','scripts/check_context.py')
        python('contracts','scripts/generate_hardware_rpc.py')
        for script in ('generate_contracts.py','sync_editor_catalog.py','sync_breadboard_topologies.py'):
            python('contracts','scripts/'+script,'--check')
        python('contracts','scripts/check_public_compatibility.py')
        if 'python' not in selected:pytest('contracts','tests/contracts')
    if 'python' in selected:
        if 'contracts' not in selected:
            python('python','scripts/check_context.py')
            python('python','scripts/generate_hardware_rpc.py')
        pytest('python')
    if 'web' in selected:
        for command in ('check:boundaries','test','build'):
            add('web',[npm,'run',command],'apps/web')
    if 'postgres' in selected:pytest('postgres','services/api/tests/postgres_cases.py')
    if 'browser' in selected:add('browser',[npm,'run','test:e2e'],'apps/web')
    if 'package' in selected:
        command=[sys.executable,'scripts/check_contract_package.py']
        if package_temporary_root:command.extend(['--temporary-root',package_temporary_root])
        add('package',command)
    if 'load' in selected:
        python('load','scripts/benchmark_web_sessions.py','--sessions','50','--concurrency','10','--runs','8',
               '--read-rounds','3','--output','docs/verification/2026-10-16-w8-load.json')
    return steps


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group',action='append',choices=GROUPS)
    parser.add_argument('--show-plan',action='store_true')
    parser.add_argument('--package-temporary-root',type=Path)
    arguments=parser.parse_args(argv)
    steps=release_plan(arguments.group or ['all'],arguments.package_temporary_root)
    if arguments.show_plan:
        print(json.dumps(steps,indent=2));return 0
    if any(step['group']=='postgres' for step in steps) and not os.environ.get('NETCIRCUIT_TEST_POSTGRES_URL'):
        parser.error('NETCIRCUIT_TEST_POSTGRES_URL must name an isolated real PostgreSQL test database; this gate is never skipped.')
    environment={**os.environ,'NETCIRCUIT_E2E_PYTHON':sys.executable}
    began=time.perf_counter()
    for step in steps:
        print(f"[{step['group']}] {shlex.join(step['command'])}",flush=True)
        result=subprocess.run(step['command'],cwd=ROOT/step['cwd'],env=environment)
        if result.returncode:
            print(f"Release gate failed: {step['group']} (exit {result.returncode}).",file=sys.stderr)
            return result.returncode
    print(f'Release gates PASS: {len(steps)} commands in {time.perf_counter()-began:.1f}s.')
    return 0


if __name__=='__main__':raise SystemExit(main())
