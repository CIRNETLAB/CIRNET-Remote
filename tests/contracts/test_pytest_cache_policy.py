"""Each pytest entrypoint disables repository-local diagnostic caches."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[2]
PROJECTS = (ROOT, ROOT / 'services/api', ROOT / 'simulator/circuit-simulator',
            ROOT / 'services/hardware-service')


def cache_snapshot():
    result = {}
    for project in PROJECTS:
        cache = project / '.pytest_cache'
        result[str(cache)] = None
        if not cache.exists():
            continue
        for path in (cache, *sorted(cache.rglob('*'))):
            stat = path.stat()
            digest = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
            result[str(path)] = (stat.st_mtime_ns, stat.st_size, digest)
    return result


@pytest.mark.parametrize('project', PROJECTS, ids=('root', 'api', 'simulator', 'hardware'))
def test_real_pytest_entrypoint_disables_cache_without_touching_source(project, tmp_path):
    probe = tmp_path / 'test_cache_probe.py'
    probe.write_text('def test_cache_disabled(pytestconfig):\n'
                     '    assert not pytestconfig.pluginmanager.hasplugin("cacheprovider")\n',
                     encoding='utf-8')
    before = cache_snapshot()
    environment = {key: value for key, value in os.environ.items() if key != 'PYTEST_ADDOPTS'}
    environment['PYTHONDONTWRITEBYTECODE'] = '1'
    safety_cache = tmp_path / 'external-cache-safety-net'
    # Contain diagnostics even if a future regression enables cacheprovider.
    # The plugin assertion still fails, and passing runs create no safety cache.
    result = subprocess.run([sys.executable, '-B', '-m', 'pytest', '-q',
                             '-c', str(project / 'pyproject.toml'),
                             '-o', f'cache_dir={safety_cache}',
                             '--basetemp', str(tmp_path / 'pytest-tmp'), str(probe)],
                            cwd=project, env=environment, capture_output=True, text=True, timeout=60)
    assert cache_snapshot() == before, 'pytest changed a preserved source cache tree'
    assert result.returncode == 0, result.stdout + result.stderr
    assert not safety_cache.exists(), 'pytest created diagnostics despite the disabled cache policy'
