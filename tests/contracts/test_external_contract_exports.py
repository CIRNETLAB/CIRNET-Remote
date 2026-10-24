"""Exports reject descendant aliases before touching any protected fixture file."""
import importlib.util
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest

ROOT=Path(__file__).resolve().parents[2]


def tool(name):
    spec=importlib.util.spec_from_file_location('consumer_'+name,ROOT/'scripts'/f'{name}.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def directory_alias(target,link):
    subprocess.run(['node','-e',"require('node:fs').symlinkSync(process.argv[1],process.argv[2],process.platform==='win32'?'junction':'dir')",str(target),str(link)],check=True)


def test_prebuilt_export_can_replace_an_existing_regular_file(tmp_path,monkeypatch):
    output=tmp_path/'exports'
    module=tool('contract_exports')
    values={'nested/catalog.json':b'first export'}
    monkeypatch.setattr(module,'generated_artifacts',lambda:values)
    module.export(output_root=output)
    assert (output/'nested/catalog.json').read_bytes()==b'first export'
    values['nested/catalog.json']=b'replacement export'
    module.export(output_root=output)
    assert (output/'nested/catalog.json').read_bytes()==b'replacement export'


@pytest.mark.parametrize('alias_kind',['directory','file'])
def test_python_generator_checks_the_complete_leaf_before_writing(tmp_path,monkeypatch,alias_kind):
    output=tmp_path/'exports';output.mkdir()
    destination=tmp_path/'source';destination.mkdir()
    subprocess.run(['git','init','-q',str(destination)],check=True)
    canary=destination/'models.py';canary.write_text('preserve fixture source')
    leaf=output/'models.py'
    if alias_kind=='directory':
        directory_alias(destination,leaf)
    else:
        try:leaf.symlink_to(canary)
        except OSError as error:
            if getattr(error,'winerror',None)==1314:pytest.skip('Windows file-symlink creation privilege is unavailable; directory-junction cases still run.')
            raise
    module=tool('generate_python_contracts')
    calls=[]
    def write_candidate(path):
        calls.append(path)
        path.write_text('candidate generated models')
    monkeypatch.setattr(module,'_generate',write_candidate)
    with pytest.raises((ValueError,RuntimeError),match='outside|inside|external|repository|Git|directory'):
        module.generate(leaf)
    assert not calls
    assert canary.read_text()=='preserve fixture source'


@pytest.mark.parametrize('git_target',[False,True],ids=['other-external-directory','protected-git-checkout'])
def test_prebuilt_export_rejects_descendant_directory_aliases(tmp_path,monkeypatch,git_target):
    output=tmp_path/'exports';output.mkdir()
    destination=tmp_path/'destination';destination.mkdir()
    if git_target:subprocess.run(['git','init','-q',str(destination)],check=True)
    canary=destination/'catalog.json';canary.write_bytes(b'preserve fixture source')
    directory_alias(destination,output/'nested')
    module=tool('contract_exports')
    monkeypatch.setattr(module,'generated_artifacts',lambda:{'nested/catalog.json':b'candidate'})
    with pytest.raises((ValueError,RuntimeError),match='outside|inside|external|repository|Git'):
        module.export(output_root=output)
    assert canary.read_bytes()==b'preserve fixture source'


def test_openapi_export_rejects_a_leaf_file_symlink(tmp_path,monkeypatch):
    output=tmp_path/'exports';output.mkdir()
    destination=tmp_path/'source';destination.mkdir()
    subprocess.run(['git','init','-q',str(destination)],check=True)
    canary=destination/'openapi.json';canary.write_text('preserve fixture source')
    link=output/'openapi.json'
    try:link.symlink_to(canary)
    except OSError as error:
        if getattr(error,'winerror',None)==1314:pytest.skip('Windows file-symlink creation privilege is unavailable; directory-junction cases still run.')
        raise
    module=tool('export_openapi')
    monkeypatch.setitem(sys.modules,'app.main',SimpleNamespace(create_app=lambda **kwargs:SimpleNamespace(openapi=lambda:{})))
    monkeypatch.setattr(module,'installed_provenance',lambda:None)
    with pytest.raises((ValueError,RuntimeError),match='outside|inside|external|repository|Git'):
        module.export(link)
    assert canary.read_text()=='preserve fixture source'


def test_openapi_checks_the_complete_leaf_before_opening_it(tmp_path,monkeypatch):
    output=tmp_path/'exports';output.mkdir()
    destination=tmp_path/'source';destination.mkdir()
    subprocess.run(['git','init','-q',str(destination)],check=True)
    canary=destination/'canary.json';canary.write_text('preserve fixture source')
    leaf=output/'openapi.json'
    directory_alias(destination,leaf)
    module=tool('export_openapi')
    monkeypatch.setitem(sys.modules,'app.main',SimpleNamespace(create_app=lambda **kwargs:SimpleNamespace(openapi=lambda:{})))
    monkeypatch.setattr(module,'installed_provenance',lambda:None)
    with pytest.raises((ValueError,RuntimeError),match='outside|inside|external|repository|Git|directory'):
        module.export(leaf)
    assert canary.read_text()=='preserve fixture source'
