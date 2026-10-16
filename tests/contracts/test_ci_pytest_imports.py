"""CI test commands must import checkout tools without an ambient PYTHONPATH."""
import os
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
    command = next(step['run'] for step in workflow['jobs'][job_name]['steps']
                   if 'pytest -q' in step.get('run', ''))
    # Exercise the real workflow launcher with one existing import-dependent
    # case, rather than recursively launching the entire parent test suite.
    arguments = shlex.split(command)
    launcher = arguments[:arguments.index('-q') + 1]
    if launcher[0] == 'python':
        launcher[0] = sys.executable
    elif launcher[0] == 'pytest':
        launcher[0] = str(Path(sys.executable).parent / ('pytest.exe' if os.name == 'nt' else 'pytest'))
    environment = {key: value for key, value in os.environ.items() if key != 'PYTHONPATH'}
    result = subprocess.run([*launcher, probe, '--basetemp', str(tmp_path / 'probe')],
                            cwd=ROOT, env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
