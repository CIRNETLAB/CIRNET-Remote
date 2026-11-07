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
    output=ROOT/'docs/en/history/verification/rejected.json'
    result=subprocess.run([sys.executable,str(ROOT/'scripts/benchmark_web_sessions.py'),'--output',str(output)],capture_output=True,text=True,cwd=ROOT)
    assert result.returncode!=0
    assert 'outside' in result.stderr
    assert not output.exists()


def test_owned_lane_reuses_inherited_context_without_extra_node_preflight(tmp_path,monkeypatch):
    import scripts.artifact_paths as allocator
    from tests.integration.native_external_baseline_cases import _owned_directory
    from tests.support.artifacts import isolated_environment, cleanup_owned_session

    isolated_environment(monkeypatch,tmp_path)
    context={'owner':'adapter-inherited-context','roots':[str(ROOT)]}
    session=artifact_directory(context=context)
    try:
        lane=artifact_directory('lane',context=context)
        calls=[]
        run=subprocess.run

        def count_allocator_calls(arguments,*args,**kwargs):
            if isinstance(arguments,(list,tuple)) and len(arguments)>1 and Path(arguments[1])==allocator._node:
                calls.append(arguments[2:])
            return run(arguments,*args,**kwargs)

        for prefix in ('CIRNET_', 'NETCIRCUIT_'):
            with monkeypatch.context() as scoped:
                for suffix in ('ARTIFACTS_CONTEXT','ARTIFACTS_SESSION','ARTIFACTS_DIR'):
                    canonical='CIRNET_'+suffix
                    value=os.environ[canonical]
                    scoped.delenv(canonical,raising=False)
                    scoped.delenv('NETCIRCUIT_'+suffix,raising=False)
                    scoped.setenv(prefix+suffix,value)
                scoped.setattr(subprocess,'run',count_allocator_calls)
                calls.clear()
                assert _owned_directory(lane)==lane
                assert len(calls)==3, calls
                assert sum('--context-info' in arguments for arguments in calls)==1
                assert os.environ['CIRNET_ARTIFACTS_SESSION']==os.environ['NETCIRCUIT_ARTIFACTS_SESSION']==str(session)
    finally:
        cleanup_owned_session(session,tmp_path)


def test_explicit_and_inherited_context_keep_canonical_ownership_rejections(tmp_path,monkeypatch):
    from tests.support.artifacts import isolated_environment, cleanup_owned_session

    isolated_environment(monkeypatch,tmp_path)
    context={'owner':'adapter-path-safety','roots':[str(ROOT)]}
    session=artifact_directory(context=context)
    try:
        lane=artifact_directory('lane',context=context)
        assert validate_artifact_directory(lane,context=context)==lane
        assert artifact_directory('lane')==lane
        assert validate_artifact_directory(lane)==lane

        with monkeypatch.context() as scoped:
            scoped.setenv('CIRNET_ARTIFACTS_CONTEXT','{')
            with pytest.raises(RuntimeError,match='Invalid inherited artifact context JSON'):
                validate_artifact_directory(lane)
            with pytest.raises(RuntimeError,match='Invalid inherited artifact context JSON'):
                artifact_directory()
            assert validate_artifact_directory(lane,context=context)==lane

        with pytest.raises(RuntimeError,match='unowned'):
            artifact_directory(context={**context,'owner':'different-owner'})

        unowned=tmp_path/'cirnet-unowned'
        unowned.mkdir()
        with monkeypatch.context() as scoped:
            scoped.setenv('CIRNET_ARTIFACTS_SESSION',str(unowned))
            with pytest.raises(RuntimeError,match='unowned'):
                artifact_directory(context=context)

        foreign=tmp_path/'foreign-checkout'
        subprocess.run(['git','init','-q',str(foreign)],check=True,cwd=tmp_path)
        with pytest.raises(RuntimeError,match='omits the current Git repository'):
            validate_artifact_directory(lane,context={**context,'roots':[str(foreign)]})
        with pytest.raises(RuntimeError,match='outside'):
            validate_artifact_directory(foreign,context=context)

        link=session/'foreign-link'
        subprocess.run([
            'node','-e',
            "require('node:fs').symlinkSync(process.argv[1],process.argv[2],process.platform==='win32'?'junction':'dir')",
            str(foreign),str(link),
        ],check=True,cwd=tmp_path)
        with pytest.raises(RuntimeError,match='outside'):
            validate_artifact_directory(link,context=context)
        with pytest.raises(RuntimeError,match='outside'):
            artifact_directory('foreign-link',context=context)
    finally:
        cleanup_owned_session(session,tmp_path)
