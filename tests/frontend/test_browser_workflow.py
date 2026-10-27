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


def assert_interface_bootstrap_ownership(job):
    steps=job['steps']
    bootstrap=next(step for step in steps if 'bootstrap-contracts.mjs' in step.get('run',''))
    assert bootstrap.get('env',{}).get('NETCIRCUIT_ARTIFACTS_TOKEN')=='${{ secrets.NETCIRCUIT_ARTIFACTS_READ_TOKEN }}'
    allocation=next(step for step in steps if 'NETCIRCUIT_ARTIFACTS_SESSION=' in step.get('run',''))
    assert 'getArtifactContext' in allocation['run']
    assert 'export NETCIRCUIT_ARTIFACTS_CONTEXT' in allocation['run']
    assert 'NETCIRCUIT_ARTIFACTS_CONTEXT=$NETCIRCUIT_ARTIFACTS_CONTEXT' in allocation['run']


def test_frontend_checks_shared_generation_and_every_dependency_trigger():
    document = workflow('frontend.yml')
    events = document.get('on', document.get(True))
    shared = {'apps/web/**', 'contracts/**', 'scripts/**', 'device-library/**', 'services/api/**',
              'simulator/circuit-simulator/**', 'pyproject.toml', 'requirements-codegen.txt', 'requirements-verification.txt', 'requirements-benchmark.txt', 'setup.py', 'MANIFEST.in', 'Makefile'}
    for event in ('push', 'pull_request'):
        assert shared <= set(events[event]['paths'])
    steps = commands(document['jobs']['build'])
    for check in ('scripts.check_contract_consumer', 'generate_contracts.py --check', 'export_openapi.py --check',
                  'sync_editor_catalog.py --check', 'npm run check:boundaries', 'npm test', 'npm run build', 'tests/frontend'):
        assert check in steps
    assert document['permissions'] == {'contents': 'read'}
    assert_interface_bootstrap_ownership(document['jobs']['build'])
    assert all(step.get('working-directory')!='apps/web' for step in document['jobs']['build']['steps'])


def test_browser_ci_installs_pinned_runner_and_all_real_services_then_runs_every_case():
    document = workflow('browser-e2e.yml')
    job = document['jobs']['chromium']
    assert_interface_bootstrap_ownership(job)
    steps = commands(job)
    for package in ('install_contracts.py', 'install_simulator.py', './services/api[test]', './services/hardware-service[dev]'):
        assert package in steps
    for check in ('npm ci', 'scripts.check_contract_consumer', 'generate_contracts.py --check',
                  'export_openapi.py --check', 'npm run check:boundaries', 'npm run build',
                  'npm run test:e2e:install -- --with-deps', 'node scripts/e2e-interface.mjs --reporter=line,junit'):
        assert check in steps
    # The real browser product is selected by reviewed release bytes. Retained
    # Web remains a historical source input, never an integrated runner fallback.
    for boundary in ('scripts.install_interface', 'bootstrap-contracts.mjs'):
        assert boundary in steps
    download=next(step for step in job['steps'] if 'scripts.install_interface' in step.get('run',''))
    assert set(download['env'])>={'NETCIRCUIT_INTERFACE_ARTIFACT_URL','NETCIRCUIT_INTERFACE_ARTIFACT_SHA256','NETCIRCUIT_ARTIFACTS_TOKEN'}
    assert all(step.get('working-directory') != 'apps/web' for step in job['steps'])
    consumer_install=next(index for index,step in enumerate(job['steps']) if 'npm ci' in step.get('run',''))
    product_bootstrap=next(index for index,step in enumerate(job['steps']) if 'bootstrap-contracts.mjs' in step.get('run',''))
    assert product_bootstrap < consumer_install
    target=(ROOT/'scripts/e2e-interface-target.mjs').read_text(encoding='utf-8')
    assert "manifest.devDependencies?.['@playwright/test']!=='1.64.1'" in target
    assert 'npx tsc --noEmit -p tsconfig.e2e.json' in steps
    assert '--forbid-only' in steps
    assert job['env']['NETCIRCUIT_E2E_PYTHON'] == 'python'
    allocation = next(step for step in job['steps'] if 'artifact_session=' in step.get('run', ''))
    assert allocation.get('env', {}).get('NETCIRCUIT_ARTIFACTS_DIR') == '${{ runner.temp }}/netcircuit-artifacts/${{ github.run_id }}-${{ github.run_attempt }}', 'runner.temp is available in step env, not job env'
    assert 'node scripts/artifact-paths.mjs' in steps
    assert 'NETCIRCUIT_ARTIFACTS_SESSION=$artifact_session' in steps
    assert 'tee "$artifact_session/e2e.log"' in steps
    assert not any(step.get('continue-on-error', False) for step in job['steps'])
    assert '--grep' not in steps and '--retries' not in steps
    package = json.loads((WEB / 'package.json').read_text(encoding='utf-8'))
    lock = json.loads((WEB / 'package-lock.json').read_text(encoding='utf-8'))
    assert package['devDependencies']['@playwright/test'] == '1.64.1'
    assert lock['packages']['node_modules/@playwright/test']['version'] == '1.64.1'
    assert 'workers:1,retries:0' in (WEB / 'playwright.config.ts').read_text(encoding='utf-8')
    upload = next(step for step in job['steps'] if step.get('uses', '').startswith('actions/upload-artifact@'))
    assert upload['if'] == 'always()'
    assert upload['with']['retention-days'] == 7
    assert upload['with']['include-hidden-files'] is True
    assert set(upload['with']['path'].splitlines()) == {
        '${{ env.NETCIRCUIT_ARTIFACTS_SESSION }}/playwright',
        '${{ env.NETCIRCUIT_ARTIFACTS_SESSION }}/playwright-reporters',
        '${{ env.NETCIRCUIT_ARTIFACTS_SESSION }}/e2e.log',
    }
    cleanup = next(step for step in job['steps'] if '--cleanup' in step.get('run', ''))
    assert cleanup['if'] == 'always()'
    assert job['steps'].index(cleanup) > job['steps'].index(upload)
    assert '--cleanup "$NETCIRCUIT_ARTIFACTS_SESSION"' in cleanup['run']
    assert '.test-build' not in steps
    events = document.get('on', document.get(True))
    for event in ('push', 'pull_request'):
        assert {'contracts/**', 'scripts/**', 'services/api/**', 'services/hardware-service/**',
                'simulator/circuit-simulator/**', 'pyproject.toml', 'requirements-codegen.txt', 'setup.py',
                'Makefile', 'apps/web/**'} <= set(events[event]['paths'])
