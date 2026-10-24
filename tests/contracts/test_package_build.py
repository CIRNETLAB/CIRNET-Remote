"""A wheel must contain the same offline contract authority as the checkout."""
from pathlib import Path
import os
import subprocess
import sys
import tomllib
from zipfile import ZipFile
from packaging.requirements import Requirement

ROOT=Path(__file__).resolve().parents[2]


def test_verification_toolchain_satisfies_every_no_isolation_build_requirement():
    def requirements(path):
        for line in path.read_text(encoding='utf-8').splitlines():
            line=line.strip()
            if not line or line.startswith('#'):continue
            if line.startswith('-r '):yield from requirements(path.parent/line[3:].strip())
            else:yield Requirement(line)

    pinned={requirement.name:next(iter(requirement.specifier)).version
            for requirement in requirements(ROOT/'requirements-verification.txt')
            if len(requirement.specifier)==1 and next(iter(requirement.specifier)).operator=='=='}
    for project in ('.','services/api','simulator/circuit-simulator','services/hardware-service'):
        metadata=tomllib.loads((ROOT/project/'pyproject.toml').read_text(encoding='utf-8'))
        for value in metadata['build-system']['requires']:
            requirement=Requirement(value)
            assert requirement.name in pinned,f'{project}: uninstalled build requirement {value}'
            assert pinned[requirement.name] in requirement.specifier,(project,value,pinned[requirement.name])


def test_remote_metapackage_does_not_package_or_generate_contracts(tmp_path):
    result=subprocess.run([sys.executable,'-m','build','--wheel','--no-isolation','--outdir',str(tmp_path)],
                          cwd=ROOT,capture_output=True,text=True,
                          env={**os.environ,'TMP':str(tmp_path),'TEMP':str(tmp_path)})
    assert result.returncode==0,result.stdout+result.stderr
    wheel=next(tmp_path.glob('netcircuit_remote_dev-*.whl'))
    with ZipFile(wheel) as archive:
        files=set(archive.namelist())
        assert not any(name.startswith('contracts/') for name in files)
        metadata=archive.read(next(name for name in files if name.endswith('/METADATA'))).decode()
    assert 'Requires-Dist: netcircuit-contracts==1.0.1' in metadata


def test_selected_contract_artifact_contains_rpc_and_offline_resources():
    from scripts.contracts_artifact import selected_wheel
    from scripts.check_contract_package import verify_contract_wheel
    verify_contract_wheel(selected_wheel())
