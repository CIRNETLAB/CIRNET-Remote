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


def test_wheel_contains_generated_rpc_and_offline_resources(tmp_path):
    result=subprocess.run([sys.executable,'-m','build','--wheel','--no-isolation','--outdir',str(tmp_path)],
                          cwd=ROOT,capture_output=True,text=True,
                          env={**os.environ,'TMP':str(tmp_path),'TEMP':str(tmp_path)})
    assert result.returncode==0,result.stdout+result.stderr
    wheel=next(tmp_path.glob('*.whl'))
    with ZipFile(wheel) as archive:
        files=set(archive.namelist())
    assert {'contracts/manifest.json','contracts/profiles.json','contracts/fixtures/conformance.json','contracts/api/openapi.json',
            'contracts/design/visual.schema.json','contracts/public/common.schema.json',
            'contracts/compatibility/2026-10-16/baseline.json',
            'contracts/compatibility/2026-10-16/public-wire-baseline.json',
            'contracts/design-models/fixtures/physical-mounting-parity.json',
            'contracts/design-models/signal-domains.schema.json','contracts/design-models/signal-port-catalog.json',
            'contracts/capture/ncap.schema.json','contracts/capture/layout.json','contracts/fixtures/capture/conformance.json',
            'contracts/boundary/capture_layout.py','contracts/signal_domains.py','contracts/capture_validation.py',
            'contracts/hardware/v2/rpc_v2.proto','contracts/fpga-protocol/control.schema.json',
            'contracts/boundary/models.py','contracts/generated/rpc_v2_pb2.py','contracts/generated/rpc_v2_pb2_grpc.py'} <= files
