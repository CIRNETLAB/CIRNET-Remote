"""Configured backend selection survives API instances and spawned execution."""
from contextlib import contextmanager
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'services/api/tests'))
from csrf_client import CsrfTestClient, login_admin
from app.config import Settings
from app.main import create_app
from app.services.persistence import Repository
from hardware_service.station.virtual import VirtualHardwareStation, close_simulation_pool


def graph():
    return {'schema_version': '1.1', 'circuit_id': 'provider-consumer',
        'modules': [{'id': 'PS', 'type': 'DC_SUPPLY'}, {'id': 'U', 'type': 'SN74HC08N'}],
        'connections': [{'source': 'PS.PLUS', 'destination': 'U.14'},
            {'source': 'PS.MINUS', 'destination': 'U.7'},
            {'source': 'PS.PLUS', 'destination': 'U.1'},
            {'source': 'PS.PLUS', 'destination': 'U.2'}]}


def test_api_settings_snapshot_default_and_explicit_environment(monkeypatch):
    monkeypatch.delenv('NETCIRCUIT_SIMULATION_BACKEND', raising=False)
    default = Settings()
    assert getattr(default, 'simulation_backend', None) == 'legacy'
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'ngspice')
    unavailable = Settings()
    assert default.simulation_backend == 'legacy'
    assert unavailable.simulation_backend == 'ngspice'


@pytest.mark.parametrize('name', ['', 'unknown', 'netcircuit_sim.engine', 'Legacy'])
def test_unknown_configuration_fails_before_api_or_station_startup(monkeypatch, name):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', name)
    with pytest.raises(ValueError):
        Settings()
    with pytest.raises(ValueError):
        VirtualHardwareStation('invalid-backend')


@contextmanager
def client(configuration, **options):
    app = create_app(configuration=configuration, repository=Repository('sqlite://'))
    with CsrfTestClient(app, **options) as selected:
        yield selected


def future_domain_graph():
    return {'schema_version': '1.1', 'circuit_id': 'future-domain',
        'modules': [{'id': 'D', 'type': 'DIGITAL_SWITCH',
            'signal_domains': {'version': '99.0', 'ports': {}}}], 'connections': []}


@pytest.mark.parametrize('prefix', ['/api', '/api/v2'])
def test_unavailable_preview_keeps_future_domain_rejection_typed_and_document_storable(tmp_path, monkeypatch, prefix):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'ngspice')
    settings = Settings(environment='test', allow_guest=True, trusted_origins=('http://testserver',),
        capture_dir=str(tmp_path / 'future-captures'))
    value = future_domain_graph()
    with client(settings, raise_server_exceptions=False) as selected:
        assert selected.post(prefix + '/circuits/validate', json=value).status_code == 200
        rejected = selected.post(prefix + '/circuits/physical-preview', json=value)
        assert rejected.status_code == 422, rejected.text
        assert rejected.json().get('valid') is False, rejected.text
        assert rejected.json()['code'] == 'UNSUPPORTED_SIGNAL_DOMAIN_VERSION'
        login_admin(selected)
        project = selected.post('/api/projects', json={'name': 'Future domains'}).json()
        saved = selected.post(prefix + '/projects/' + project['project_id'] + '/circuits',
            json={'name': 'Versioned future document', 'graph': value})
        assert saved.status_code == 201, saved.text
        restored = selected.get(prefix + '/circuits/' + saved.json()['document_id'])
        assert restored.status_code == 200 and restored.json()['graph'] == value


def test_unavailable_station_maps_future_domain_error_to_unexecutable(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'ngspice')
    station = VirtualHardwareStation('future-domain')
    with pytest.raises(RuntimeError) as rejected:
        station.apply_circuit(future_domain_graph())
    assert rejected.value.code == 'UNEXECUTABLE'
    assert station._virtual_plan is None
    assert station.read_capture()['available'] is False


@pytest.mark.parametrize('configured,ambient,accepted', [('legacy', 'ngspice', True), ('ngspice', 'legacy', False)])
def test_rpc_experiment_sessions_inherit_the_base_station_backend(configured, ambient, accepted, monkeypatch):
    from contracts.generated import rpc_v2_pb2 as pb
    from hardware_service.rpc import LifecycleRpc
    station = VirtualHardwareStation('configured', backend_id=configured)
    rpc = LifecycleRpc({'configured': station}, pb)
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', ambient)
    for experiment in ('first', 'after-stop'):
        target = pb.Target(station_id='configured', experiment_id=experiment)
        reply = rpc.ConfigureVirtualCircuit(pb.ConfigureVirtualRequest(target=target,
            design_graph_json=json.dumps(graph()).encode('utf-8')), None)
        assert reply.accepted is accepted
        session = rpc.sessions[('configured', experiment)]
        assert session is not station
        assert session.get_capabilities().to_dict() == station.get_capabilities().to_dict()
        assert session._backend.identity == station._backend.identity
        if not accepted:
            assert reply.code == pb.UNEXECUTABLE
        assert rpc.StopExecution(target, None).accepted is True
        assert ('configured', experiment) not in rpc.sessions


