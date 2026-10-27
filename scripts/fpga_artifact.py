"""Verify explicitly selected FPGA source releases; never import retained RTL."""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import uuid

try:
    from scripts.artifact_paths import artifact_directory
except ModuleNotFoundError:
    from artifact_paths import artifact_directory

MAX_MEMBERS = 10_000
MAX_EXPANDED_BYTES = 128 * 1024 * 1024
MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
IDENTITY = 'fpga-artifact.json'
PINS = {'schemaVersion': 1, 'name': 'netcircuit-fpga-scaffold', 'version': '0.1.1',
    'kind': 'source', 'contractsVersion': '0.1.1', 'logicalProtocolVersion': '1.0-scaffold',
    'registerMapVersion': '1.0-reserved', 'physicalAvailable': False}
REPOSITORY = 'https://github.com/TINIHI-Labs/net-Circuit-FPGA.git'
ORIGINAL_REPOSITORY = 'https://github.com/net-Circuit-Remote/net-Circuit-Remote.git'
ORIGINAL_REVISION = 'f43f92c7730d40040e717bf1bacd3a3773e2a131'


def _object(pairs):
    value = {}
    for key, item in pairs:
        if key in value: raise ValueError('Duplicate JSON property in FPGA metadata.')
        value[key] = item
    return value


def read_json(contents):
    return json.loads(contents, object_pairs_hook=_object)


def _path(name):
    path = PurePosixPath(name)
    if (not path.parts or path.is_absolute() or '..' in path.parts or name != path.as_posix()
            or '\\' in name or ':' in name or any(ord(char) < 32 for char in name)
            or any(part.casefold() == '.git' or part.endswith(('.', ' '))
                or re.fullmatch(r'(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\..*)?', part, re.IGNORECASE)
                for part in path.parts)):
        raise ValueError('FPGA archive contains an unsafe path or Windows alias.')
    return path.as_posix()


def _sha(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def _alias(path):
    # Windows junctions and other reparse points are aliases too, including on
    # Python versions predating Path.is_junction().
    return path.is_symlink() or bool(getattr(path.lstat(), 'st_file_attributes', 0) & 0x400)


def _check_ancestors(path):
    if any(_alias(item) for item in (path, *path.parents)):
        raise ValueError('FPGA product path or ancestor cannot be an alias.')


def _identity(identity, contents):
    if not isinstance(identity, dict) or any(type(identity.get(key)) is not type(value)
            or identity[key] != value for key, value in PINS.items()):
        raise ValueError('FPGA source identity must match source 0.1.1 and Contracts 0.1.1/logical 1.0-scaffold pins.')
    source = identity.get('source')
    if (not isinstance(source, dict) or source.get('repository') != REPOSITORY
            or source.get('originalRepository') != ORIGINAL_REPOSITORY
            or source.get('originalRevision') != ORIGINAL_REVISION
            or not isinstance(source.get('revision'), str) or not re.fullmatch('[0-9a-f]{40}', source['revision'])
            or type(source.get('uncommittedMigration')) is not bool):
        raise ValueError('FPGA source provenance must explicitly identify both repositories/revisions and migration state.')
    files = identity.get('files')
    if (not isinstance(files, dict) or not files or IDENTITY in files
            or any(not _sha(digest) for digest in files.values())):
        raise ValueError('FPGA files inventory requires exact source hashes.')
    for name in files: _path(name)
    if set(contents) != set(files) | {IDENTITY}:
        raise ValueError('FPGA source payload inventory differs from its complete files manifest.')
    fingerprint = hashlib.sha256()
    for name in sorted(files):
        if hashlib.sha256(contents[name]).hexdigest() != files[name]:
            raise ValueError('FPGA source payload hash differs: ' + name)
        fingerprint.update(f'{files[name]}  {name}\n'.encode('utf-8'))
    if fingerprint.hexdigest() != identity.get('sourceFingerprint'):
        raise ValueError('FPGA sourceFingerprint differs from its source inventory.')
    return identity


def verify_archive(path, digest):
    path = Path(path)
    if not path.is_absolute(): raise ValueError('FPGA archive path must be absolute.')
    if path.stat().st_size > MAX_ARCHIVE_BYTES: raise ValueError('FPGA archive exceeds its compressed byte limit.')
    contents = path.read_bytes()
    if not _sha(digest) or hashlib.sha256(contents).hexdigest() != digest:
        raise ValueError('FPGA archive SHA256 differs from its selected manifest.')
    files = {}; targets = {}; spelling = {}; directories = set(); expanded = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(contents), mode='r:gz') as archive:
            for count, member in enumerate(archive, 1):
                if count > MAX_MEMBERS: raise ValueError('FPGA archive exceeds its member limit.')
                if member.size < 0: raise ValueError('FPGA archive has a negative member size.')
                expanded += member.size
                if expanded > MAX_EXPANDED_BYTES: raise ValueError('FPGA archive exceeds its expanded byte limit.')
                if not (member.isfile() or member.isdir()) or member.issym() or member.islnk() or member.sparse is not None:
                    raise ValueError('FPGA archive contains an alias, sparse or special member.')
                name = _path(member.name); parts = PurePosixPath(name).parts; key = name.casefold()
                if key in targets: raise ValueError('FPGA archive contains duplicate paths.')
                for index in range(1, len(parts) + 1):
                    prefix = '/'.join(parts[:index]); folded = prefix.casefold()
                    if folded in spelling and spelling[folded] != prefix:
                        raise ValueError('FPGA archive contains case-colliding paths.')
                    spelling[folded] = prefix
                if member.isfile() and key in directories: raise ValueError('FPGA archive has a file/directory collision.')
                for index in range(1, len(parts)):
                    ancestor = '/'.join(parts[:index]).casefold()
                    if targets.get(ancestor) == 'file': raise ValueError('FPGA archive has a file/directory collision.')
                    directories.add(ancestor)
                targets[key] = 'file' if member.isfile() else 'directory'
                if member.isfile():
                    if name == IDENTITY and member.size > 1024 * 1024: raise ValueError('FPGA identity is oversized.')
                    files[name] = archive.extractfile(member).read()
                elif member.size: raise ValueError('FPGA directory member carries unexpected data.')
    except (tarfile.TarError, EOFError) as error:
        raise ValueError('FPGA archive is malformed or truncated.') from error
    if IDENTITY not in files: raise ValueError('FPGA source archive requires fpga-artifact.json.')
    identity = _identity(read_json(files[IDENTITY]), files)
    # Empty/unlisted directories are also unreviewed archive content.
    implied = {str(parent).casefold() for name in files for parent in PurePosixPath(name).parents if str(parent) != '.'}
    if any(kind == 'directory' and key not in implied for key, kind in targets.items()):
        raise ValueError('FPGA archive contains an unreviewed empty directory.')
    return {'identity': identity, 'files': files, 'archive': path, 'sha256': digest}


