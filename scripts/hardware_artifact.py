"""Select the independent Hardware wheel and reject retained-source imports."""
import base64
from email.parser import Parser
import hashlib
from importlib.metadata import distribution
from importlib.resources import files
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from zipfile import ZipFile

NAME = 'netcircuit-hardware-service'
VERSION = '0.1.1'
MODULES = ('__init__.py', 'fpga_transport.py', 'models.py', 'rpc.py', 'server.py', 'station/__init__.py', 'station/base.py', 'station/physical.py', 'station/virtual.py')


def verify_wheel(path, digest):
    path = Path(path)
    if not path.is_absolute():
        raise ValueError('Hardware artifact path must be absolute.')
    if not re.fullmatch(r'[0-9a-fA-F]{64}', digest or '') or hashlib.sha256(path.read_bytes()).hexdigest() != digest.lower():
        raise ValueError('Hardware artifact SHA256 does not match the selected manifest.')
    with ZipFile(path) as archive:
        names = archive.namelist()
        metadata = [name for name in names if name.endswith('.dist-info/METADATA')]
        if len(metadata) != 1 or len(names) != len(set(names)):
            raise ValueError('Expected one wheel distribution with unique archive members.')
        value = Parser().parsestr(archive.read(metadata[0]).decode('utf-8'))
        missing = sorted({'hardware_service/' + module for module in MODULES} - set(names))
        runtime = {name for name in names if name.startswith('hardware_service/') and not name.endswith('/')}
    if value['Name'] != NAME or value['Version'] != VERSION:
        raise ValueError(f'Expected {NAME}=={VERSION}; got {value["Name"]}=={value["Version"]}.')
    dependencies = [entry.replace(' ', '') for entry in value.get_all('Requires-Dist', []) if ';' not in entry]
    if sorted(dependencies) != ['grpcio==1.84.0', 'jsonschema==4.26.0', 'netcircuit-contracts==1.0.1', 'netcircuit-simulator==0.2.0', 'protobuf==7.36.2']:
        raise ValueError('Hardware must pin Contracts 1.0.1, Simulator 0.2.0, grpcio 1.84.0, protobuf 7.36.2 and jsonschema 4.26.0.')
    if missing:
        raise ValueError('Hardware wheel is missing runtime modules: ' + ', '.join(missing))
    if runtime != {'hardware_service/' + module for module in MODULES}:
        raise ValueError('Hardware runtime module inventory differs from the reviewed package.')
    return path


def selected_wheel_details(manifest=None):
    selected = manifest or os.environ.get('NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST')
    if not selected:
        raise ValueError('Set NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST to an explicit artifact manifest; no source or latest fallback is allowed.')
    value = json.loads(Path(selected).read_text(encoding='utf-8'))
    if value.get('schemaVersion', 1) != 1:
        raise ValueError('Unsupported Hardware artifact manifest schemaVersion.')
    artifact = value['python']
    return verify_wheel(artifact['path'], artifact['sha256']), artifact['sha256'].lower()


def selected_wheel(manifest=None):
    return selected_wheel_details(manifest)[0]


SELECTED_INSTALL_PROBE = r'''
from importlib.metadata import distribution
import json
from pathlib import Path
import sys
from zipfile import ZipFile
wheel,digest=sys.argv[1:]
artifact=distribution('netcircuit-hardware-service')
assert artifact.version=='0.1.1','selected archive version differs from installation'
direct=json.loads(artifact.read_text('direct_url.json') or '{}')
assert 'dir_info' not in direct,'Hardware must not use an editable/source installation'
info=direct.get('archive_info',{})
actual_digest=info.get('hashes',{}).get('sha256')
if actual_digest is None and info.get('hash','').startswith('sha256='):
    actual_digest=info['hash'].split('=',1)[1]
assert actual_digest==digest,'installed direct_url archive digest differs from selected archive'
root=Path(artifact.locate_file('hardware_service')).resolve()
with ZipFile(wheel) as archive:
    expected={name for name in archive.namelist() if name.startswith('hardware_service/') and not name.endswith('/')}
    actual={'hardware_service/'+path.relative_to(root).as_posix() for path in root.rglob('*')
            if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc'}
    assert expected==actual,'installed package inventory differs from selected archive'
    for name in expected:
        assert Path(artifact.locate_file(name)).read_bytes()==archive.read(name),'installed payload differs from selected archive: '+name
print(json.dumps({'selected_sha256':digest,'selected_files':len(expected)}))
'''


