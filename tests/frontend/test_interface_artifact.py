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


def archive_bytes(name='package.json',*,symlink=False,metadata_changes=None,version='0.1.4'):
    output=io.BytesIO()
    with tarfile.open(fileobj=output,mode='w:gz') as archive:
        contents=json.dumps({'version':version}).encode()
        member=tarfile.TarInfo(name)
        if symlink:member.type=tarfile.SYMTYPE;member.linkname='../outside'
        else:member.size=len(contents)
        archive.addfile(member,None if symlink else io.BytesIO(contents))
        if name=='package.json' and not symlink:
            identity={'schema':1,'name':'cirnet-interface','version':version,
                'kind':'source','contractsVersion':'0.1.2',
                'source':{'repository':'https://github.com/example/interface.git','revision':'7'*40,'uncommittedMigration':False},
                'sourceFingerprint':hashlib.sha256((hashlib.sha256(contents).hexdigest()+'  package.json\n').encode()).hexdigest()}
            identity.update(metadata_changes or {})
            identity=json.dumps(identity).encode()
            member=tarfile.TarInfo('interface-artifact.json');member.size=len(identity)
            archive.addfile(member,io.BytesIO(identity))
    return output.getvalue()


@pytest.mark.parametrize('version',['0.1.4'])
def test_patch_product_is_independent_from_contracts_and_bound_to_selected_version(tmp_path,version):
    module=installer()
    contents=archive_bytes(version=version)
    module.extract_product(contents,tmp_path/'patch',expected_version=version)
    assert json.loads((tmp_path/'patch/package.json').read_text())['version']==version
    for selected,body in [('0.1.3',contents),(version,archive_bytes(version='0.1.3')),('0.1.3',archive_bytes(version='0.1.3'))]:
        with pytest.raises(ValueError):module.extract_product(body,tmp_path/selected,expected_version=selected)
    with pytest.raises(ValueError):
        module.extract_product(archive_bytes(version=version,metadata_changes={'contractsVersion':'0.1.1'}),tmp_path/'wrong-contracts',expected_version=version)


@pytest.mark.parametrize('version',['0.1.1','0.1.2','0.1.3'])
def test_previous_interface_products_are_rejected_before_extraction(tmp_path,version):
    with pytest.raises(ValueError,match='reviewed Interface product version'):
        installer().extract_product(archive_bytes(version=version),tmp_path/'previous')
    assert not (tmp_path/'previous').exists()


@pytest.mark.parametrize('version',['0.1.4'])
def test_patch_product_rejects_identity_and_package_version_mismatch(tmp_path,version):
    with pytest.raises(ValueError):
        installer().extract_product(archive_bytes(version=version,metadata_changes={'version':'0.1.1'}),tmp_path/'wrong')


@pytest.mark.parametrize('field',['URL','SHA256'])
@pytest.mark.parametrize('version',['0.1.4'])
def test_selected_lock_rejects_stale_interface_variables_before_download(tmp_path,monkeypatch,field,version):
    from tests.contracts.test_system_release import release
    module=installer();value=release()
    path=tmp_path/'release.json';path.write_text(json.dumps(value))
    selected=value['repositories']['Interface']['artifacts']['source']
    monkeypatch.setenv('CIRNET_INTERFACE_ARTIFACT_URL',selected['url'])
    monkeypatch.setenv('CIRNET_INTERFACE_ARTIFACT_SHA256',selected['sha256'])
    monkeypatch.setenv('CIRNET_INTERFACE_ARTIFACT_'+field,'stale-variable')
    monkeypatch.setattr(module,'download_artifact',lambda *args:pytest.fail('stale Interface selection reached download'))
    with pytest.raises(ValueError,match='selection'):
        module.main(['--manifest',str(path)])


