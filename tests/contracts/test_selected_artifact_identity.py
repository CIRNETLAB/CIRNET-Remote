"""Two local same-version candidates cannot silently reuse the first install."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import venv
from zipfile import ZipFile

import pytest

ROOT=Path(__file__).resolve().parents[2]


def tool(name):
    spec=importlib.util.spec_from_file_location('identity_'+name,ROOT/'scripts'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def candidate(directory,marker):
    directory.mkdir()
    path=directory/'netcircuit_contracts-0.1.1-py3-none-any.whl'
    metadata='netcircuit_contracts-0.1.1.dist-info'
    entries={
        'contracts/__init__.py':f'VALUE={marker!r}\n'.encode(),
        'contracts/manifest.json':f'{{"candidate":"{marker}"}}'.encode(),
        metadata+'/METADATA':b'Metadata-Version: 2.1\nName: netcircuit-contracts\nVersion: 0.1.1\nProvides-Extra: rpc\n',
        metadata+'/WHEEL':b'Wheel-Version: 1.0\nGenerator: identity-regression\nRoot-Is-Purelib: true\nTag: py3-none-any\n',
    }
    records=[f'{name},sha256={base64.urlsafe_b64encode(hashlib.sha256(value).digest()).rstrip(b"=").decode()},{len(value)}' for name,value in entries.items()]
    entries[metadata+'/RECORD']=('\n'.join(records)+f'\n{metadata}/RECORD,,\n').encode()
    with ZipFile(path,'w') as archive:
        for name,value in entries.items():archive.writestr(name,value)
    return path,hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def isolated_installer(tmp_path,monkeypatch):
    from scripts.artifact_paths import artifact_directory
    # A fake candidate must never replace the job's selected real manifest or
    # append to its GitHub environment file, even under release CI selectors.
    inherited = {Path(value): Path(value).read_bytes() if Path(value).exists() else None
                 for key in ('NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST', 'GITHUB_ENV')
                 if (value := os.environ.get(key))}
    session = artifact_directory(directory=tmp_path/'installer-artifacts')
    monkeypatch.setenv('NETCIRCUIT_ARTIFACTS_SESSION',str(session))
    for key in tuple(os.environ):
        if key.startswith('NETCIRCUIT_CONTRACTS_'):
            monkeypatch.delenv(key)
    manifest=session/'contracts-download/artifacts.json'
    github_env=session/'github-env'
    monkeypatch.setenv('NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST',str(manifest))
    monkeypatch.setenv('GITHUB_ENV',str(github_env))
    for key in ('TMP','TEMP','TMPDIR','PIP_CACHE_DIR'):
        directory=session/key.lower();directory.mkdir()
        monkeypatch.setenv(key,str(directory))
    npm_cache=session/'npm-cache';npm_cache.mkdir()
    monkeypatch.setenv('npm_config_cache',str(npm_cache))
    root=tmp_path/'venv'
    venv.EnvBuilder(with_pip=True).create(root)
    python=root/('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
    installer=tool('install_contracts')
    monkeypatch.setattr(installer,'sys',SimpleNamespace(executable=str(python)))
    monkeypatch.setenv('PIP_NO_INDEX','1')
    monkeypatch.setenv('PIP_DISABLE_PIP_VERSION_CHECK','1')
    def unexpected_download(*args,**kwargs):
        pytest.fail('A local fake-wheel regression must not download a release artifact')
    monkeypatch.setattr(installer,'download_artifact',unexpected_download)
    yield installer,python
    selected=json.loads(manifest.read_text(encoding='utf-8'))
    assert set(selected)=={'schemaVersion','python'}
    assert Path(selected['python']['path']).is_relative_to(tmp_path)
    assert github_env.read_text(encoding='utf-8').splitlines()
    assert set(github_env.read_text(encoding='utf-8').splitlines())=={
        f'NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST={manifest}'}
    for path,contents in inherited.items():
        assert (path.read_bytes() if path.exists() else None)==contents, f'CI state changed: {path}'


def test_installing_second_same_version_candidate_replaces_the_selected_payload(tmp_path,isolated_installer):
    installer,python=isolated_installer
    for marker in ('first','second'):
        wheel,digest=candidate(tmp_path/marker,marker)
        assert installer.main(['--wheel',str(wheel),'--sha256',digest,'--npm-url',''])==0
    result=subprocess.run([str(python),'-I','-c','import contracts; print(contracts.VALUE)'],cwd=tmp_path,capture_output=True,text=True,check=True)
    assert result.stdout.strip()=='second','pip silently retained the first same-version candidate'


def test_selected_archive_mismatch_is_rejected_even_when_installed_record_is_consistent(tmp_path,isolated_installer):
    installer,python=isolated_installer
    first,digest=candidate(tmp_path/'first','first')
    installer.main(['--wheel',str(first),'--sha256',digest,'--npm-url',''])
    second,second_digest=candidate(tmp_path/'second','second')
    checker=tool('contracts_artifact')
    assert hasattr(checker,'verify_selected_install'),'selected archive identity is not checked against the real install'
    with pytest.raises(RuntimeError,match='selected|archive|payload'):
        checker.verify_selected_install(second,second_digest,python=python)


def test_core_install_allows_consumer_metadata_to_be_upgraded_afterward(tmp_path,isolated_installer):
    installer,python=isolated_installer
    site=subprocess.run([str(python),'-I','-c','import sysconfig; print(sysconfig.get_path("purelib"))'],capture_output=True,text=True,check=True)
    stale=Path(site.stdout.strip())/'transition_consumer-0.0.1.dist-info'
    stale.mkdir()
    metadata=stale/'METADATA'
    header='Metadata-Version: 2.1\nName: transition-consumer\nVersion: 0.0.1\n'
    metadata.write_text(header+'Requires-Dist: netcircuit-contracts==1.0.0\n')
    (stale/'RECORD').write_text('')
    wheel,digest=candidate(tmp_path/'selected','selected')
    assert installer.main(['--wheel',str(wheel),'--sha256',digest,'--npm-url',''])==0
    pending=subprocess.run([str(python),'-I','-m','pip','check'],capture_output=True,text=True)
    assert pending.returncode!=0 and 'transition-consumer' in pending.stdout
    metadata.write_text(header+'Requires-Dist: netcircuit-contracts==0.1.1\n')
    completed=subprocess.run([str(python),'-I','-m','pip','check'],capture_output=True,text=True)
    assert completed.returncode==0,completed.stdout+completed.stderr
