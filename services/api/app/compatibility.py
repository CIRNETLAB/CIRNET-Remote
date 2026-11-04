"""Compatibility at the boundary with the immutable published runtime."""
import os
from pathlib import Path
from typing import get_args
try:
    from contracts.runtime_config import getenv as _contract_getenv
except ImportError:
    _contract_getenv = None

SESSION_COOKIE = 'cirnet_session'
LEGACY_SESSION_COOKIE = 'netcircuit_session'
CSRF_HEADER = 'x-cirnet-csrf'
LEGACY_CSRF_HEADER = 'x-csrf-token'
CAPTURE_MEDIA_TYPE = 'application/vnd.cirnet.capture; version=1'
LEGACY_CAPTURE_MEDIA_TYPE = 'application/vnd.netcircuit.capture; version=1'


def getenv(name, default=None):
    if _contract_getenv is not None:
        return _contract_getenv(name, default)
    suffix = name.removeprefix('CIRNET_').removeprefix('NETCIRCUIT_')
    if name.startswith(('CIRNET_', 'NETCIRCUIT_')):
        return os.environ.get('CIRNET_' + suffix, os.environ.get('NETCIRCUIT_' + suffix, default))
    return os.environ.get(name, default)


def default_database_url():
    current = Path('cirnet.db')
    legacy = Path('netcircuit.db')
    selected = legacy if not current.exists() and legacy.is_file() else current
    return 'sqlite:///./' + selected.name


def session_cookie(cookies):
    # An explicitly supplied current credential owns the request even if invalid.
    # Falling back from an invalid current credential could revive a stale login.
    return cookies.get(SESSION_COOKIE) if SESSION_COOKIE in cookies else cookies.get(LEGACY_SESSION_COOKIE)


def csrf_header(headers):
    return headers.get(CSRF_HEADER) if CSRF_HEADER in headers else headers.get(LEGACY_CSRF_HEADER)


def health_service_name():
    from contracts.boundary.models import HealthResponse
    supported = get_args(HealthResponse.model_fields['service'].annotation)
    return 'cirnet-api' if 'cirnet-api' in supported else 'netcircuit-api'


def load_schema(uri):
    from contracts.registry import entries, load_schema as selected_schema
    known = {entry['uri'] for entry in entries() if entry['kind'] == 'schema'}
    base = uri.split('#', 1)[0]
    if base not in known and base.startswith('https://cirnet.local/'):
        legacy = uri.replace('https://cirnet.local/', 'https://netcircuit.local/', 1)
        if legacy.split('#', 1)[0] in known:
            uri = legacy
    return selected_schema(uri)
