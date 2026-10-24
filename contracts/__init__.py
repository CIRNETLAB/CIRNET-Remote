"""Compatibility entrypoint forwarding exclusively to the selected Contracts wheel.

The sibling files are retained migration references. They are never runtime
fallbacks; package modules and importlib.resources use the wheel's full spec.
"""
from importlib.metadata import PackageNotFoundError, distribution
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import sys

_EXPECTED_VERSION = '1.0.1'
_legacy = Path(__file__).resolve().parent
try:
    _distribution = distribution('netcircuit-contracts')
except PackageNotFoundError as error:
    raise ImportError('netcircuit-contracts==1.0.1 is not installed; install the pinned wheel before starting Remote.') from error
if _distribution.version != _EXPECTED_VERSION:
    raise ImportError(f'Remote requires netcircuit-contracts=={_EXPECTED_VERSION}; found {_distribution.version}.')
_direct = _distribution.read_text('direct_url.json')
if _direct and 'dir_info' in json.loads(_direct):
    raise ImportError('Remote requires a versioned Contracts wheel; source-directory/editable installs are unsupported.')
_entries = {str(item).replace('\\', '/') for item in (_distribution.files or ())}
if 'contracts/__init__.py' not in _entries:
    raise ImportError('Installed Contracts distribution has no wheel-owned package entrypoint.')
_entry = Path(_distribution.locate_file('contracts/__init__.py')).resolve()
if _entry.parent == _legacy or not _entry.is_file():
    raise ImportError('Installed Contracts resolves to retained Remote source; install the pinned independent wheel.')
_spec = spec_from_file_location(__name__, _entry, submodule_search_locations=[str(_entry.parent)])
if _spec is None or _spec.loader is None:
    raise ImportError('Cannot load the installed Contracts wheel entrypoint.')
_installed = module_from_spec(_spec)
sys.modules[__name__] = _installed
try:
    _spec.loader.exec_module(_installed)
except BaseException:
    sys.modules.pop(__name__, None)
    raise
