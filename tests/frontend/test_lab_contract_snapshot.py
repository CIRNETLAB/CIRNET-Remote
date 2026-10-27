from pathlib import Path
import subprocess
import sys
from tests.support.release_inputs import interface_root, sdk_resource

ROOT=Path(__file__).resolve().parents[2]


def test_browser_contract_snapshot_and_types_match_canonical_schemas():
    result=subprocess.run([sys.executable,str(ROOT/'scripts/sync_lab_contracts.py'),'--check'],capture_output=True,text=True)
    assert result.returncode==0,result.stdout+result.stderr
    from contracts.resources import browser_artifacts
    for legacy, expected in browser_artifacts().items():
        if legacy.startswith('apps/web/src/data/'):
            selected = sdk_resource('data/' + legacy.removeprefix('apps/web/src/data/'))
            assert selected.read_bytes().replace(b'\r\n', b'\n') == expected.replace(b'\r\n', b'\n'), legacy
    facade = (interface_root() / 'src/types/lab.ts').read_text(encoding='utf-8')
    assert "from '@tinihi-labs/contracts/dto'" in facade
