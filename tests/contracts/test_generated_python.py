"""Generated Python boundaries preserve canonical wire values before coercion."""
from copy import deepcopy
import importlib
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[2]


def models():
    try:
        return importlib.import_module('contracts.boundary.models')
    except ModuleNotFoundError:
        pytest.fail('Canonical Python boundaries have not been generated')


def graph():
    return {'schema_version': '1.0', 'circuit_id': 'legacy', 'modules': [
        {'id': 'S', 'type': 'DIGITAL_SWITCH', 'unknown_future_field': {'keep': False}}
    ], 'connections': [], 'metadata': {'keep': [0, False, '']}}


def test_generated_graph_preserves_unbounded_legacy_numbers_and_omission():
    value = graph()
    value['modules'][0].update(position={'x': 10**400}, rotation=10**400)
    original = deepcopy(value)
    parsed = models().CircuitGraph.model_validate(value)
    assert parsed.model_dump() == original
    assert type(parsed.modules[0].position.x) is int
    assert value == original


@pytest.mark.parametrize('patch', [
    {'schema_version': 1.0}, {'metadata': None}, {'unrecognized_core_field': 0},
    {'modules': [{'id': 'S', 'type': 'DIGITAL_SWITCH', 'position': {'x': True}}]},
    {'modules': [{'id': 'S', 'type': 'DIGITAL_SWITCH', 'rotation': '90'}]},
])
def test_generated_graph_rejects_coercion_null_and_unknown_core_fields(patch):
    with pytest.raises(ValidationError):
        models().CircuitGraph.model_validate({**graph(), **patch})


