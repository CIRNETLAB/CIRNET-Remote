"""CI test commands must import checkout tools without an ambient PYTHONPATH."""
import os
import json
from pathlib import Path
import shlex
import subprocess
import sys

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(('workflow_name', 'job_name', 'probe'), [
    ('backend.yml', 'test',
     'services/api/tests/test_public_api_contracts.py::test_generated_browser_operations_follow_route_methods_paths_and_binary_media'),
    ('integration.yml', 'repository-contracts',
     'tests/integration/test_session_benchmark.py::test_latency_report_uses_observed_nearest_rank_and_does_not_invent_empty_timings'),
])
def test_ci_pytest_command_can_import_repository_scripts(workflow_name, job_name, probe, tmp_path):
    workflow = yaml.safe_load((ROOT / '.github/workflows' / workflow_name).read_text(encoding='utf-8'))
    environment = {key: value for key, value in os.environ.items() if key != 'PYTHONPATH'}
    environment.update(NETCIRCUIT_DATABASE_URL='sqlite:///' + (tmp_path / 'default.sqlite').as_posix(),
                       NETCIRCUIT_CAPTURE_DIR=str(tmp_path / 'captures'))
    commands = [shlex.split(step['run']) for step in workflow['jobs'][job_name]['steps']
                if 'run' in step and ('pytest -q' in step['run'] or 'check_release.py --group' in step['run'])]
    assert len(commands) == 1, 'CI must have one complete Python collection entrypoint'
    arguments = commands[0]
    if workflow_name == 'integration.yml':
        assert arguments == ['python', 'scripts/check_release.py', '--group', 'python']
        # Inspect the real group rather than replacing the integration gate with
        # a smaller pytest selection. Only the nested import probe is narrowed.
        result = subprocess.run([sys.executable, *arguments[1:], '--show-plan'],
                                cwd=ROOT, env=environment, capture_output=True, text=True, timeout=60)
        assert result.returncode == 0, result.stdout + result.stderr
        plan = json.loads(result.stdout)
        assert all(step['group'] == 'python' and step['cwd'] == '.' for step in plan)
        assert [step['command'][1:] for step in plan[:-1]] == [
            ['scripts/check_context.py'],
            *[['-m', 'scripts.check_' + owner + '_consumer']
              for owner in ('contract', 'simulator', 'hardware', 'fpga')],
        ]
        arguments = plan[-1]['command']
        assert arguments[:4] == [sys.executable, '-m', 'pytest', '-q']
        assert arguments[4:5] == ['--basetemp'] and len(arguments) == 6
        assert Path(arguments[-1]).is_absolute()
    else:
        assert arguments[:5] == ['python', '-m', 'pytest', '-q', 'services/api/tests']
    # Exercise the real workflow launcher with one existing import-dependent
    # case, rather than recursively launching the entire parent test suite.
    launcher = arguments[:arguments.index('-q') + 1]
    if launcher[0] == 'python':
        launcher[0] = sys.executable
    elif launcher[0] == 'pytest':
        launcher[0] = str(Path(sys.executable).parent / ('pytest.exe' if os.name == 'nt' else 'pytest'))
    result = subprocess.run([*launcher, probe, '--basetemp', str(tmp_path / 'probe')],
                            cwd=ROOT, env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
