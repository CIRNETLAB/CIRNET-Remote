"""Package verification must physically leave the source checkout."""
import importlib.util
from pathlib import Path
import pytest
from zipfile import ZipFile

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


def test_all_new_contract_resources_are_checked_in_the_built_archive():
    assert hasattr(checker,'REQUIRED_RESOURCES'),'The package resource inventory is missing.'
    assert {'contracts/capture/layout.json','contracts/capture/ncap.schema.json',
        'contracts/fixtures/capture/conformance.json','contracts/design-models/signal-port-catalog.json',
        'contracts/design-models/signal-domains.schema.json',
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
