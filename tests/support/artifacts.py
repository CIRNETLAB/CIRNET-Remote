"""Isolate disposable allocator sessions from the parent verification session."""
import os
from pathlib import Path


def isolated_environment(monkeypatch, parent):
    # Allocators publish directly to os.environ. Register both aliases with
    # monkeypatch so teardown restores even previously absent settings.
    suffixes = {key.split('_', 1)[1] for key in os.environ if key.startswith(('CIRNET_', 'NETCIRCUIT_'))}
    suffixes.update(('ARTIFACTS_SESSION', 'ARTIFACTS_CONTEXT', 'ARTIFACTS_DIR', 'ARTIFACTS_CLI'))
    for suffix in suffixes:
        for prefix in ('CIRNET_', 'NETCIRCUIT_'):
            key = prefix + suffix
            previous = os.environ.get(key)
            monkeypatch.setenv(key, previous if previous is not None else '')
            if previous is None:
                monkeypatch.delenv(key)
    for prefix in ('CIRNET_', 'NETCIRCUIT_'):
        monkeypatch.delenv(prefix + 'ARTIFACTS_SESSION', raising=False)
        monkeypatch.delenv(prefix + 'ARTIFACTS_CLI', raising=False)
        monkeypatch.setenv(prefix + 'ARTIFACTS_DIR', str(parent))


def cleanup_owned_session(session, parent):
    from scripts.artifact_paths import cleanup_artifact_session
    selected, boundary = Path(session).resolve(), Path(parent).resolve()
    if selected == boundary or not selected.is_relative_to(boundary):
        raise AssertionError('Refusing test cleanup outside the disposable fixture parent.')
    return cleanup_artifact_session(selected)
