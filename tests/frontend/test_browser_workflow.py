"""Release CI must exercise the owned real-process browser harness."""
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'apps/web'


def workflow(name):
    return yaml.safe_load((ROOT / '.github/workflows' / name).read_text(encoding='utf-8'))


def commands(job):
    return '\n'.join(step.get('run', '') for step in job['steps'])


def test_frontend_checks_shared_generation_and_every_dependency_trigger():
    document = workflow('frontend.yml')
    events = document.get('on', document.get(True))
    shared = {'apps/web/**', 'contracts/**', 'scripts/**', 'device-library/**', 'services/api/**',
              'simulator/circuit-simulator/**', 'pyproject.toml', 'requirements-codegen.txt', 'requirements-verification.txt', 'requirements-benchmark.txt', 'setup.py', 'MANIFEST.in', 'Makefile'}
    for event in ('push', 'pull_request'):
        assert shared <= set(events[event]['paths'])
    steps = commands(document['jobs']['build'])
    for check in ('generate_hardware_rpc.py', 'generate_contracts.py --check', 'export_openapi.py --check',
                  'sync_editor_catalog.py --check', 'npm run check:boundaries', 'npm test', 'npm run build', 'tests/frontend'):
        assert check in steps
    assert document['permissions'] == {'contents': 'read'}


def test_browser_ci_installs_pinned_runner_and_all_real_services_then_runs_every_case():
    document = workflow('browser-e2e.yml')
    job = document['jobs']['chromium']
    steps = commands(job)
    for package in ('-e .', './services/api[test]', './simulator/circuit-simulator[test]', './services/hardware-service[dev]'):
        assert package in steps
    for check in ('npm ci', 'generate_hardware_rpc.py', 'generate_contracts.py --check',
                  'export_openapi.py --check', 'npm run check:boundaries', 'npm run build',
                  'npm run test:e2e:install -- --with-deps', 'npm run test:e2e -- --reporter=line,junit'):
        assert check in steps
    assert 'npx tsc --noEmit -p tsconfig.e2e.json' in steps
    assert '--forbid-only' in steps
    assert job['env']['NETCIRCUIT_E2E_PYTHON'] == 'python'
    assert not any(step.get('continue-on-error', False) for step in job['steps'])
    assert '--grep' not in steps and '--retries' not in steps
    package = json.loads((WEB / 'package.json').read_text(encoding='utf-8'))
    lock = json.loads((WEB / 'package-lock.json').read_text(encoding='utf-8'))
    assert package['devDependencies']['@playwright/test'] == '1.64.1'
    assert lock['packages']['node_modules/@playwright/test']['version'] == '1.64.1'
    assert 'workers:1,retries:0' in (WEB / 'playwright.config.ts').read_text(encoding='utf-8')
    upload = next(step for step in job['steps'] if step.get('uses', '').startswith('actions/upload-artifact@'))
    assert upload['if'] == 'always()'
    assert '.test-build/playwright' in upload['with']['path']
    assert '.test-build/e2e.log' in upload['with']['path']
    assert upload['with']['retention-days'] == 7
    assert upload['with']['include-hidden-files'] is True
    assert set(upload['with']['path'].splitlines()) == {'apps/web/.test-build/playwright','apps/web/.test-build/e2e.log'}
    events = document.get('on', document.get(True))
    for event in ('push', 'pull_request'):
        assert {'contracts/**', 'scripts/**', 'services/api/**', 'services/hardware-service/**',
                'simulator/circuit-simulator/**', 'pyproject.toml', 'requirements-codegen.txt', 'setup.py',
                'Makefile', 'apps/web/**'} <= set(events[event]['paths'])
