"""Remote adapter to the installed DEV bridge; Node owns all path/session policy."""
import hashlib
from importlib.metadata import PackageNotFoundError, distribution
import json
import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
try:
    _artifact = distribution('netcircuit-artifact-paths')
    if _artifact.version != '1.0.0a1':
        raise RuntimeError('Wrong DEV allocator version.')
    _direct = _artifact.read_text('direct_url.json')
    if _direct and 'dir_info' in json.loads(_direct):
        raise RuntimeError('Editable/source-directory DEV allocator is unsupported.')
    _pin = json.loads((_ROOT / 'integration/contracts-version.json').read_text())['dev']
    _node = Path(_artifact.locate_file('netcircuit_artifact_paths/artifact-paths.mjs'))
    if hashlib.sha256(_node.read_bytes()).hexdigest() != _pin['node_sha256']:
        raise RuntimeError('DEV allocator resource does not match the pinned wheel.')
    import netcircuit_artifact_paths as _installed
except (PackageNotFoundError, OSError, KeyError, RuntimeError) as error:
    raise RuntimeError('Install the pinned independent DEV allocator first: python scripts/install_contracts.py --dev-only --manifest ABSOLUTE_ARTIFACT_MANIFEST. No local policy fallback is available.') from error


def artifact_context(context=None):
    if context is not None or os.environ.get('NETCIRCUIT_ARTIFACTS_CONTEXT'):
        return _installed.artifact_context(context)
    selected = _installed.artifact_context({'owner': 'remote-context-discovery', 'roots': [str(_ROOT)]})
    return {**selected, 'owner': 'git:' + selected['roots'][0]}


def artifact_directory(subdirectory='', directory=None, *, context=None):
    return _installed.artifact_directory(subdirectory, directory, context=artifact_context(context))


def validate_artifact_directory(directory, *, context=None):
    return _installed.validate_artifact_directory(directory, context=artifact_context(context))


def cleanup_artifact_session(directory, *, context=None):
    return _installed.cleanup_artifact_session(directory, context=artifact_context(context))
