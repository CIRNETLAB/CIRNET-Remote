"""A wheel must contain the same offline contract authority as the checkout."""
from pathlib import Path
import os
import subprocess
import sys
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[2]


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
