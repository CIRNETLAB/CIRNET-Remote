"""Worker configuration, cross-platform execution and owned pool cleanup."""
import importlib
import multiprocessing
import os
from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import time

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services/hardware-service'))
sys.path.insert(0, str(ROOT / 'simulator/circuit-simulator'))
from hardware_service.station import virtual
from netcircuit_sim.engine import VirtualCompiler, run_plan


def worker_probe():
    # A module-level function is importable by spawn; no inherited globals.
    time.sleep(1)
    return os.getpid(), multiprocessing.get_start_method()


@pytest.fixture(autouse=True)
def isolated_pool():
    virtual.close_simulation_pool()
    yield
    virtual.close_simulation_pool()


@pytest.mark.parametrize('value,expected', [(None, 4), ('1', 1), ('8', 8)])
def test_shared_worker_setting_defaults_and_reads_environment(monkeypatch, value, expected):
    monkeypatch.delenv('NETCIRCUIT_SIMULATION_WORKERS', raising=False)
    if value is not None:
        monkeypatch.setenv('NETCIRCUIT_SIMULATION_WORKERS', value)
    config = importlib.import_module('contracts.runtime_config')
    assert config.simulation_worker_count() == expected


@pytest.mark.parametrize('value', [0, -1, True, 1.5, '', '0', '-2', '1.5', 'many'])
def test_shared_worker_setting_rejects_invalid_explicit_values(value):
    config = importlib.import_module('contracts.runtime_config')
    with pytest.raises(ValueError, match='NETCIRCUIT_SIMULATION_WORKERS'):
        config.simulation_worker_count(value)


def test_configured_pool_spawns_two_workers_and_closes_them(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_WORKERS', '2')
    pool = virtual.simulation_pool()
    probes = [pool.submit(worker_probe) for _ in range(4)]
    results = [future.result(timeout=15) for future in probes]
    pids = {pid for pid, _ in results}
    try:
        assert len(pids) == 2
        assert {method for _, method in results} == {'spawn'}
    finally:
        virtual.close_simulation_pool()
    assert not pids.intersection(process.pid for process in multiprocessing.active_children())


def test_spawned_simulation_capture_remains_deterministic(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_WORKERS', '1')
    graph = {'schema_version': '1.0', 'circuit_id': 'input-led',
             'modules': [{'id': 'X', 'type': 'DIGITAL_SWITCH', 'properties': {'state': True}},
                         {'id': 'L', 'type': 'LED'}],
             'connections': [{'source': 'X.OUT', 'destination': 'L.IN'}]}
    plan = VirtualCompiler().compile(graph)
    captures = [virtual.simulation_pool().submit(run_plan, plan, {'signals': ['L.IN'], 'duration_ns': 20})
                for _ in range(2)]
    expected = {'available': True, 'state': 'COMPLETE', 'duration_ns': 20,
                'samples': [{'signal': 'L.IN', 'time_ns': 0, 'value': 1}]}
    assert [future.result(timeout=15) for future in captures] == [expected, expected]


def test_pool_creation_waits_for_previous_pool_shutdown(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_WORKERS', '1')
    pool = virtual.simulation_pool()
    shutdown_started, finish_shutdown, creation_started, created = (Event() for _ in range(4))
    original_shutdown = pool.shutdown

    def shutdown(*args, **kwargs):
        shutdown_started.set()
        assert finish_shutdown.wait(5)
        return original_shutdown(*args, **kwargs)

    def acquire():
        creation_started.set()
        replacement = virtual.simulation_pool()
        created.set()
        return replacement

    monkeypatch.setattr(pool, 'shutdown', shutdown)
    with ThreadPoolExecutor(max_workers=2) as requests:
        closing = requests.submit(virtual.close_simulation_pool)
        assert shutdown_started.wait(2)
        acquiring = requests.submit(acquire)
        try:
            assert creation_started.wait(2)
            assert not created.wait(0.2), 'A replacement pool appeared before old workers closed'
        finally:
            finish_shutdown.set()
            closing.result(timeout=5)
        assert acquiring.result(timeout=5) is not pool