def verify_selected_install(wheel, digest, *, python=None):
    wheel = verify_wheel(wheel, digest)
    result = subprocess.run([str(python or sys.executable), '-I', '-c', SELECTED_INSTALL_PROBE,
        str(wheel), digest.lower()], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Installed Hardware does not match the selected archive: ' + result.stderr.strip())
    return json.loads(result.stdout)


def installed_provenance(*, verify_hashes=True):
    artifact = distribution(NAME)
    if artifact.version != VERSION:
        raise ValueError(f'Expected {NAME}=={VERSION}; found {artifact.version}.')
    if artifact.read_text('WHEEL') is None or artifact.read_text('RECORD') is None:
        raise ValueError('Hardware must come from an installed wheel with WHEEL and RECORD metadata, not source egg-info.')
    direct = json.loads(artifact.read_text('direct_url.json') or '{}')
    if 'dir_info' in direct:
        raise ValueError('Hardware must come from a wheel, not an editable/source-directory install.')
    import hardware_service
    entry = Path(artifact.locate_file('hardware_service/__init__.py')).resolve()
    root = entry.parent
    retained = Path(__file__).resolve().parents[1] / 'services/hardware-service'
    if root.is_relative_to(retained.resolve()):
        raise ValueError('Hardware distribution redirects to retained Remote source.')
    if Path(hardware_service.__file__).resolve() != entry or Path(str(files('hardware_service'))).resolve() != root:
        raise ValueError('Hardware imports or resources are shadowed by source.')
    checked = set()
    for item in artifact.files or ():
        name = str(item).replace('\\', '/')
        if not name.startswith('hardware_service/') or ('__pycache__' in item.parts and item.suffix == '.pyc'):
            continue
        target = Path(artifact.locate_file(item)).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise ValueError(f'Invalid/missing installed Hardware resource: {item}')
        if verify_hashes:
            expected = item.hash
            if expected is None or expected.mode != 'sha256':
                raise ValueError(f'Hardware wheel lacks SHA256 RECORD ownership: {item}')
            actual = base64.urlsafe_b64encode(hashlib.sha256(target.read_bytes()).digest()).rstrip(b'=').decode()
            if actual != expected.value:
                raise ValueError(f'Installed Hardware resource differs from wheel RECORD: {item}')
        checked.add(name)
    expected_modules = {'hardware_service/' + module for module in MODULES}
    if not expected_modules <= checked:
        raise ValueError('Installed Hardware RECORD is missing runtime modules.')
    if checked != expected_modules:
        raise ValueError('Installed Hardware RECORD runtime module inventory differs from the reviewed package.')
    actual = {'hardware_service/' + path.relative_to(root).as_posix() for path in root.rglob('*')
              if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc'}
    if actual != checked:
        raise ValueError('Installed Hardware inventory differs from wheel RECORD ownership.')
    for name, module in tuple(sys.modules.items()):
        if name == 'hardware_service' or name.startswith('hardware_service.'):
            origin = getattr(module, '__file__', None)
            if origin and not Path(origin).resolve().is_relative_to(root):
                raise ValueError(f'Hardware submodule shadowed by source: {name}: {origin}')
    result = {'name': NAME, 'version': VERSION, 'package_root': str(root), 'owned_files': len(checked)}
    if os.environ.get('NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST'):
        selected, digest = selected_wheel_details()
        result.update(verify_selected_install(selected, digest))
    return result
