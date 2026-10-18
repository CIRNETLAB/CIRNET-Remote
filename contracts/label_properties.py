"""Plain visual notes use existing module pose, document and history boundaries."""
from copy import deepcopy

from jsonschema import ValidationError

DEFAULT_LABEL_PROPERTIES = dict(version=1, text='Hello', fontSizeMm=3, textColor='#20252A', backgroundColor='#FAFAF7', paddingMm=1)


def normalize_label_properties(properties):
    from .registry import validate_contract
    result = {**DEFAULT_LABEL_PROPERTIES, **deepcopy(properties)}
    try:
        validate_contract('LabelPropertiesV1', result)
    except ValidationError as error:
        raise ValueError(error.message) from error
    return result


def validate_label_annotations(name, value, profile='structural', *, path=()):
    """Reject electrical claims and dangling associations without adding graph fields."""
    from .registry import validate_contract
    from .signal_domains import _fail
    from .breadboard_topology import get_breadboard_topology
    if name in ('SimulationRequest', 'SimulationRequestV2'):
        return validate_label_annotations('CircuitGraph', value['graph'], profile, path=(*path, 'graph'))
    graph = name in ('CircuitGraph', 'CircuitGraphV12', 'AnySupportedCircuitGraph')
    modules = value['modules'] if graph else [value] if name in ('CircuitModule', 'CircuitModuleV12') else []
    by_id = {module['id']: module for module in modules}
    labels = set()
    for index, module in enumerate(modules):
        if module['type'] != 'LABEL':
            continue
        labels.add(module['id'])
        location = [*path, 'modules', index] if graph else list(path)
        if 'mount' in module or 'physicalDescriptor' in module:
            _fail('INVALID_LABEL_MOUNT', location, 'A Label has only a visual board association and cannot have physical mounting.', profile)
        properties = module.get('properties', {})
        try:
            validate_contract('LabelPropertiesV1', properties, profile=profile)
        except ValidationError as error:
            prefix = ''.join('/'+str(part).replace('~', '~0').replace('/', '~1') for part in [*location, 'properties'])
            for issue in error.issues:
                issue['path'] = prefix + issue['path']
            raise
        association = properties.get('boardId')
        if graph and association is not None and get_breadboard_topology(by_id.get(association, {}).get('type')) is None:
            _fail('INVALID_LABEL_BOARD', [*location, 'properties', 'boardId'], 'A Label board association must reference an existing breadboard.', profile)
    if graph and labels:
        for index, edge in enumerate(value['connections']):
            if any(endpoint.split('.')[0] in labels for endpoint in (edge['source'], edge['destination'])):
                _fail('INVALID_LABEL_CONNECTION', [*path, 'connections', index], 'A Label has no electrical ports or nets.', profile)
