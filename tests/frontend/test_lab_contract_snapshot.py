from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]


def test_browser_contract_snapshot_and_types_match_canonical_schemas():
    result=subprocess.run([sys.executable,str(ROOT/'scripts/sync_lab_contracts.py'),'--check'],capture_output=True,text=True)
    assert result.returncode==0,result.stdout+result.stderr