@pytest.mark.parametrize('prefix', ['/api', '/api/v2'])
def test_preview_routes_use_independent_frozen_apps_and_keep_validation_available(tmp_path, monkeypatch, prefix):
    common = {'environment': 'test', 'allow_guest': True, 'trusted_origins': ('http://testserver',)}
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'legacy')
    legacy = Settings(**common, capture_dir=str(tmp_path / 'legacy-captures'))
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'ngspice')
    unavailable = Settings(**common, capture_dir=str(tmp_path / 'ngspice-captures'))
    # New requests do not use mutable process environment as their selection.
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'legacy')
    with client(legacy) as old, client(unavailable) as future:
        available = old.post(prefix + '/circuits/physical-preview', json=graph())
        assert available.status_code == 200, available.text
        assert available.json()['device_states']['U']['state'] == 'POWERED'
        assert available.json()['pin_values']['U.3'] == 1
        blocked = future.post(prefix + '/circuits/physical-preview', json=graph())
        assert blocked.status_code == 422, blocked.text
        assert blocked.json()['valid'] is False
        assert blocked.json()['code'] == 'BACKEND_UNAVAILABLE'
        assert future.post(prefix + '/circuits/validate', json=graph()).status_code == 200
        login_admin(future)
        project = future.post('/api/projects', json={'name': 'Unavailable backend authoring'}).json()
        saved = future.post(prefix + '/projects/' + project['project_id'] + '/circuits',
            json={'name': 'Still editable', 'graph': graph()})
        assert saved.status_code == 201, saved.text
        restored = future.get(prefix + '/circuits/' + saved.json()['document_id'])
        assert restored.status_code == 200 and restored.json()['graph'] == graph()
        monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'ngspice')
        repeated = old.post(prefix + '/circuits/physical-preview', json=graph())
        assert repeated.status_code == 200
        assert repeated.json() == available.json()


def test_station_capabilities_are_pinned_and_ngspice_has_no_available_instruments(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'legacy')
    legacy = VirtualHardwareStation('legacy')
    original = legacy.get_capabilities().to_dict()
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'ngspice')
    unavailable = VirtualHardwareStation('future')
    assert legacy.get_capabilities().to_dict() == original
    assert original['available'] is True and original['virtual_digital'] is True
    assert original['virtual_analog'] is False
    assert original['firmware_version'] == 'virtual-events-1.0'
    assert original['instrument_capabilities']['logic_analyzer']['channels'] == 4
    actual = unavailable.get_capabilities().to_dict()
    assert actual['available'] is False
    assert actual['virtual_digital'] is False and actual['virtual_analog'] is False
    assert actual['firmware_version'] == 'UNAVAILABLE'
    assert {entry['channels'] for entry in actual['instrument_capabilities'].values()} == {0}
    with pytest.raises(RuntimeError) as failure:
        unavailable.apply_circuit(graph())
    assert failure.value.code == 'UNEXECUTABLE'
    assert unavailable.read_capture()['available'] is False


def run_station(station):
    capture = {'signals': ['L.IN'], 'duration_ns': 20}
    plan = {'schema_version': '1.0', 'station_id': station.station_id, 'experiment_id': 'pinned',
        'power_policy': {'profile_id': 'virtual-1.0', 'guarded': True},
        'endpoint_bindings': [], 'routing_allocations': [], 'instrument_allocations': [],
        'clock_config': {}, 'generator_config': [], 'capture_config': capture, 'test_vectors': [],
        'runtime_safety_policy': {'profile_id': 'virtual-1.0', 'watchdog_required': True}}
    station.prepare_execution(plan, {'schema_version': '1.0', 'decision': 'RUN_NORMAL', 'reasons': []})
    station.arm_capture(capture)
    assert station.start_execution()['accepted'] is True
    observed = station.read_capture()
    station.stop_execution()
    return observed


def test_real_spawn_and_reused_worker_execute_the_compiled_identity_after_environment_changes(monkeypatch):
    close_simulation_pool()
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_WORKERS', '1')
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'legacy')
    station = VirtualHardwareStation('pinned')
    circuit = {'schema_version': '1.0', 'circuit_id': 'pinned',
        'modules': [{'id': 'X', 'type': 'DIGITAL_SWITCH', 'properties': {'state': True}}, {'id': 'L', 'type': 'LED'}],
        'connections': [{'source': 'X.OUT', 'destination': 'L.IN'}]}
    try:
        station.apply_circuit(circuit)
        assert getattr(station._virtual_plan, 'backend', None) is not None, 'station compiled a legacy-only plan'
        assert station._virtual_plan.backend.id == 'legacy'
        # The first worker starts with ngspice in its environment.
        monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'ngspice')
        first = run_station(station)
        # Parent configuration now becomes invalid; the existing station and
        # the reused worker must still execute the explicitly compiled identity.
        monkeypatch.setenv('NETCIRCUIT_SIMULATION_BACKEND', 'unknown-after-start')
        station.apply_circuit(circuit)
        second = run_station(station)
        expected = {'available': True, 'state': 'COMPLETE', 'duration_ns': 20,
            'samples': [{'signal': 'L.IN', 'time_ns': 0, 'value': 1}]}
        assert first == second == expected
        assert station.state == 'SAFE_STATE'
    finally:
        close_simulation_pool()
