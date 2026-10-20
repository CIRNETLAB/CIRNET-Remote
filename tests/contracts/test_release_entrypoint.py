"""One release command reports plans without hiding mandatory external gates."""
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import pytest

ROOT=Path(__file__).resolve().parents[2]


def plan(*groups):
    source=ROOT/'scripts/check_release.py'
    assert source.exists(),'The unified release entrypoint is missing.'
    command=[sys.executable,str(source),'--show-plan']
    for group in groups:command.extend(['--group',group])
    result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    return json.loads(result.stdout)


def test_contract_plan_includes_generation_compatibility_and_conformance():
    commands=[' '.join(step['command']) for step in plan('contracts')]
    for marker in ('check_context.py','generate_hardware_rpc.py','generate_contracts.py --check','sync_editor_catalog.py --check','sync_breadboard_topologies.py --check','check_public_compatibility.py','pytest -q tests/contracts'):
        assert any(marker in command for command in commands),marker
    assert 'check_context.py' in commands[0] and 'generate_hardware_rpc.py' in commands[1]


def test_full_release_plan_has_real_postgres_browser_packages_and_one_full_python_run():
    steps=plan('all');commands=[' '.join(step['command']) for step in steps]
    assert sum(step['group']=='python' and step['command'][1:4]==['-m','pytest','-q'] for step in steps)==1
    for marker in ('postgres_cases.py','test:e2e','check_contract_package.py','check:boundaries','npm'):
        assert any(marker in command for command in commands),marker
    assert not any('pytest -q tests/contracts' in command for command in commands)
    assert all('--basetemp' in step['command'] for step in steps if 'pytest' in step['command'])


def test_load_is_an_explicit_optional_group_with_honest_workload():
    commands=[' '.join(step['command']) for step in plan('load')]
    assert len(commands)==1 and 'benchmark_web_sessions.py' in commands[0]
    assert '--sessions 50' in commands[0] and '--runs 8' in commands[0]


def test_postgres_group_fails_clearly_without_an_explicit_test_database():
    environment={key:value for key,value in os.environ.items() if key!='NETCIRCUIT_TEST_POSTGRES_URL'}
    result=subprocess.run([sys.executable,str(ROOT/'scripts/check_release.py'),'--group','postgres'],cwd=ROOT,env=environment,capture_output=True,text=True)
    assert result.returncode!=0 and 'NETCIRCUIT_TEST_POSTGRES_URL' in result.stderr
    assert 'Skipping' not in result.stdout


@pytest.mark.parametrize('inherited_state',[False,True],ids=['missing-defaults','existing-user-state'])
def test_release_children_always_isolate_default_database_and_captures(monkeypatch,tmp_path,inherited_state):
    from scripts import check_release
    isolated=tmp_path/'owned-release';isolated.mkdir()
    old_database='sqlite:///'+(tmp_path/'existing-user.db').as_posix()
    old_captures=str(tmp_path/'existing-captures')
    for key,value in {'NETCIRCUIT_DATABASE_URL':old_database,'NETCIRCUIT_CAPTURE_DIR':old_captures}.items():
        if inherited_state:monkeypatch.setenv(key,value)
        else:monkeypatch.delenv(key,raising=False)
    monkeypatch.setenv('NETCIRCUIT_TEST_POSTGRES_URL','postgresql://explicit-test-database')
    before={key:os.environ.get(key) for key in ('NETCIRCUIT_DATABASE_URL','NETCIRCUIT_CAPTURE_DIR')}
    monkeypatch.setattr(check_release,'artifact_directory',lambda *args,**kwargs:isolated)
    monkeypatch.setattr(check_release,'release_plan',lambda *args:[{'group':'python','command':[sys.executable,'-c','pass'],'cwd':'.'}])
    children=[]
    monkeypatch.setattr(check_release.subprocess,'run',lambda *args,**kwargs:children.append(kwargs['env']) or SimpleNamespace(returncode=0))
    assert check_release.main(['--group','python'])==0
    environment=children[0]
    assert environment.get('NETCIRCUIT_DATABASE_URL','').startswith('sqlite:///')
    assert Path(environment['NETCIRCUIT_DATABASE_URL'][10:]).is_relative_to(isolated)
    assert Path(environment['NETCIRCUIT_CAPTURE_DIR']).is_relative_to(isolated)
    assert environment['NETCIRCUIT_DATABASE_URL']!=old_database
    assert environment['NETCIRCUIT_CAPTURE_DIR']!=old_captures
    assert environment['NETCIRCUIT_TEST_POSTGRES_URL']=='postgresql://explicit-test-database'
    assert environment['NETCIRCUIT_E2E_PYTHON']==sys.executable
    assert {key:os.environ.get(key) for key in before}==before