def test_public_download_keeps_the_interface_source_bound_to_the_lock(tmp_path, monkeypatch):
    from tests.contracts.test_system_release import release

    module = installer()
    value = release()
    product = value['repositories']['Interface']
    artifact = product['artifacts']['source']
    source = {'repository': product['repository'], 'revision': product['sourceRevision'],
              'uncommittedMigration': False}
    contents = archive_bytes(metadata_changes={'source': source})
    artifact['sha256'] = hashlib.sha256(contents).hexdigest()
    downloads = {f"{product['repository']}/releases/download/v0.1.4/{artifact['filename']}":
                 (artifact['sha256'], contents)}
    contracts = value['repositories']['Contracts']
    for kind in ('dev_npm', 'npm', 'sdist'):
        sdk = contracts['artifacts'][kind]
        payload = kind.encode()
        sdk['sha256'] = hashlib.sha256(payload).hexdigest()
        url = f"{contracts['repository']}/releases/download/v0.1.2/{sdk['filename']}"
        downloads[url] = sdk['sha256'], payload
    manifest = tmp_path / 'release.json'
    manifest.write_text(json.dumps(value), encoding='utf-8')
    github_env = tmp_path / 'github-env'
    monkeypatch.setenv('CIRNET_CI_PUBLIC_RELEASE_DOWNLOADS', '1')
    monkeypatch.setattr(module, 'artifact_directory', lambda name: tmp_path)

    def download(url, digest):
        expected_digest, payload = downloads.pop(url)
        assert digest == expected_digest
        return payload

    monkeypatch.setattr(module, 'download_artifact', download)
    assert module.main(['--manifest', str(manifest), '--github-env', str(github_env)]) == 0
    assert not downloads
    assert len(list(tmp_path.glob('product-*/package.json'))) == 1
    environment = dict(line.split('=', 1) for line in github_env.read_text().splitlines())
    assert 'CIRNET_CONTRACTS_ARTIFACT_MANIFEST' not in environment
    sdk_manifest = Path(environment['CIRNET_CI_INTERFACE_CONTRACTS_MANIFEST'])
    selected = json.loads(sdk_manifest.read_text())
    assert set(selected) == {'dev_npm', 'npm', 'sdist'}
    for kind, entry in selected.items():
        path = Path(entry['path'])
        assert path.is_relative_to(tmp_path)
        assert path.read_bytes() == kind.encode()
        assert entry['sha256'] == contracts['artifacts'][kind]['sha256']


@pytest.mark.parametrize('version',['0.1.4'])
def test_selected_interface_requires_exact_source_revision_before_extraction(tmp_path,version):
    module=installer()
    selected={'repository':'https://github.com/cirnetlab/cirnet-interface','sourceRevision':'8'*40}
    source={'repository':selected['repository'],'revision':'7'*40,'uncommittedMigration':False}
    with pytest.raises(ValueError,match='provenance'):
        module.extract_product(archive_bytes(version=version,metadata_changes={'source':source}),tmp_path/'wrong',expected_version=version,expected_source=selected)
    assert not (tmp_path/'wrong').exists()


@pytest.mark.parametrize('suffix',['','.git'])
@pytest.mark.parametrize('version',['0.1.4'])
def test_selected_interface_preserves_known_manifest_repository_suffixes(tmp_path,suffix,version):
    selected={'repository':'https://github.com/cirnetlab/cirnet-interface'+suffix,'sourceRevision':'7'*40}
    source={'repository':'https://github.com/cirnetlab/cirnet-interface.git','revision':'7'*40,'uncommittedMigration':False}
    installer().extract_product(archive_bytes(version=version,metadata_changes={'source':source}),tmp_path/'product',expected_version=version,expected_source=selected)
    assert (tmp_path/'product/package.json').is_file()


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


@pytest.mark.parametrize('repository',['cirnetlab/cirnet-interface'])
@pytest.mark.parametrize('suffix',['','.git'])
def test_interface_product_accepts_canonical_repository_urls_from_native_builder(tmp_path,suffix,repository):
    source={'repository':'https://github.com/'+repository+suffix,
            'revision':'7'*40,'uncommittedMigration':False}
    installer().extract_product(archive_bytes(metadata_changes={'source':source}),tmp_path/'product')
    assert (tmp_path/'product/package.json').is_file()


@pytest.mark.parametrize('repository',[
    'http://github.com/cirnetlab/cirnet-interface',
    'https://github.com/cirnetlab/cirnet-interface?ref=master',
    'https://github.com/cirnetlab/cirnet-interface#master',
    'https://user@github.com/cirnetlab/cirnet-interface',
    'https://github.com/cirnetlab/cirnet-interface-other',
])
def test_interface_product_rejects_aliases_of_unsuffixed_canonical_repository(tmp_path,repository):
    source={'repository':repository,'revision':'7'*40,'uncommittedMigration':False}
    with pytest.raises(ValueError,match='provenance'):
        installer().extract_product(archive_bytes(metadata_changes={'source':source}),tmp_path/'product')
    assert not (tmp_path/'product').exists()


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
