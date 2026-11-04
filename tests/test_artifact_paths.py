"""Python callers must enforce the same external-output policy as Node callers."""
import os
from pathlib import Path
import subprocess
import sys
import pytest
from scripts.artifact_paths import artifact_directory, cleanup_artifact_session, validate_artifact_directory

ROOT=Path(__file__).resolve().parents[1]


def test_cleanup_fixture_never_deletes_an_inherited_parent_session(tmp_path,monkeypatch):
    from tests.support.artifacts import cleanup_owned_session
    import scripts.artifact_paths as allocator
    monkeypatch.setattr(allocator,'cleanup_artifact_session',lambda path:pytest.fail('unsafe cleanup reached the allocator'))
    with pytest.raises(AssertionError,match='Refusing test cleanup'):
        cleanup_owned_session(tmp_path,tmp_path/'child-fixture')


def test_python_bridge_shares_owned_session_and_cleans_only_that_session(tmp_path,monkeypatch):
    from tests.support.artifacts import isolated_environment, cleanup_owned_session
    isolated_environment(monkeypatch,tmp_path)
    session=artifact_directory()
    try:
        directory=artifact_directory('python-evidence')
        assert directory.parent==session
        (directory/'real.txt').write_text('observed output',encoding='utf-8')
        assert os.environ['CIRNET_ARTIFACTS_SESSION']==str(session)
        assert validate_artifact_directory(directory)==directory
        with pytest.raises(RuntimeError,match='outside'):validate_artifact_directory(ROOT/'docs')
        with pytest.raises(RuntimeError):cleanup_artifact_session(tmp_path)
    finally:cleanup_owned_session(session,tmp_path)
    assert not session.exists() and tmp_path.is_dir()


def test_load_benchmark_rejects_repository_output_before_starting_services():
    result=subprocess.run([sys.executable,str(ROOT/'scripts/benchmark_web_sessions.py'),'--output',str(ROOT/'docs/verification/rejected.json')],capture_output=True,text=True,cwd=ROOT)
    assert result.returncode!=0
    assert 'outside' in result.stderr
    assert not (ROOT/'docs/verification/rejected.json').exists()
