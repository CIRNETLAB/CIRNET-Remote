"""Remote adapter to the installed DEV bridge; Node owns all path/session policy."""
import hashlib
from importlib import import_module
from importlib.metadata import PackageNotFoundError, distribution
import json
import os
try:
    from scripts.environment import getenv, export_environment
except ModuleNotFoundError:
    from environment import getenv, export_environment

from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
try:
    _pin = json.loads((_ROOT / 'integration/contracts-version.json').read_text())['dev']
    _name = _pin.get('name', 'cirnet-artifact-paths')
    if _name not in ('cirnet-artifact-paths', 'netcircuit-artifact-paths'):
        raise RuntimeError('Unsupported pinned DEV distribution.')
    _artifact = distribution(_name)
    _namespace = _name.replace('-', '_')
    if _artifact.version != '1.0.0a1':
        raise RuntimeError('Wrong DEV allocator version.')
    _direct = _artifact.read_text('direct_url.json')
    if _direct and 'dir_info' in json.loads(_direct):
        raise RuntimeError('Editable/source-directory DEV allocator is unsupported.')
    _node = Path(_artifact.locate_file(_namespace + '/artifact-paths.mjs'))
    if hashlib.sha256(_node.read_bytes()).hexdigest() != _pin['node_sha256']:
        raise RuntimeError('DEV allocator resource does not match the pinned wheel.')
    _installed = import_module(_namespace)
except (PackageNotFoundError, OSError, KeyError, RuntimeError) as error:
    raise RuntimeError('Install the pinned independent DEV allocator first: python scripts/install_contracts.py --dev-only --manifest ABSOLUTE_ARTIFACT_MANIFEST. No local policy fallback is available.') from error


def _sync_artifact_environment():
    for suffix in ('ARTIFACTS_CONTEXT', 'ARTIFACTS_SESSION', 'ARTIFACTS_DIR'):
        value = getenv('CIRNET_' + suffix)
        if value is not None:
            os.environ['CIRNET_' + suffix] = os.environ['NETCIRCUIT_' + suffix] = value


def artifact_context(context=None):
    _sync_artifact_environment()
    if context is not None or getenv('CIRNET_ARTIFACTS_CONTEXT'):
        return _installed.artifact_context(context)
    selected = _installed.artifact_context({'owner': 'remote-context-discovery', 'roots': [str(_ROOT)]})
    return {**selected, 'owner': 'git:' + selected['roots'][0]}


def _operation_context(context):
    # The pinned operation already validates an explicit or inherited context.
    # Keep discovery when this checkout has no supplied context.
    if context is None and not getenv('CIRNET_ARTIFACTS_CONTEXT'):
        return artifact_context()
    _sync_artifact_environment()
    return context


def artifact_directory(subdirectory='', directory=None, *, context=None):
    result = _installed.artifact_directory(subdirectory, directory, context=_operation_context(context))
    # The selected immutable allocator owns these output values. Do not let a
    # previous canonical session override a newly allocated legacy session.
    prefix = 'NETCIRCUIT_' if _name == 'netcircuit-artifact-paths' else 'CIRNET_'
    for suffix in ('ARTIFACTS_SESSION', 'ARTIFACTS_CONTEXT'):
        if prefix + suffix in os.environ:
            os.environ['CIRNET_' + suffix] = os.environ['NETCIRCUIT_' + suffix] = os.environ[prefix + suffix]
    return result


def validate_artifact_directory(directory, *, context=None):
    return _installed.validate_artifact_directory(directory, context=_operation_context(context))


def cleanup_artifact_session(directory, *, context=None):
    return _installed.cleanup_artifact_session(directory, context=artifact_context(context))
