"""Package verification must physically leave the source checkout."""
import importlib.util
import copy
import hashlib
import json
import os
from contextlib import nullcontext
import subprocess
import sys
from pathlib import Path
import pytest
import yaml
from zipfile import ZipFile
from types import SimpleNamespace
from scripts.artifact_paths import cleanup_artifact_session

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('check_contract_package',ROOT/'scripts/check_contract_package.py')
checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)


def test_package_workspace_rejects_checkout_and_descendants(tmp_path):
    assert hasattr(checker,'verify_external_path'),'Outside-checkout package workspace guard is missing.'
    checkout=tmp_path/'checkout';checkout.mkdir()
    for path in (checkout,checkout/'.build/packages'):
        with pytest.raises(ValueError,match='outside'):checker.verify_external_path(path,checkout)
    assert checker.verify_external_path(tmp_path/'outside',checkout)==(tmp_path/'outside').resolve()


def test_all_four_package_wheels_are_verified():
    assert hasattr(checker,'WHEEL_PROJECTS'),'API/simulator/hardware wheels are not verified.'
    assert set(checker.WHEEL_PROJECTS)=={'.','services/api','services/hardware-service','simulator/circuit-simulator'}


def catalog_fingerprint(parts):
    return hashlib.sha256(json.dumps(parts,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()


@pytest.mark.parametrize('extended',[False,True],ids=['current-catalog','extended-catalog'])
def test_installed_catalog_probe_accepts_complete_source_inventory_without_a_fixed_count(monkeypatch,extended):
    from contracts import physical_mounting
    parts=json.loads((ROOT/'contracts/design-models/physical-parts.v1.json').read_text(encoding='utf-8'))['parts']
    if extended:
        added=copy.deepcopy(parts[-1]);added['id']='ADDITIONAL-PART';added['editorType']='ADDITIONAL_PART'
        parts.append(added)
    monkeypatch.setattr(physical_mounting,'physical_parts',lambda:tuple(parts))
    assert hasattr(checker,'CATALOG_PROBE'),'Installed catalog verification still depends on a fixed part count.'
    exec(checker.CATALOG_PROBE,{'sys':SimpleNamespace(argv=['probe','checkout',catalog_fingerprint(parts)])})


@pytest.mark.parametrize('corruption',['missing','extra','changed'])
def test_installed_catalog_probe_rejects_truncated_extra_or_altered_parts(monkeypatch,corruption):
    from contracts import physical_mounting
    source=json.loads((ROOT/'contracts/design-models/physical-parts.v1.json').read_text(encoding='utf-8'))['parts']
    installed=copy.deepcopy(source)
    if corruption=='missing':installed.pop()
    elif corruption=='extra':installed.append(copy.deepcopy(installed[-1]))
    else:installed[0]['package']['revision']+=1
    monkeypatch.setattr(physical_mounting,'physical_parts',lambda:tuple(installed))
    assert hasattr(checker,'CATALOG_PROBE'),'Installed catalog verification still depends on a fixed part count.'
    with pytest.raises(AssertionError,match='physical catalog'):
        exec(checker.CATALOG_PROBE,{'sys':SimpleNamespace(argv=['probe','checkout',catalog_fingerprint(source)])})


def test_all_new_contract_resources_are_checked_in_the_built_archive():
    assert hasattr(checker,'REQUIRED_RESOURCES'),'The package resource inventory is missing.'
    assert {'contracts/capture/layout.json','contracts/capture/ncap.schema.json',
        'contracts/fixtures/capture/conformance.json','contracts/design-models/signal-port-catalog.json',
        'contracts/design-models/signal-domains.schema.json',
        'contracts/design-models/flexible-mount.schema.json','contracts/design-models/flexible-mechanics.json',
        'contracts/design-models/fixtures/flexible-mounting-parity.json','contracts/circuit-schema/circuit-v1.2.schema.json',
        'contracts/public/placement.schema.json','contracts/flexible_mounting.py',
        'contracts/public/assignments-v2.schema.json','contracts/fixtures/assignment-v2-conformance.json',
        'contracts/compatibility/2026-10-16/public-wire-baseline.json'}<=set(checker.REQUIRED_RESOURCES)


def test_wheel_missing_a_sampled_capture_resource_fails_before_install(tmp_path):
    assert hasattr(checker,'verify_contract_wheel'),'Built-wheel resource validation is missing.'
    wheel=tmp_path/'contracts.whl'
    with ZipFile(wheel,'w') as archive:
        for name in checker.REQUIRED_RESOURCES:
            if name!='contracts/capture/ncap.schema.json':archive.writestr(name,'{}')
    with pytest.raises(ValueError,match='ncap.schema.json'):checker.verify_contract_wheel(wheel)


def test_clean_build_staging_excludes_ignored_rpc_and_cached_build_outputs(tmp_path):
    assert hasattr(checker,'stage_project'),'The clean source build stage is missing.'
    target=tmp_path/'source'
    checker.stage_project('.',target)
    assert (target/'scripts/generate_hardware_rpc.py').is_file()
    assert (target/'contracts/hardware/v2/rpc_v2.proto').is_file()
    assert not (target/'contracts/generated').exists() and not (target/'.build').exists()


@pytest.mark.parametrize('prefix',['','x'*20000],ids=['short-output','long-output'])
def test_failed_package_command_exposes_output_and_preserves_complete_log(tmp_path,monkeypatch,prefix):
    checkout=tmp_path/'checkout';checkout.mkdir()
    monkeypatch.setenv('NETCIRCUIT_ARTIFACTS_DIR',str(tmp_path))
    monkeypatch.delenv('NETCIRCUIT_ARTIFACTS_SESSION',raising=False)
    monkeypatch.setattr(checker,'ROOT',checkout)
    monkeypatch.setattr(checker,'external_workspace',lambda base:nullcontext(tmp_path))
    monkeypatch.setattr(checker,'stage_project',lambda project,target:tmp_path)
    actual_run=subprocess.run
    def failed_build(command,**kwargs):
        if command[:3]!=[sys.executable,'-m','build']:
            return actual_run(command,**kwargs)
        script=f'import sys; print({prefix!r},flush=True); print("missing setuptools build dependency",flush=True); print("compiler stderr detail",file=sys.stderr); sys.exit(23)'
        return actual_run([sys.executable,'-c',script],**kwargs)
    monkeypatch.setattr(checker.subprocess,'run',failed_build)
    try:
        with pytest.raises(RuntimeError) as error:checker.main([])
        message=str(error.value)
        assert 'missing setuptools build dependency' in message and 'compiler stderr detail' in message
        assert '23' in message and '--no-isolation' in message
        assert len(message)<18000
        artifact_session=Path(os.environ['NETCIRCUIT_ARTIFACTS_SESSION'])
        log_path=next((artifact_session/'package-check').glob('package-check-*.log'))
        assert artifact_session.is_relative_to(tmp_path)
        assert not log_path.is_relative_to(checkout) and not log_path.is_relative_to(ROOT)
        log=log_path.read_text(encoding='utf-8')
        assert prefix in log and 'missing setuptools build dependency' in log and 'compiler stderr detail' in log
    finally:
        if session:=os.environ.get('NETCIRCUIT_ARTIFACTS_SESSION'):
            cleanup_artifact_session(session)


def test_installed_package_ci_preserves_diagnostics_when_the_probe_fails():
    workflow=yaml.safe_load((ROOT/'.github/workflows/contracts.yml').read_text(encoding='utf-8'))
    job=workflow['jobs']['installed-packages'];steps=job['steps']
    assert job['env']['NETCIRCUIT_ARTIFACTS_DIR']=='${{ runner.temp }}/netcircuit-package-check'
    uploads=[step for step in steps if step.get('uses','').startswith('actions/upload-artifact@')]
    upload=next(step for step in uploads if step.get('if')=='always()'
                and step.get('with',{}).get('path')=='${{ env.NETCIRCUIT_ARTIFACTS_SESSION }}/package-check/*.log')
    assert upload['with']['include-hidden-files'] is True
    cleanup=next(step for step in steps if '--cleanup' in step.get('run',''))
    assert 'always()' in cleanup['if'] and "env.NETCIRCUIT_ARTIFACTS_SESSION != ''" in cleanup['if']
    assert '--cleanup "$NETCIRCUIT_ARTIFACTS_SESSION"' in cleanup['run']
    assert steps.index(cleanup)>steps.index(upload)
