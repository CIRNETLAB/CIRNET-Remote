"""Select the independent Simulator wheel and reject retained-source imports."""
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

NAME = 'netcircuit-simulator'
VERSION = '0.1.1'
MODULES = ('__init__.py', 'analog.py', 'backends.py', 'circuit.py', 'dispatch.py', 'engine.py', 'logic.py', 'nets.py', 'waveform.py')


def verify_wheel(path, digest):
    path = Path(path)
    if not path.is_absolute():
        raise ValueError('Simulator artifact path must be absolute.')
    if not re.fullmatch(r'[0-9a-fA-F]{64}', digest or '') or hashlib.sha256(path.read_bytes()).hexdigest() != digest.lower():
        raise ValueError('Simulator artifact SHA256 does not match the selected manifest.')
    with ZipFile(path) as archive:
        names = archive.namelist()
        metadata = [name for name in names if name.endswith('.dist-info/METADATA')]
        if len(metadata) != 1 or len(names) != len(set(names)):
            raise ValueError('Expected one wheel distribution with unique archive members.')
        value = Parser().parsestr(archive.read(metadata[0]).decode('utf-8'))
        missing = sorted({'netcircuit_sim/' + module for module in MODULES} - set(names))
    if value['Name'] != NAME or value['Version'] != VERSION:
        raise ValueError(f'Expected {NAME}=={VERSION}; got {value["Name"]}=={value["Version"]}.')
    dependencies = [entry.replace(' ', '') for entry in value.get_all('Requires-Dist', []) if ';' not in entry]
    if sorted(dependencies) != ['jsonschema==4.26.0', 'netcircuit-contracts==0.1.1']:
        raise ValueError('Simulator must pin Contracts 0.1.1 and its direct jsonschema 4.26.0 dependency.')
    if missing:
        raise ValueError('Simulator wheel is missing runtime modules: ' + ', '.join(missing))
    return path


def selected_wheel_details(manifest=None):
    selected = manifest or os.environ.get('NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST')
    if not selected:
        raise ValueError('Set NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST to an explicit artifact manifest; no source or latest fallback is allowed.')
    value = json.loads(Path(selected).read_text(encoding='utf-8'))
    if value.get('schemaVersion', 1) != 1:
        raise ValueError('Unsupported Simulator artifact manifest schemaVersion.')
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
artifact=distribution('netcircuit-simulator')
assert artifact.version=='0.1.1','selected archive version differs from installation'
direct=json.loads(artifact.read_text('direct_url.json') or '{}')
assert 'dir_info' not in direct,'Simulator must not use an editable/source installation'
info=direct.get('archive_info',{})
actual_digest=info.get('hashes',{}).get('sha256')
if actual_digest is None and info.get('hash','').startswith('sha256='):
    actual_digest=info['hash'].split('=',1)[1]
assert actual_digest==digest,'installed direct_url archive digest differs from selected archive'
root=Path(artifact.locate_file('netcircuit_sim')).resolve()
with ZipFile(wheel) as archive:
    expected={name for name in archive.namelist() if name.startswith('netcircuit_sim/') and not name.endswith('/')}
    actual={'netcircuit_sim/'+path.relative_to(root).as_posix() for path in root.rglob('*')
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
        raise RuntimeError('Installed Simulator does not match the selected archive: ' + result.stderr.strip())
    return json.loads(result.stdout)


def installed_provenance(*, verify_hashes=True):
    artifact = distribution(NAME)
    if artifact.version != VERSION:
        raise ValueError(f'Expected {NAME}=={VERSION}; found {artifact.version}.')
    if artifact.read_text('WHEEL') is None or artifact.read_text('RECORD') is None:
        raise ValueError('Simulator must come from an installed wheel with WHEEL and RECORD metadata, not source egg-info.')
    direct = json.loads(artifact.read_text('direct_url.json') or '{}')
    if 'dir_info' in direct:
        raise ValueError('Simulator must come from a wheel, not an editable/source-directory install.')
    import netcircuit_sim
    entry = Path(artifact.locate_file('netcircuit_sim/__init__.py')).resolve()
    root = entry.parent
    retained = Path(__file__).resolve().parents[1] / 'simulator/circuit-simulator'
    if root.is_relative_to(retained.resolve()):
        raise ValueError('Simulator distribution redirects to retained Remote source.')
    if Path(netcircuit_sim.__file__).resolve() != entry or Path(str(files('netcircuit_sim'))).resolve() != root:
        raise ValueError('Simulator imports or resources are shadowed by source.')
    checked = set()
    for item in artifact.files or ():
        name = str(item).replace('\\', '/')
        if not name.startswith('netcircuit_sim/') or ('__pycache__' in item.parts and item.suffix == '.pyc'):
            continue
        target = Path(artifact.locate_file(item)).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise ValueError(f'Invalid/missing installed Simulator resource: {item}')
        if verify_hashes:
            expected = item.hash
            if expected is None or expected.mode != 'sha256':
                raise ValueError(f'Simulator wheel lacks SHA256 RECORD ownership: {item}')
            actual = base64.urlsafe_b64encode(hashlib.sha256(target.read_bytes()).digest()).rstrip(b'=').decode()
            if actual != expected.value:
                raise ValueError(f'Installed Simulator resource differs from wheel RECORD: {item}')
        checked.add(name)
    if not {'netcircuit_sim/' + module for module in MODULES} <= checked:
        raise ValueError('Installed Simulator RECORD is missing runtime modules.')
    for name, module in tuple(sys.modules.items()):
        if name == 'netcircuit_sim' or name.startswith('netcircuit_sim.'):
            origin = getattr(module, '__file__', None)
            if origin and not Path(origin).resolve().is_relative_to(root):
                raise ValueError(f'Simulator submodule shadowed by source: {name}: {origin}')
    result = {'name': NAME, 'version': VERSION, 'package_root': str(root), 'owned_files': len(checked)}
    if os.environ.get('NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST'):
        selected, digest = selected_wheel_details()
        result.update(verify_selected_install(selected, digest))
    return result
