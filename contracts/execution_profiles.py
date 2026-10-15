"""Data adapter for the existing simulator's optional execution-profile field.

Editor descriptors and mounting validation never require this adapter. This does
not add execution capabilities: absent profiles remain explicitly unavailable.
"""
from .physical_mounting import get_physical_part


def get_execution_part(module_type):
    part = get_physical_part(module_type)
    if part is None or part.get('simulation') is not None:
        return part
    return {**part, 'simulation': {
        'model': 'unavailable', 'status': 'unsupported',
        'reason': 'No execution profile is available for this component; placement and wiring remain available.',
    }}
