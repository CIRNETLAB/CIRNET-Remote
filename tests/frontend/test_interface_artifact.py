"""An exported Interface product is exact release bytes with no filesystem aliases."""
import importlib.util
import hashlib
import io
import json
from pathlib import Path
import tarfile
import pytest

ROOT=Path(__file__).resolve().parents[2]


def installer():
    source=ROOT/'scripts/install_interface.py'
    assert source.exists(),'Remote must own the verified Interface artifact installation adapter.'
    spec=importlib.util.spec_from_file_location('install_interface',source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def archive_bytes(name='package.json',*,symlink=False,metadata_changes=None):
    output=io.BytesIO()
    with tarfile.open(fileobj=output,mode='w:gz') as archive:
        contents=b'{"version":"0.1.1"}'
        member=tarfile.TarInfo(name)
        if symlink:member.type=tarfile.SYMTYPE;member.linkname='../outside'
        else:member.size=len(contents)
        archive.addfile(member,None if symlink else io.BytesIO(contents))
        if name=='package.json' and not symlink:
            identity={'schema':1,'name':'netcircuit-interface','version':'0.1.1',
                'kind':'source','contractsVersion':'0.1.1',
                'source':{'repository':'https://github.com/example/interface.git','revision':'7'*40,'uncommittedMigration':False},
                'sourceFingerprint':hashlib.sha256((hashlib.sha256(contents).hexdigest()+'  package.json\n').encode()).hexdigest()}
            identity.update(metadata_changes or {})
            identity=json.dumps(identity).encode()
            member=tarfile.TarInfo('interface-artifact.json');member.size=len(identity)
            archive.addfile(member,io.BytesIO(identity))
    return output.getvalue()


@pytest.mark.parametrize('name,symlink',[('../escape',False),('/absolute',False),('.git/config',False),('.GIT/HEAD',False),('.Git/config',False),('alias',True)])
def test_interface_product_rejects_escaping_paths_git_metadata_and_links(tmp_path,name,symlink):
    module=installer()
    with pytest.raises(ValueError,match='unsafe'):
        module.extract_product(archive_bytes(name,symlink=symlink),tmp_path)
    assert not list(tmp_path.iterdir())


def test_interface_product_requires_root_manifest_and_released_product_identity(tmp_path):
    module=installer()
    module.extract_product(archive_bytes(),tmp_path/'product')
    assert (tmp_path/'product/package.json').is_file()
    with pytest.raises(ValueError,match='root'):
        module.extract_product(archive_bytes('nested/package.json'),tmp_path/'nested-product')


@pytest.mark.parametrize('names',[['same','same'],['A','a'],['A/one','a/two'],['parent','parent/child'],['parent/child','parent'],['NUL.txt'],['trailing.']])
def test_interface_product_rejects_duplicate_case_alias_and_file_directory_targets(tmp_path,names):
    module=installer(); output=io.BytesIO()
    with tarfile.open(fileobj=output,mode='w:gz') as archive:
        for name in names:
            member=tarfile.TarInfo(name); member.size=1; archive.addfile(member,io.BytesIO(b'x'))
    with pytest.raises(ValueError):module.extract_product(output.getvalue(),tmp_path/'product')
    assert not (tmp_path/'product').exists()


def test_interface_product_caps_declared_expanded_bytes_before_reading_payload(tmp_path):
    import gzip
    module=installer(); member=tarfile.TarInfo('huge');member.size=module.MAX_EXPANDED_BYTES+1
    with pytest.raises(ValueError,match='expanded byte limit'):
        module.extract_product(gzip.compress(member.tobuf()+b'\0'*1024),tmp_path/'product')
    assert not (tmp_path/'product').exists()


def test_interface_product_caps_member_count_before_extracting(tmp_path):
    module=installer();output=io.BytesIO()
    with tarfile.open(fileobj=output,mode='w:gz') as archive:
        for index in range(module.MAX_MEMBERS+1):archive.addfile(tarfile.TarInfo(str(index)))
    with pytest.raises(ValueError,match='member limit'):module.extract_product(output.getvalue(),tmp_path/'product')
    assert not (tmp_path/'product').exists()


def test_partial_extraction_removes_only_its_new_owned_product(tmp_path,monkeypatch):
    module=installer(); sibling=tmp_path/'preserved';sibling.write_text('keep')
    def fail(archive,directory,**kwargs):
        (directory/'partial').write_text('incomplete')
        raise OSError('extraction interrupted')
    monkeypatch.setattr(tarfile.TarFile,'extractall',fail)
    with pytest.raises(OSError,match='interrupted'):module.extract_product(archive_bytes(),tmp_path/'product')
    assert not (tmp_path/'product').exists() and sibling.read_text()=='keep'


@pytest.mark.parametrize('changes',[{'source':{}},{'sourceFingerprint':'f'*64},{'contractsVersion':'2.0.0'},{'kind':'static'},
    {'source':{'repository':'https://github.com/example/interface.git','revision':'7'*40,'uncommittedMigration':True}}])
def test_interface_product_checks_source_identity_and_actual_fingerprint(tmp_path,changes):
    module=installer()
    with pytest.raises(ValueError):module.extract_product(archive_bytes(metadata_changes=changes),tmp_path/'product')
    assert not (tmp_path/'product').exists()