def test_generated_optional_fields_are_absent_until_explicitly_supplied():
    parsed = models().LabEndpoint.model_validate({'endpoint_id': 'x', 'role': 'INPUT_SOURCE'})
    assert parsed.model_dump() == {'endpoint_id': 'x', 'role': 'INPUT_SOURCE'}
    with pytest.raises(ValidationError):
        models().LabEndpoint.model_validate({'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'channel': None})


def test_generated_mount_applies_canonical_boolean_and_conditional_constraints():
    model = models()
    with pytest.raises(ValidationError):
        model.PinContactBinding.model_validate({'kind': 'pin-contact', 'version': True, 'pinId': '1', 'contactId': 'a'})
    with pytest.raises(ValidationError):
        model.CircuitModule.model_validate({'id': 'U', 'type': 'x', 'position': {'x': 0}, 'mount': {
            'kind': 'breadboard', 'version': 1, 'boardId': 'B', 'partId': 'P', 'partRevision': 1,
            'packageId': 'DIP', 'packageRevision': 1, 'pose': {'position': {'x': 0, 'y': 0, 'z': 0}, 'rotation': 0},
            'contacts': [{'kind': 'pin-contact', 'version': 1, 'pinId': '1', 'contactId': 'a'}],
        }})


def test_generated_boundaries_include_lab_memory_and_private_plan():
    model = models()
    assert model.MemoryImage.model_validate({'version': '1.0', 'word_bits': 8, 'depth': 2, 'data': [0, 255]}).model_dump() == {
        'version': '1.0', 'word_bits': 8, 'depth': 2, 'data': [0, 255]}
    assert model.CaptureConfiguration.model_validate({'signals': [], 'duration_ns': 0}).model_dump() == {'signals': [], 'duration_ns': 0}
    assert model.InstrumentationExecutionPlan is not None


def test_generated_lab_defaults_to_manifest_transport_and_explicit_structural_is_lossless():
    value = {'signal': 'CLK.OUT', 'period_ns': 4294967296, 'cycles': 1}
    with pytest.raises(ValidationError):
        models().ClockConfiguration.model_validate(value)
    assert models().ClockConfiguration.model_validate(value, context={'profile': 'structural'}).model_dump() == value


def test_generated_capture_enforces_shared_count_semantics():
    value = {'schema_version': '1.0', 'capture_id': 'c', 'source': 'simulation',
             'instrument': 'logic_analyzer', 'encoding': 'digital_events', 'available': True,
             'duration_ns': 0, 'sample_count': 1, 'samples': []}
    with pytest.raises(ValidationError):
        models().CaptureResult.model_validate(value)


def test_generated_memory_enforces_shared_length_semantics():
    with pytest.raises(ValidationError):
        models().MemoryImage.model_validate({'version': '1.0', 'word_bits': 8, 'depth': 2, 'data': [0]})


def test_generated_json_integers_preserve_integral_float_representation():
    value = {'signal': 'out', 'time_ns': 1.0, 'value': 1.0}
    parsed = models().DigitalObservation.model_validate(value)
    assert type(parsed.time_ns) is float
    assert type(parsed.value) is float
    assert parsed.model_dump() == value


@pytest.mark.parametrize('version', [1, 1.0])
def test_generated_numeric_literals_preserve_json_number_representation(version):
    value = {'kind': 'pin-contact', 'version': version, 'pinId': '1', 'contactId': 'a'}
    parsed = models().PinContactBinding.model_validate(value)
    assert type(parsed.version) is type(version)
    assert parsed.model_dump() == value


def test_generated_integer_profiles_still_reject_fractions_and_boolean_literals():
    with pytest.raises(ValidationError):
        models().DigitalObservation.model_validate({'signal': 'out', 'time_ns': 1.5, 'value': 1})
    with pytest.raises(ValidationError):
        models().PinContactBinding.model_validate({'kind': 'pin-contact', 'version': True, 'pinId': '1', 'contactId': 'a'})


@pytest.mark.parametrize('contact', [False, True])
def test_api_mounted_version_retains_legacy_exact_integer_rule(contact):
    sys.path.insert(0, str(ROOT / 'services/api'))
    from app.models.circuit import CircuitGraph
    mount = {'kind': 'breadboard', 'version': 1, 'boardId': 'B', 'partId': 'P', 'partRevision': 1,
             'packageId': 'DIP', 'packageRevision': 1, 'pose': {'position': {'x': 0, 'y': 0, 'z': 0}, 'rotation': 0},
             'contacts': [{'kind': 'pin-contact', 'version': 1, 'pinId': '1', 'contactId': 'a'}]}
    if contact:
        mount['contacts'][0]['version'] = 1.0
    else:
        mount['version'] = 1.0
    with pytest.raises(ValidationError):
        CircuitGraph.model_validate({'schema_version': '1.1', 'circuit_id': 'mounted', 'modules': [
            {'id': 'M', 'type': 'part', 'mount': mount}], 'connections': []})


def test_python_generation_is_deterministic_and_compiles(tmp_path):
    outputs = [tmp_path / 'first.py', tmp_path / 'second.py']
    for output in outputs:
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/generate_python_contracts.py'), '--output', str(output)],
                                cwd=ROOT, capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
        compile(output.read_text(encoding='utf-8'), str(output), 'exec')
    assert outputs[0].read_bytes() == outputs[1].read_bytes()


def python_generator():
    spec = importlib.util.spec_from_file_location('python_contract_generator', ROOT / 'scripts/generate_python_contracts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def generator_source(monkeypatch, definition):
    from contracts import registry
    entry = {'id': 'Probe', 'kind': 'schema', 'path': 'contracts/probe.schema.json',
             'uri': 'https://netcircuit.local/probe.schema.json', 'pointer': '', 'validator_profile': 'structural'}
    source = {'$schema': registry.DIALECT, 'type': 'object', 'properties': {'Probe': {'$ref': '#/$defs/Probe'}},
              '$defs': {'Probe': definition}}
    monkeypatch.setattr(registry, 'check_manifest', lambda: None)
    monkeypatch.setattr(registry, 'entries', lambda: [entry])
    monkeypatch.setattr(registry, 'load_schema', lambda uri: deepcopy(definition))
    monkeypatch.setattr(registry, 'schema_bundle', lambda **kwargs: deepcopy(source))


def test_python_bundle_keeps_reserved_property_names_and_literal_annotations(monkeypatch):
    definition = {'type': 'object', 'properties': {
        '$id': {'type': 'string'}, '$schema': {'type': 'string'}, '$defs': {'type': 'object'},
        '$ref': {'type': 'string'}, 'nested': True},
        'default': {'$id': 'literal', '$schema': 'literal', '$defs': {'kept': True}, '$ref': 'ordinary data'},
        'examples': [{'$id': 'example', '$ref': 'ordinary example'}]}
    generator_source(monkeypatch, definition)
    source, profiles = python_generator().bundle()
    assert source['$defs']['Probe'] == {**definition, 'title': 'Probe'}
    assert profiles == {'Probe': 'structural'}


@pytest.mark.parametrize('definition', [True, False])
def test_python_named_boolean_dto_fails_with_actionable_codegen_error(monkeypatch, definition):
    generator_source(monkeypatch, definition)
    with pytest.raises(ValueError, match='Probe.*boolean|boolean.*Probe'):
        python_generator().bundle()
