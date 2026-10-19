"""Python bridge to the single Node artifact path/ownership implementation."""
import os
from pathlib import Path
import shutil
import subprocess

_CLI = Path(__file__).resolve().with_name('artifact-paths.mjs')


def _invoke(*arguments):
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node is required by the shared artifact allocator; no repository fallback is allowed.')
    try:
        result = subprocess.run([node, str(_CLI), *map(str, arguments)], capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(error.stderr.strip() or 'Artifact allocator failed; no repository fallback is allowed.') from error
    return result.stdout.strip()


def artifact_directory(subdirectory='', directory=None):
    arguments = ['--directory', directory] if directory is not None else []
    # A separate CLI process cannot export its environment to Python: inherit the
    # allocated root explicitly so backend subprocesses reuse this exact session.
    session = Path(_invoke(*arguments))
    if directory is None:
        os.environ['NETCIRCUIT_ARTIFACTS_SESSION'] = str(session)
    if not subdirectory:
        return session
    environment = os.environ.copy()
    try:
        os.environ['NETCIRCUIT_ARTIFACTS_SESSION'] = str(session)
        return Path(_invoke(subdirectory))
    finally:
        if directory is not None:
            if 'NETCIRCUIT_ARTIFACTS_SESSION' in environment:
                os.environ['NETCIRCUIT_ARTIFACTS_SESSION'] = environment['NETCIRCUIT_ARTIFACTS_SESSION']
            else:
                os.environ.pop('NETCIRCUIT_ARTIFACTS_SESSION', None)


def validate_artifact_directory(directory):
    return Path(_invoke('--validate', directory))


def cleanup_artifact_session(directory):
    _invoke('--cleanup', directory)
    if os.environ.get('NETCIRCUIT_ARTIFACTS_SESSION') == str(directory):
        os.environ.pop('NETCIRCUIT_ARTIFACTS_SESSION', None)
