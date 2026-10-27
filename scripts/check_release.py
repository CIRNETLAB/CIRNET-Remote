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
import uuid
try:
    from scripts.artifact_paths import artifact_directory
except ModuleNotFoundError:
    from artifact_paths import artifact_directory

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
        target=artifact_directory(f'pytest-release-{group}')
        python(group,'-m','pytest','-q',*paths,'--basetemp',target)
    if 'contracts' in selected:
        python('contracts','scripts/check_context.py')
        python('contracts','-m','scripts.check_contract_consumer')
        python('contracts','-m','scripts.check_simulator_consumer')
        python('contracts','-m','scripts.check_hardware_consumer')
        python('contracts','-m','scripts.check_fpga_consumer')
        for script in ('generate_contracts.py','sync_editor_catalog.py','sync_breadboard_topologies.py'):
            python('contracts','scripts/'+script,'--check')
        python('contracts','scripts/export_openapi.py','--check')
        python('contracts','scripts/check_public_compatibility.py')
        python('contracts','scripts/check_contract_sdk.py')
        if 'python' not in selected:pytest('contracts','tests/contracts')
    if 'python' in selected:
        if 'contracts' not in selected:
            python('python','scripts/check_context.py')
            python('python','-m','scripts.check_contract_consumer')
            python('python','-m','scripts.check_simulator_consumer')
            python('python','-m','scripts.check_hardware_consumer')
            python('python','-m','scripts.check_fpga_consumer')
        pytest('python')
    if 'web' in selected:
        for command in ('check:boundaries','test','build'):
            add('web',[shutil.which('node') or 'node','scripts/check_interface.mjs',command])
    if 'postgres' in selected:pytest('postgres','services/api/tests/postgres_cases.py')
    if 'browser' in selected:
        if not {'contracts','python'} & selected:
            python('browser','-m','scripts.check_simulator_consumer')
            python('browser','-m','scripts.check_hardware_consumer')
        add('browser',[shutil.which('node') or 'node','scripts/e2e-interface.mjs','--forbid-only'])
    if 'package' in selected:
        command=[sys.executable,'scripts/check_contract_package.py']
        if package_temporary_root:command.extend(['--temporary-root',package_temporary_root])
        add('package',command)
    if 'load' in selected:
        python('load','scripts/benchmark_web_sessions.py','--sessions','50','--concurrency','10','--runs','8',
               '--read-rounds','3')
    return steps


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--group',action='append',choices=GROUPS)
    parser.add_argument('--show-plan',action='store_true')
    parser.add_argument('--package-temporary-root',type=Path)
    parser.add_argument('--interface-root',type=Path,help='Explicit extracted Interface product for the Remote-owned browser gate; no retained Web fallback.')
    parser.add_argument('--fpga-root',type=Path,help='Explicit verified extracted FPGA source product; no retained FPGA fallback.')
    parser.add_argument('--fpga-manifest',type=Path,help='Explicit FPGA archive path/SHA256 manifest.')
    arguments=parser.parse_args(argv)
    steps=release_plan(arguments.group or ['all'],arguments.package_temporary_root)
    if arguments.show_plan:
        print(json.dumps(steps,indent=2));return 0
    if any(step['group']=='postgres' for step in steps) and not os.environ.get('NETCIRCUIT_TEST_POSTGRES_URL'):
        parser.error('NETCIRCUIT_TEST_POSTGRES_URL must name an isolated real PostgreSQL test database; this gate is never skipped.')
    # A gate can import a default application as well as explicitly isolated
    # fixtures. Never let those fallback instances open a developer database
    # or use the capture default, even when inherited from the caller's shell.
    runtime=artifact_directory('release-runtime-'+uuid.uuid4().hex)
    environment={**os.environ,'NETCIRCUIT_E2E_PYTHON':sys.executable,
        'NETCIRCUIT_DATABASE_URL':'sqlite:///'+(runtime/'default.sqlite').as_posix(),
        'NETCIRCUIT_CAPTURE_DIR':str(runtime/'captures')}
    if arguments.interface_root:
        if not arguments.interface_root.is_absolute():parser.error('--interface-root must be absolute.')
        environment['NETCIRCUIT_INTERFACE_ROOT']=str(arguments.interface_root)
    for option,key in ((arguments.fpga_root,'NETCIRCUIT_FPGA_ROOT'),(arguments.fpga_manifest,'NETCIRCUIT_FPGA_ARTIFACT_MANIFEST')):
        if option:
            if not option.is_absolute():parser.error('FPGA source selectors must be absolute.')
            environment[key]=str(option)
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
