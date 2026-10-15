"""Canonical SI design properties and explicit legacy migration, without engines."""
from copy import deepcopy
import math


PROPERTY_BOUNDS = {
    'resistanceOhms': (.1, 1e9), 'powerWatts': (.001, 100), 'tolerancePercent': (.001, 20),
    'capacitanceFarads': (1e-12, 1), 'voltageRatingVolts': (.1, 10000),
}
PROPERTY_KEYS = {
    'RESISTOR_AXIAL': ('resistanceOhms', 'powerWatts', 'tolerancePercent'),
    'CAPACITOR_CERAMIC': ('capacitanceFarads', 'voltageRatingVolts'),
    'CAPACITOR_ELECTROLYTIC': ('capacitanceFarads', 'voltageRatingVolts'),
}


def validate_component_properties(module_type, properties):
    """Validate present properties; old instances may rely on descriptor defaults."""
    for key in PROPERTY_KEYS.get(module_type, ()):
        if key not in properties:
            continue
        value = properties[key]
        low, high = PROPERTY_BOUNDS[key]
        try:
            valid = type(value) in (int, float) and math.isfinite(value) and low <= value <= high
        except OverflowError:
            valid = False
        if not valid:
            raise ValueError(f'{key} must be a finite SI number between {low} and {high}')


def normalize_component_properties(module_type, properties):
    """Migrate only the documented old resistor spelling, preserving custom data."""
    result = deepcopy(properties)
    if module_type == 'RESISTOR_AXIAL' and 'resistance_ohm' in result:
        if 'resistanceOhms' not in result:
            result['resistanceOhms'] = result['resistance_ohm']
        del result['resistance_ohm']
    validate_component_properties(module_type, result)
    return result


def normalize_design_properties(graph):
    """Copy a saved graph; IDs, revisions, mounting and connections stay intact."""
    result = deepcopy(graph)
    for module in result['modules']:
        if 'properties' in module:
            module['properties'] = normalize_component_properties(module['type'], module['properties'])
    return result
