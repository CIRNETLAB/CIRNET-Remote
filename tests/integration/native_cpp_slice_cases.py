"""Experimental 74HC08 integration using a packaged C++ adapter and selected wheels."""

from hashlib import sha256
from importlib.metadata import distribution
import json
import os
from pathlib import Path
import sys
from uuid import uuid4
from zipfile import ZipFile

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics, Session
from tests.integration import native_external_baseline_cases as harness


def _worker_selection():
    worker = Path(os.environ['CIRNET_CPP_STAGE1_WORKER'])
    digest = os.environ['CIRNET_CPP_STAGE1_WORKER_SHA256']
    assert worker.is_absolute() and sha256(worker.read_bytes()).hexdigest() == digest
    return worker, digest


def _registry():
    from cirnet_sim.backends import BackendRegistry, LegacyBackend, NgspiceBackend
    from cirnet_sim.cpp_backend import CppBackend

    return BackendRegistry((LegacyBackend(), NgspiceBackend(), CppBackend(*_worker_selection())))


def _run_in_spawned_worker(directory, args, kwargs):
    from cirnet_sim.backends import run_plan

    assert args[0].backend.id == 'cpp'
    result = run_plan(*args, registry=_registry(), **kwargs)
    (directory / 'native-run.json').write_text(json.dumps({
        'backend': args[0].backend.id, 'pid': os.getpid(), 'sample_count': len(result['samples']),
    }), encoding='utf-8')
    return result


def _configure_child(role, directory):
    from cirnet_sim import backends

    os.environ['CIRNET_SIMULATION_BACKEND'] = 'cpp'
    selected = _registry()
    backends.default_registry = lambda: selected
    if role == 'api':
        provider = selected.get('cpp')
        preview = provider.preview

        def checked_preview(graph):
            result = preview(graph)
            with (directory / 'native-preview.jsonl').open('a', encoding='utf-8') as log:
                log.write(json.dumps({'backend': provider.descriptor.identity.id, 'pid': os.getpid()}) + '\n')
            return result

        provider.preview = checked_preview
    else:
        from hardware_service.station import virtual

        pool = virtual.simulation_pool

        class CandidatePool:
            def submit(self, operation, *args, **kwargs):
                assert operation is backends.run_plan
                return pool().submit(_run_in_spawned_worker, directory, args, kwargs)

        virtual.simulation_pool = CandidatePool


def _verify_local_candidate():
    import cirnet_sim
    from scripts.contracts_artifact import installed_provenance as contracts_provenance
    from scripts.hardware_artifact import installed_provenance as hardware_provenance
    from scripts.install_release import API_INSTALL_PROBE
    import subprocess

    state = json.loads(Path(os.environ['CIRNET_NATIVE_RELEASE_STATE']).read_bytes())
    lock = json.loads((harness.ROOT / 'integration/release-set.json').read_bytes())
    wheel = Path(os.environ['CIRNET_CPP_STAGE1_SIMULATOR_WHEEL'])
    digest = os.environ['CIRNET_CPP_STAGE1_SIMULATOR_WHEEL_SHA256']
    assert wheel.is_absolute() and sha256(wheel.read_bytes()).hexdigest() == digest
    original_digest = lock['repositories']['Simulator']['artifacts']['python']['sha256']
    original = Path(state['artifacts']['Simulator']['python'])
    assert sha256(original.read_bytes()).hexdigest() == original_digest != digest
    simulator = distribution('cirnet-simulator')
    assert simulator.version == '0.1.2'
    assert Path(cirnet_sim.__file__).resolve() == Path(simulator.locate_file('cirnet_sim/__init__.py')).resolve()
    direct = json.loads(simulator.read_text('direct_url.json') or '{}')
    assert 'dir_info' not in direct
    assert direct['archive_info']['hashes']['sha256'] == digest
    namespaces = ('cirnet_sim', 'netcircuit_sim')
    with ZipFile(wheel) as archive, ZipFile(original) as reference:
        prefixes = tuple(name + '/' for name in namespaces)
        members = {item.filename for item in archive.infolist() if not item.is_dir() and item.filename.startswith(prefixes)}
        legacy_members = {item.filename for item in reference.infolist()
                          if not item.is_dir() and item.filename.startswith(prefixes)}
        assert members == legacy_members | {'cirnet_sim/cpp_backend.py'}
        installed = set()
        for name in namespaces:
            root = Path(simulator.locate_file(name))
            installed.update(f'{name}/{path.relative_to(root).as_posix()}' for path in root.rglob('*')
                             if path.is_file() and path.suffix != '.pyc')
        assert installed == members
        for member in members:
            assert Path(simulator.locate_file(member)).read_bytes() == archive.read(member)
        for member in legacy_members:
            assert archive.read(member) == reference.read(member)
    for name, provenance in [('Contracts', contracts_provenance), ('Hardware', hardware_provenance)]:
        assert provenance()['selected_sha256'] == lock['repositories'][name]['artifacts']['python']['sha256']
    subprocess.run([sys.executable, '-I', '-B', '-c', API_INSTALL_PROBE,
                    state['artifacts']['Remote']['python'],
                    lock['repositories']['Remote']['artifacts']['python']['sha256']], check=True)
    return digest


