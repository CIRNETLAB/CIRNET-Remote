"""Installed release inputs shared by Remote acceptance tests; no source fallback."""
from importlib.metadata import distribution
from importlib.resources import files
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile

from scripts.contracts_artifact import SUPPORTED_NPM_NAMES, installed_contracts
from scripts.environment import getenv

ROOT = Path(__file__).resolve().parents[2]
VERSION = '0.1.1'
INTERFACE_VERSIONS = ('0.1.1', '0.1.2', '0.1.3')


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
    product = installed_contracts()
    if product.version != VERSION or 'dir_info' in json.loads(product.read_text('direct_url.json') or '{}'):
        raise RuntimeError('CIRNET Contracts must be an installed immutable 0.1.1 wheel.')
    relative = _relative(path)
    resource = Path(files('contracts').joinpath(*relative.parts)).resolve(strict=True)
    package = Path(product.locate_file('contracts')).resolve(strict=True)
    if not resource.is_relative_to(package) or package == ROOT / 'contracts':
        raise RuntimeError('Contracts resource escaped the installed distribution.')
    return resource


def device_resource(path):
    return contract_resource('catalog-source/' + _relative(path).as_posix())


def interface_root():
    selected = getenv('CIRNET_INTERFACE_ROOT')
    if not selected:
        raise RuntimeError('CIRNET_INTERFACE_ROOT must select a verified Interface source artifact.')
    candidate = Path(selected)
    if not candidate.is_absolute():
        raise RuntimeError('CIRNET_INTERFACE_ROOT must be absolute.')
    root = candidate.resolve(strict=True)
    if any((parent / '.git').exists() for parent in (root, *root.parents)):
        raise RuntimeError('Interface acceptance requires an exported artifact, not a Git checkout.')
    identity = json.loads((root / 'interface-artifact.json').read_text(encoding='utf-8'))
    package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    if (identity.get('name') not in ('cirnet-interface', 'netcircuit-interface') or identity.get('version') not in INTERFACE_VERSIONS
            or identity.get('contractsVersion') != VERSION or identity.get('kind') != 'source'
            or package.get('version') != identity.get('version') or identity.get('source', {}).get('uncommittedMigration') is not False
            or not re.fullmatch('[0-9a-f]{40}', identity.get('source', {}).get('revision', ''))):
        raise RuntimeError('Interface source identity must select a reviewed committed product version with Contracts 0.1.1.')
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


def sdk_dependency_name(root):
    dependencies = json.loads((root / 'package.json').read_text(encoding='utf-8'))['dependencies']
    matches = [name for name in SUPPORTED_NPM_NAMES if name in dependencies]
    if len(matches) != 1:
        raise RuntimeError('Interface must select exactly one public Contracts dependency.')
    return matches[0]


def sdk_resource(path):
    """Verify released Interface bytes and select explicit producer SDK resources."""
    relative = _relative(path).as_posix()
    root = interface_root()
    lock = json.loads((root / 'integration/contracts-artifacts.json').read_text(encoding='utf-8'))
    archive = root / '.artifacts' / lock['npm']['filename']
    if lock['contractsVersion'] != VERSION or hashlib.sha256(archive.read_bytes()).hexdigest() != lock['npm']['sha256']:
        raise RuntimeError('Interface public SDK archive differs from its exact release lock.')
    package = root / 'node_modules' / sdk_dependency_name(root)
    if package.is_symlink() or not package.resolve(strict=True).is_relative_to(root / 'node_modules'):
        raise RuntimeError('Interface public SDK must be installed inside the selected artifact.')
    metadata = json.loads((package / 'package.json').read_text(encoding='utf-8'))
    if (metadata.get('name') not in SUPPORTED_NPM_NAMES or metadata['name'] != lock['npm']['name']
            or metadata.get('version') != VERSION):
        raise RuntimeError('Interface requires the public SDK 0.1.1 installation.')
    resource = package / 'dist' / relative
    with tarfile.open(archive, 'r:gz') as product:
        if resource.read_bytes() != product.extractfile('package/dist/' + relative).read():
            raise RuntimeError('Interface installed public SDK differs from the selected release bytes.')
    selected_manifest = getenv('CIRNET_CONTRACTS_ARTIFACT_MANIFEST')
    if not selected_manifest:
        return resource
    manifest = json.loads(Path(selected_manifest).read_text(encoding='utf-8'))
    selected = manifest.get('npm')
    if selected is None:
        return resource
    selected_archive = Path(selected['path'])
    digest = selected['sha256']
    if (not selected_archive.is_absolute() or not re.fullmatch('[0-9a-f]{64}', digest)
            or hashlib.sha256(selected_archive.read_bytes()).hexdigest() != digest):
        raise RuntimeError('Selected public SDK archive differs from its explicit digest.')
    if digest == lock['npm']['sha256']:
        return resource
    with tarfile.open(selected_archive, 'r:gz') as product:
        metadata = json.load(product.extractfile('package/package.json'))
        if metadata.get('name') not in SUPPORTED_NPM_NAMES or metadata.get('version') != VERSION:
            raise RuntimeError('Selected public SDK identity differs from Contracts 0.1.1.')
        member_name = 'package/dist/' + relative
        members = [member for member in product.getmembers() if member.name.casefold() == member_name.casefold()]
        if len(members) != 1 or members[0].name != member_name or not members[0].isfile():
            raise RuntimeError('Selected public SDK resource must be a unique regular file.')
        content = product.extractfile(members[0]).read()
    from scripts.artifact_paths import artifact_directory
    from scripts.contract_exports import checked_destination
    output = checked_destination(artifact_directory('selected-sdk-' + digest), relative)
    if output.exists():
        if output.read_bytes() != content:
            raise RuntimeError('Materialized public SDK differs from the selected archive.')
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(content)
    return output


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
