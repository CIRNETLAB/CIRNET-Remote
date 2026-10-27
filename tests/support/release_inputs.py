"""Installed release inputs shared by Remote acceptance tests; no source fallback."""
from importlib.metadata import distribution
from importlib.resources import files
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.1.1'


def _relative(path):
    value = PurePosixPath(path)
    if value.is_absolute() or '..' in value.parts or '\\' in str(path) or ':' in str(path):
        raise ValueError('Release resource must be a relative product path.')
    return value


def installed_distribution(name):
    product = distribution(name)
    if product.version != VERSION:
        raise RuntimeError(f'{name}=={VERSION} required; found {product.version}.')
    direct = json.loads(product.read_text('direct_url.json') or '{}')
    if 'dir_info' in direct:
        raise RuntimeError(f'{name} must be an installed immutable wheel.')
    return product


def contract_resource(path):
    product = installed_distribution('netcircuit-contracts')
    relative = _relative(path)
    resource = Path(files('contracts').joinpath(*relative.parts)).resolve(strict=True)
    package = Path(product.locate_file('contracts')).resolve(strict=True)
    if not resource.is_relative_to(package) or package == ROOT / 'contracts':
        raise RuntimeError('Contracts resource escaped the installed distribution.')
    return resource


def device_resource(path):
    return contract_resource('catalog-source/' + _relative(path).as_posix())


def interface_root():
    selected = os.environ.get('NETCIRCUIT_INTERFACE_ROOT')
    if not selected:
        raise RuntimeError('NETCIRCUIT_INTERFACE_ROOT must select a verified Interface source artifact.')
    candidate = Path(selected)
    if not candidate.is_absolute():
        raise RuntimeError('NETCIRCUIT_INTERFACE_ROOT must be absolute.')
    root = candidate.resolve(strict=True)
    if any((parent / '.git').exists() for parent in (root, *root.parents)):
        raise RuntimeError('Interface acceptance requires an exported artifact, not a Git checkout.')
    identity = json.loads((root / 'interface-artifact.json').read_text(encoding='utf-8'))
    package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    if (identity.get('name') != 'netcircuit-interface' or identity.get('version') != VERSION
            or identity.get('contractsVersion') != VERSION or identity.get('kind') != 'source'
            or package.get('version') != VERSION or identity.get('source', {}).get('uncommittedMigration') is not False
            or not re.fullmatch('[0-9a-f]{40}', identity.get('source', {}).get('revision', ''))):
        raise RuntimeError('Interface source identity must select the committed 0.1.1 release set.')
    excluded = {'.git', 'node_modules', '.artifacts', '.runtime', '.build', '.test-build', '.benchmark-build', 'dist'}
    fingerprint = hashlib.sha256()
    paths = []
    for directory, directories, filenames in os.walk(root):
        for name in directories:
            path = Path(directory) / name
            if name not in excluded and (path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction())):
                raise RuntimeError('Interface artifact contains an alias.')
        directories[:] = sorted(name for name in directories if name not in excluded)
        for name in filenames:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if relative in {'interface-artifact.json', 'migration/verification.md'}:
                continue
            if path.is_symlink() or (hasattr(path, 'is_junction') and path.is_junction()):
                raise RuntimeError('Interface artifact contains an alias.')
            paths.append((relative, path))
    for relative, path in sorted(paths):
        fingerprint.update((hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + relative + '\n').encode())
    if fingerprint.hexdigest() != identity.get('sourceFingerprint'):
        raise RuntimeError('Interface source fingerprint differs from the selected release bytes.')
    return root


def sdk_resource(path):
    """Use the Interface's installed public SDK and verify against its pinned tarball."""
    relative = _relative(path).as_posix()
    root = interface_root()
    lock = json.loads((root / 'integration/contracts-artifacts.json').read_text(encoding='utf-8'))
    archive = root / '.artifacts' / lock['npm']['filename']
    if lock['contractsVersion'] != VERSION or hashlib.sha256(archive.read_bytes()).hexdigest() != lock['npm']['sha256']:
        raise RuntimeError('Interface public SDK archive differs from its exact release lock.')
    package = root / 'node_modules/@tinihi-labs/contracts'
    if package.is_symlink() or not package.resolve(strict=True).is_relative_to(root / 'node_modules'):
        raise RuntimeError('Interface public SDK must be installed inside the selected artifact.')
    metadata = json.loads((package / 'package.json').read_text(encoding='utf-8'))
    if metadata.get('name') != '@tinihi-labs/contracts' or metadata.get('version') != VERSION:
        raise RuntimeError('Interface requires the public SDK 0.1.1 installation.')
    resource = package / 'dist' / relative
    with tarfile.open(archive, 'r:gz') as product:
        if resource.read_bytes() != product.extractfile('package/dist/' + relative).read():
            raise RuntimeError('Interface installed public SDK differs from the selected release bytes.')
    return resource


def release_resource(path):
    """Resolve compatibility projection names to their current product owners."""
    relative = _relative(path).as_posix()
    if relative.startswith('contracts/'):
        return contract_resource(relative.removeprefix('contracts/'))
    if relative.startswith('device-library/'):
        return device_resource(relative.removeprefix('device-library/'))
    if relative.startswith('apps/web/'):
        projection = relative.removeprefix('apps/web/')
        if projection.startswith('src/data/') and projection.endswith('.json'):
            return sdk_resource('data/' + projection.removeprefix('src/data/'))
        return interface_root() / projection
    raise ValueError('No released product owns this resource: ' + relative)
