"""Select reviewed canonical or immutable legacy Hardware wheels without source fallback."""
import base64
from email.parser import Parser
import hashlib
from importlib import import_module
from importlib.metadata import PackageNotFoundError, distribution
from importlib.resources import files
import json
from pathlib import Path
import re
import subprocess
import sys
from zipfile import ZipFile

try:
    from scripts.environment import getenv
except ModuleNotFoundError:
    from environment import getenv

NAME = 'cirnet-hardware-service'
LEGACY_NAME = 'netcircuit-hardware-service'
VERSION = '0.1.2'
MODULES = ('__init__.py', 'fpga_transport.py', 'models.py', 'rpc.py', 'server.py', 'station/__init__.py', 'station/base.py', 'station/physical.py', 'station/virtual.py')
NAMESPACES = {NAME: ('hardware_service',), LEGACY_NAME: ('hardware_service',)}
DEPENDENCIES = {
    NAME: (tuple(sorted(('cirnet-contracts==0.1.2', 'cirnet-simulator==0.1.2',
                         'grpcio==1.84.0', 'jsonschema==4.26.0', 'protobuf==7.36.2'))),),
    LEGACY_NAME: tuple(tuple(sorted((contracts, 'netcircuit-simulator==0.1.2',
                                    'grpcio==1.84.0', 'jsonschema==4.26.0', 'protobuf==7.36.2')))
                       for contracts in ('cirnet-contracts==0.1.2', 'netcircuit-contracts==0.1.2')),
}


def runtime_modules(name):
    namespace = NAMESPACES[name][0]
    members = {namespace + '/' + module for module in MODULES}
    if len(NAMESPACES[name]) == 2:
        members.add('netcircuit_sim/__init__.py')
    return members


def validate_metadata(value):
    name = value['Name']
    if name not in NAMESPACES or value['Version'] != VERSION:
        raise ValueError(f'Expected {NAME} or {LEGACY_NAME}=={VERSION}; got {name}=={value["Version"]}.')
    dependencies = tuple(sorted(entry.replace(' ', '') for entry in value.get_all('Requires-Dist', []) if ';' not in entry))
    if dependencies not in DEPENDENCIES[name]:
        raise ValueError('Hardware must pin the reviewed Contracts 0.1.2, Simulator 0.1.2, grpcio 1.84.0, protobuf 7.36.2 and jsonschema 4.26.0 dependency matrix.')
    return name


def wheel_name(path):
    with ZipFile(path) as archive:
        metadata = next(name for name in archive.namelist() if name.endswith('.dist-info/METADATA'))
        return Parser().parsestr(archive.read(metadata).decode('utf-8'))['Name']


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
        identity = validate_metadata(Parser().parsestr(archive.read(metadata[0]).decode('utf-8')))
        prefixes = tuple(namespace + '/' for namespace in NAMESPACES[identity])
        runtime = {name for name in names if name.startswith(prefixes) and not name.endswith('/')}
    expected = runtime_modules(identity)
    missing = sorted(expected - runtime)
    if missing:
        raise ValueError('Hardware wheel is missing runtime modules: ' + ', '.join(missing))
    if runtime != expected:
        raise ValueError('Hardware runtime module inventory differs from the reviewed package.')
    return path


def selected_wheel_details(manifest=None):
    selected = manifest or getenv('CIRNET_HARDWARE_ARTIFACT_MANIFEST')
    if not selected:
        raise ValueError('Set CIRNET_HARDWARE_ARTIFACT_MANIFEST to an explicit artifact manifest; no source or latest fallback is allowed.')
    value = json.loads(Path(selected).read_text(encoding='utf-8'))
    if value.get('schemaVersion', 1) != 1:
        raise ValueError('Unsupported Hardware artifact manifest schemaVersion.')
    artifact = value['python']
    return verify_wheel(artifact['path'], artifact['sha256']), artifact['sha256'].lower()


def selected_wheel(manifest=None):
    return selected_wheel_details(manifest)[0]


SELECTED_INSTALL_PROBE = r'''
from importlib.metadata import PackageNotFoundError, distribution
import json
from pathlib import Path
import sys
from zipfile import ZipFile
wheel,digest,name,other,namespaces_json=sys.argv[1:]
try:
    distribution(other)
except PackageNotFoundError:
    pass
else:
    raise ValueError('Canonical and legacy Hardware distributions share an import namespace; use a fresh environment.')
artifact=distribution(name)
assert artifact.version=='0.1.2','selected archive version differs from installation'
direct=json.loads(artifact.read_text('direct_url.json') or '{}')
assert 'dir_info' not in direct,'Hardware must not use an editable/source installation'
info=direct.get('archive_info',{})
actual_digest=info.get('hashes',{}).get('sha256')
if actual_digest is None and info.get('hash','').startswith('sha256='):
    actual_digest=info['hash'].split('=',1)[1]
assert actual_digest==digest,'installed direct_url archive digest differs from selected archive'
namespaces=json.loads(namespaces_json)
prefixes=tuple(namespace+'/' for namespace in namespaces)
with ZipFile(wheel) as archive:
    expected={name for name in archive.namelist() if name.startswith(prefixes) and not name.endswith('/')}
    actual=set()
    for namespace in namespaces:
        root=Path(artifact.locate_file(namespace)).resolve()
        actual.update(namespace+'/'+path.relative_to(root).as_posix() for path in root.rglob('*')
                      if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc')
    assert expected==actual,'installed package inventory differs from selected archive'
    for member in expected:
        assert Path(artifact.locate_file(member)).read_bytes()==archive.read(member),'installed payload differs from selected archive: '+member
print(json.dumps({'selected_sha256':digest,'selected_files':len(expected)}))
'''


