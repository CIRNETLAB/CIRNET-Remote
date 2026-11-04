from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]


def test_root_config_files_exist():
    for rel in ['.editorconfig','.env.example','Makefile','scripts/check_context.py','scripts/dev-info.py']:
        assert (ROOT/rel).exists(), rel


def test_env_example_has_expected_keys():
    text=(ROOT/'.env.example').read_text()
    for key in ['CIRNET_ENV','CIRNET_API_HOST','CIRNET_API_PORT','CIRNET_HARDWARE_MODE']:
        assert f'{key}=' in text


def test_context_check_script_passes():
    result=subprocess.run([sys.executable,'scripts/check_context.py'],cwd=ROOT,text=True,capture_output=True)
    assert result.returncode==0, result.stdout+result.stderr
    assert 'context-check: PASS' in result.stdout