def _exercise(directory):
    graph, configuration, vectors, expected = harness._workloads()[0][1:]
    database_url = 'sqlite:///' + (directory / 'slice.sqlite').as_posix()
    metrics = Metrics()
    with harness.baseline_services(directory, database_url) as (url, _, pids):
        client = Session(url, metrics)
        try:
            session = client.request('auth', 'GET', '/api/auth/session').json()
            client.client.headers['X-CSRF-Token'] = session['csrf_token']
            previews = [client.request('preview', 'POST', prefix + '/circuits/physical-preview', json=graph).json()
                        for prefix in ('/api', '/api/v2')]
            assert harness.run_workload_job(client, graph, configuration, vectors, expected, 'and') == 124
        finally:
            client.close()
    return previews, pids


def test_packaged_cpp_and_through_remote_and_hardware(monkeypatch):
    simulator_digest = _verify_local_candidate()
    worker, worker_digest = _worker_selection()
    directory = artifact_directory(f'native-cpp-slice/{uuid4().hex}')
    legacy_directory = directory / 'legacy'
    legacy_directory.mkdir()
    legacy, _ = _exercise(legacy_directory)
    monkeypatch.setattr(harness, 'MODULE', 'tests.integration.native_cpp_slice_cases')
    native_directory = directory / 'cpp'
    native_directory.mkdir()
    native, pids = _exercise(native_directory)
    assert native == legacy
    preview_calls = [json.loads(line) for line in (native_directory / 'native-preview.jsonl').read_text().splitlines()]
    assert preview_calls == [{'backend': 'cpp', 'pid': pids[0]}] * 2
    run = json.loads((native_directory / 'native-run.json').read_bytes())
    assert run['backend'] == 'cpp' and run['pid'] not in pids and run['sample_count'] == 3
    (directory / 'candidate.json').write_text(json.dumps({
        'worker_sha256': worker_digest, 'worker_filename': worker.name,
        'simulator_overlay_wheel_sha256': simulator_digest,
        'preview_routes': ['/api/circuits/physical-preview', '/api/v2/circuits/physical-preview'],
        'capture_sha256': harness._workloads()[0][-1], 'capture_bytes': 124,
        'scheduler': 'test-only registry composition', 'workload': '74HC08 AND',
    }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    # Import by its stable package name so Windows spawn can resolve the job target.
    from tests.integration.native_cpp_slice_cases import _configure_child

    role, directory = sys.argv[1], harness._owned_directory(Path(sys.argv[2]))
    _configure_child(role, directory)
    harness._serve(role, directory)