def selected_source_details(manifest=None):
    selected = manifest if manifest is not None else os.environ.get('NETCIRCUIT_FPGA_ARTIFACT_MANIFEST')
    if not selected: raise ValueError('Select an explicit NETCIRCUIT_FPGA_ARTIFACT_MANIFEST; no source/latest fallback is allowed.')
    path = Path(selected)
    if not path.is_absolute(): raise ValueError('FPGA manifest path must be absolute.')
    value = read_json(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict) or type(value.get('schemaVersion')) is not int or value['schemaVersion'] != 1:
        raise ValueError('Unsupported FPGA artifact manifest schemaVersion.')
    source = value.get('source', {})
    if not isinstance(source, dict) or not isinstance(source.get('path'), str) or not source['path']:
        raise ValueError('FPGA source manifest requires an absolute archive path and SHA256.')
    archive, digest = Path(source['path']), source.get('sha256')
    verify_archive(archive, digest)
    return archive, digest


def extract_product(archive, digest):
    verified = verify_archive(archive, digest)
    parent = artifact_directory('fpga-products'); parent.mkdir(parents=True, exist_ok=True)
    _check_ancestors(parent)
    parent = parent.resolve(strict=True)
    directory = parent / ('product-' + uuid.uuid4().hex)
    directory.mkdir(exist_ok=False)
    try:
        for name, contents in verified['files'].items():
            target = directory.joinpath(*PurePosixPath(name).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as output: output.write(contents)
    except BaseException:
        if directory.resolve(strict=True).parent != parent or _alias(directory):
            raise RuntimeError('Refusing cleanup of an aliased FPGA extraction target.')
        shutil.rmtree(directory)
        raise
    return directory


def source_product(root=None, manifest=None):
    selected = root if root is not None else os.environ.get('NETCIRCUIT_FPGA_ROOT')
    if not selected: raise ValueError('Select an explicit NETCIRCUIT_FPGA_ROOT; retained fpga is not a fallback.')
    directory = Path(selected)
    if not directory.is_absolute(): raise ValueError('FPGA product root must be absolute.')
    _check_ancestors(directory)
    archive, digest = selected_source_details(manifest)
    verified = verify_archive(archive, digest)
    contents = {}; actual = {}
    implied = {str(parent) for name in verified['files'] for parent in PurePosixPath(name).parents if str(parent) != '.'}
    for path in directory.rglob('*'):
        if _alias(path): raise ValueError('FPGA product contains an alias.')
        name = path.relative_to(directory).as_posix()
        if path.is_file(): actual[name] = path
        elif path.is_dir():
            if name not in implied: raise ValueError('FPGA product directory inventory differs from its selected archive.')
        else: raise ValueError('FPGA product contains a special file.')
    if set(actual) != set(verified['files']): raise ValueError('FPGA product payload inventory differs from its selected archive.')
    for name, path in actual.items():
        if path.stat().st_size != len(verified['files'][name]): raise ValueError('FPGA product payload size differs: ' + name)
        contents[name] = path.read_bytes()
    if contents != verified['files']: raise ValueError('Selected FPGA product payload differs from its selected archive.')
    return {**verified, 'root': directory.resolve(strict=True)}
