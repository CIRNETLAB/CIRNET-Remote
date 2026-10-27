"""Select immutable local/released artifacts and verify the installed consumer."""
import base64
from email.parser import Parser
import hashlib
from importlib.metadata import distribution
from importlib.resources import files
import json
import os
from pathlib import Path
import sys
import subprocess
from zipfile import ZipFile

VERSION = '0.1.1'
NAME = 'netcircuit-contracts'


def verify_wheel(path, digest):
    path = Path(path)
    if not path.is_absolute():
        raise ValueError('Contracts artifact path must be absolute.')
    if len(digest) != 64 or hashlib.sha256(path.read_bytes()).hexdigest() != digest.lower():
        raise ValueError('Contracts artifact SHA256 does not match the selected manifest.')
    with ZipFile(path) as archive:
        metadata = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
        if len(metadata) != 1:
            raise ValueError('Expected one wheel distribution metadata file.')
        value = Parser().parsestr(archive.read(metadata[0]).decode('utf-8'))
    if value['Name'] != NAME or value['Version'] != VERSION:
        raise ValueError(f'Expected {NAME}=={VERSION}; got {value["Name"]}=={value["Version"]}.')
    return path


def selected_wheel_details(manifest=None):
    selected = manifest or os.environ.get('NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST')
    if not selected:
        raise ValueError('Set NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST to an explicit artifact manifest; no source or latest fallback is allowed.')
    manifest_value = json.loads(Path(selected).read_text(encoding='utf-8'))
    if manifest_value.get('schemaVersion', 1) != 1:
        raise ValueError('Unsupported Contracts artifact manifest schemaVersion.')
    value = manifest_value['python']
    return verify_wheel(value['path'], value['sha256']), value['sha256'].lower()


def selected_wheel(manifest=None):
    return selected_wheel_details(manifest)[0]


SELECTED_INSTALL_PROBE = r'''
from importlib.metadata import distribution
import json
from pathlib import Path
import sys
from zipfile import ZipFile
wheel,digest=sys.argv[1:]
artifact=distribution('netcircuit-contracts')
assert artifact.version=='0.1.1','selected archive version differs from the installation'
direct=json.loads(artifact.read_text('direct_url.json') or '{}')
archive_info=direct.get('archive_info',{})
actual_digest=archive_info.get('hashes',{}).get('sha256')
if actual_digest is None and archive_info.get('hash','').startswith('sha256='):
    actual_digest=archive_info['hash'].split('=',1)[1]
assert actual_digest==digest,'installed direct_url archive digest differs from the selected archive'
root=Path(artifact.locate_file('contracts')).resolve()
with ZipFile(wheel) as archive:
    expected={name for name in archive.namelist() if name.startswith('contracts/') and not name.endswith('/')}
    actual={'contracts/'+path.relative_to(root).as_posix() for path in root.rglob('*')
            if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc'}
    assert expected==actual,'installed package payload inventory differs from selected archive'
    for name in expected:
        assert Path(artifact.locate_file(name)).read_bytes()==archive.read(name),'installed payload differs from selected archive: '+name
print(json.dumps({'selected_sha256':digest,'selected_files':len(expected)}))
'''


def verify_selected_install(wheel, digest, *, python=None):
    wheel = verify_wheel(wheel, digest)
    result = subprocess.run([str(python or sys.executable), '-I', '-c', SELECTED_INSTALL_PROBE,
                             str(wheel), digest.lower()], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Installed payload does not match the selected archive: ' + result.stderr.strip())
    return json.loads(result.stdout)


def installed_provenance(*, verify_hashes=True):
    import contracts
    artifact = distribution(NAME)
    if artifact.version != VERSION:
        raise ValueError(f'Expected {NAME}=={VERSION}; found {artifact.version}.')
    direct = artifact.read_text('direct_url.json')
    if direct and 'dir_info' in json.loads(direct):
        raise ValueError('Contracts must come from a wheel, not an editable/source-directory install.')
    entry = Path(artifact.locate_file('contracts/__init__.py')).resolve()
    root = entry.parent
    if Path(contracts.__file__).resolve() != entry or Path(str(files('contracts'))).resolve() != root:
        raise ValueError('Contracts imports or resources are shadowed by retained source.')
    checked = 0
    for item in artifact.files or ():
        if not str(item).replace('\\', '/').startswith('contracts/'):
            continue
        if '__pycache__' in item.parts and item.suffix == '.pyc':
            continue
        target = Path(artifact.locate_file(item)).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise ValueError(f'Invalid/missing installed Contracts resource: {item}')
        if verify_hashes:
            expected = item.hash
            if expected is None or expected.mode != 'sha256':
                raise ValueError(f'Contracts wheel lacks SHA256 ownership: {item}')
            actual = base64.urlsafe_b64encode(hashlib.sha256(target.read_bytes()).digest()).rstrip(b'=').decode()
            if actual != expected.value:
                raise ValueError(f'Installed Contracts resource differs from wheel RECORD: {item}')
        checked += 1
    if not checked:
        raise ValueError('Installed Contracts has no owned package resources.')
    for name, module in tuple(sys.modules.items()):
        if name == 'contracts' or name.startswith('contracts.'):
            origin = getattr(module, '__file__', None)
            if origin and not Path(origin).resolve().is_relative_to(root):
                raise ValueError(f'Contracts submodule shadowed by source: {name}: {origin}')
    result = {'name': NAME, 'version': VERSION, 'package_root': str(root), 'owned_files': checked}
    if os.environ.get('NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST'):
        selected, digest = selected_wheel_details()
        result.update(verify_selected_install(selected, digest))
    return result
