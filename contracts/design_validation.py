"""Offline structural and physical-binding validation of CircuitGraph 1.x."""
from jsonschema import ValidationError

from .registry import validate_contract


def validate_design_graph(value):
    try:
        validate_contract('AnySupportedCircuitGraph', value, profile='structural')
    except ValidationError as error:
        # Canonical component property checks historically expose ValueError.
        # Preserve that public boundary while retaining the shared issue detail.
        path = list(error.absolute_path)
        if (len(path) >= 4 and path[0] == 'modules' and path[2] == 'properties'
                and error.issues[0]['code'] == 'NONFINITE_NUMBER'):
            property_error = ValueError(error.message)
            property_error.issues = error.issues
            raise property_error from error
        raise
    from .physical_mounting import validate_physical_design
    validate_physical_design(value)
