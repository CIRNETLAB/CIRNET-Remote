"""Environment compatibility needed before the Contracts wheel is installed.

Product code uses contracts.runtime_config. Bootstrap cannot import a dependency
it is about to install; this adapter only translates the two setting prefixes.
"""
import os
from pathlib import Path


def getenv(name, default=None, environ=None):
    values = os.environ if environ is None else environ
    canonical = 'CIRNET_' + name[len('NETCIRCUIT_'):] if name.startswith('NETCIRCUIT_') else name
    if canonical in values:
        return values[canonical]
    if canonical.startswith('CIRNET_'):
        return values.get('NETCIRCUIT_' + canonical[len('CIRNET_'):], default)
    return values.get(name, default)


def export_environment(environ=None):
    values = dict(os.environ if environ is None else environ)
    suffixes = {key.split('_', 1)[1] for key in values if key.startswith(('CIRNET_', 'NETCIRCUIT_'))}
    for suffix in suffixes:
        value = getenv('CIRNET_' + suffix, environ=values)
        values['CIRNET_' + suffix] = values['NETCIRCUIT_' + suffix] = value
    return values


def append_environment(values, path):
    """Export current settings and their aliases to a GitHub environment file."""
    exported = export_environment(values)
    if any('\n' in str(value) or '\r' in str(value) for value in exported.values()):
        raise ValueError('Environment exports must contain single-line values.')
    with Path(path).open('a', encoding='utf-8') as output:
        output.writelines(f'{key}={value}\n' for key, value in exported.items())
