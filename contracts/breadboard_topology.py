"""Declared virtual breadboard topology; never a station/GPIO routing profile."""
import json
from importlib.resources import files
from types import MappingProxyType


def _freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({k: _freeze(v) for k, v in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(v) for v in value)
    return value


_data = json.loads(files('contracts').joinpath('design-models/breadboards.json').read_text(encoding='utf-8'))
_profiles = {}
_contacts = {}
for _raw in _data['profiles']:
    _profile = _freeze(_raw)
    _lookup = {c['contactId']: c for c in _profile['contacts']}
    for _kind in _profile['moduleTypes']:
        _profiles[_kind] = _profile
        _contacts[_kind] = _lookup


def get_breadboard_topology(module_type):
    return _profiles.get(module_type)


def get_breadboard_contact(module_type, contact_id):
    return _contacts.get(module_type, {}).get(contact_id)