def verify_selected_install(wheel, digest, *, python=None):
    wheel = verify_wheel(wheel, digest)
    name = wheel_name(wheel)
    other = LEGACY_NAME if name == NAME else NAME
    result = subprocess.run([str(python or sys.executable), '-I', '-B', '-c', SELECTED_INSTALL_PROBE,
        str(wheel), digest.lower(), name, other, json.dumps(NAMESPACES[name])], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Installed Hardware does not match the selected archive: ' + result.stderr.strip())
    return json.loads(result.stdout)


def installed_artifact():
    selected = []
    for name in NAMESPACES:
        try:
            selected.append((name, distribution(name)))
        except PackageNotFoundError:
            pass
    if len(selected) > 1:
        raise ValueError('Canonical and legacy Hardware distributions share an import namespace; use a fresh environment.')
    if not selected:
        raise PackageNotFoundError(NAME)
    name, artifact = selected[0]
    if artifact.metadata['Name'] != name:
        raise ValueError('Installed Hardware metadata identity differs from its distribution.')
    return artifact


def installed_provenance(*, verify_hashes=True):
    artifact = installed_artifact()
    identity = validate_metadata(artifact.metadata)
    if artifact.read_text('WHEEL') is None or artifact.read_text('RECORD') is None:
        raise ValueError('Hardware must come from an installed wheel with WHEEL and RECORD metadata, not source egg-info.')
    direct = json.loads(artifact.read_text('direct_url.json') or '{}')
    if 'dir_info' in direct:
        raise ValueError('Hardware must come from a wheel, not an editable/source-directory install.')
    namespaces = NAMESPACES[identity]
    namespace = namespaces[0]
    package = import_module(namespace)
    entry = Path(artifact.locate_file(namespace + '/__init__.py')).resolve()
    root = entry.parent
    retained = Path(__file__).resolve().parents[1] / 'services/hardware-service'
    if root.is_relative_to(retained.resolve()):
        raise ValueError('Hardware distribution redirects to retained Remote source.')
    if Path(package.__file__).resolve() != entry or Path(str(files(namespace))).resolve() != root:
        raise ValueError('Hardware imports or resources are shadowed by source.')
    if len(namespaces) == 2 and import_module(namespaces[1]) is not package:
        raise ValueError('Legacy Simulator imports must resolve to the canonical package.')
    checked = set()
    for item in artifact.files or ():
        name = str(item).replace('\\', '/')
        if not name.startswith(tuple(part + '/' for part in namespaces)) or ('__pycache__' in item.parts and item.suffix == '.pyc'):
            continue
        target = Path(artifact.locate_file(item)).resolve()
        package_root = root.parent / name.split('/')[0]
        if not target.is_relative_to(package_root) or not target.is_file():
            raise ValueError(f'Invalid/missing installed Hardware resource: {item}')
        if verify_hashes:
            expected = item.hash
            if expected is None or expected.mode != 'sha256':
                raise ValueError(f'Hardware wheel lacks SHA256 RECORD ownership: {item}')
            actual = base64.urlsafe_b64encode(hashlib.sha256(target.read_bytes()).digest()).rstrip(b'=').decode()
            if actual != expected.value:
                raise ValueError(f'Installed Hardware resource differs from wheel RECORD: {item}')
        checked.add(name)
    if checked != runtime_modules(identity):
        raise ValueError('Installed Hardware RECORD runtime module inventory differs from the reviewed package.')
    actual = set()
    for part in namespaces:
        package_root = root.parent / part
        actual.update(part + '/' + path.relative_to(package_root).as_posix() for path in package_root.rglob('*')
                      if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.pyc')
    if actual != checked:
        raise ValueError('Installed Hardware inventory differs from wheel RECORD ownership.')
    for name, module in tuple(sys.modules.items()):
        if any(name == part or name.startswith(part + '.') for part in namespaces):
            origin = getattr(module, '__file__', None)
            if origin and not Path(origin).resolve().is_relative_to(root):
                raise ValueError(f'Hardware submodule shadowed by source: {name}: {origin}')
    result = {'name': identity, 'version': VERSION, 'package_root': str(root), 'owned_files': len(checked)}
    if getenv('CIRNET_HARDWARE_ARTIFACT_MANIFEST'):
        selected, digest = selected_wheel_details()
        result.update(verify_selected_install(selected, digest))
    return result
