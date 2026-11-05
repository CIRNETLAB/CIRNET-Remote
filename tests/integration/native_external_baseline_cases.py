"""Opt-in Stage 0 launcher and external load profiles for the pinned Python wheels."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from hashlib import sha256
from importlib.metadata import distribution, distributions
import json
import os
from pathlib import Path
import platform
import re
import secrets
import socket
import sqlite3
import subprocess
import sys
from threading import Event, Thread
from time import monotonic, perf_counter_ns, sleep
from uuid import uuid4

import httpx
import psutil
import pytest
from sqlalchemy.engine import make_url

from scripts.artifact_paths import artifact_directory, validate_artifact_directory
from scripts.benchmark_web_sessions import Metrics, ORIGIN, Session, graph as and_graph, stop_owned_backend
from scripts.e2e_web_server import wait_for_pipe_eof
from scripts.environment import getenv
from scripts.install_release import API_INSTALL_PROBE


ROOT = Path(__file__).resolve().parents[2]
MODULE = 'tests.integration.native_external_baseline_cases'


def _owned_directory(directory):
    owned = validate_artifact_directory(directory)
    session = artifact_directory()
    if owned == session or not owned.is_relative_to(session):
        raise ValueError('Select a child of the owned baseline session.')
    return owned


def _require_isolated_database(database_url, directory):
    selected = make_url(database_url)
    backend = selected.get_backend_name()
    if backend == 'sqlite':
        database = Path(selected.database or '').resolve()
        if not database.is_relative_to(directory) or database == directory:
            raise ValueError('SQLite baseline state must be inside the owned run.')
    elif backend == 'postgresql':
        options = selected.query.get('options', '')
        allowed = make_url(os.environ['CIRNET_TEST_POSTGRES_URL'])
        if (selected.host != '127.0.0.1' or allowed.query or selected.set(query={}) != allowed
                or not isinstance(options, str)
                or not re.fullmatch(r'-csearch_path=cirnet_test_w34_[a-f0-9]{32} -clock_timeout=5000 -cstatement_timeout=20000', options)):
            raise ValueError('PostgreSQL baseline requires a dedicated loopback test schema.')
    else:
        raise ValueError('Baseline requires SQLite or a dedicated PostgreSQL schema.')


def _service_identity(process, port_file):
    deadline = monotonic() + 60
    while monotonic() < deadline and process.poll() is None:
        if port_file.exists():
            # A complete record is published by rename.
            port, pid = port_file.read_text(encoding='ascii').split()
            return int(port), int(pid)
        sleep(.05)
    raise RuntimeError(f'{port_file.stem} did not start. Inspect its owned log.')


@contextmanager
def _service(role, directory, environment):
    with (directory / f'{role}.log').open('wb') as log:
        process = subprocess.Popen(
            [sys.executable, '-B', '-m', MODULE, role, str(directory)],
            cwd=ROOT, env=environment, stdin=subprocess.PIPE, stdout=log,
            stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
        )
        try:
            yield process, _service_identity(process, directory / f'{role}.port')
        finally:
            stop_owned_backend(process, psutil)


@contextmanager
def baseline_services(directory, database_url, *, probes=False):
    """Start distinct API and gRPC child processes from the selected venv."""
    directory = _owned_directory(directory)
    _require_isolated_database(database_url, directory)
    if probes not in (False, True, 'stop'):
        raise ValueError('Unknown baseline probe set.')
    password = secrets.token_urlsafe(32)
    environment = dict(os.environ)
    environment.pop('PYTHONPATH', None)
    environment.update(
        CIRNET_ENV='development', CIRNET_HARDWARE_MODE='simulation', CIRNET_ALLOW_GUEST='true',
        CIRNET_DATABASE_URL=database_url, CIRNET_CAPTURE_DIR=str(directory / 'captures'),
        CIRNET_TRUSTED_ORIGINS=ORIGIN, CIRNET_SIMULATION_WORKERS='4', CIRNET_SIMULATION_BACKEND='legacy',
        CIRNET_BASELINE_ADMIN_PASSWORD=password, CIRNET_BASELINE_PROBES='phases' if probes is True else (probes or ''),
        PYTHONDONTWRITEBYTECODE='1', PYTHONUNBUFFERED='1',
    )
    with _service('hardware', directory, environment) as (_, (rpc_port, hardware_pid)):
        environment['CIRNET_HARDWARE_GRPC_TARGET'] = f'127.0.0.1:{rpc_port}'
        with _service('api', directory, environment) as (api, (http_port, api_pid)):
            url = f'http://127.0.0.1:{http_port}'
            deadline = monotonic() + 60
            with httpx.Client(timeout=1, trust_env=False) as probe:
                while monotonic() < deadline and api.poll() is None:
                    try:
                        if probe.get(url + '/api/health').status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    sleep(.05)
                else:
                    raise RuntimeError('Baseline API readiness failed. Inspect its owned log.')
            yield url, password, (api_pid, hardware_pid)


def _publish_port(directory, role, port):
    pending = directory / f'{role}.pending'
    pending.write_text(f'{port} {os.getpid()}', encoding='ascii')
    pending.replace(directory / f'{role}.port')


def _listen_for_eof(callback):
    def parent_exit():
        wait_for_pipe_eof(sys.stdin.fileno())
        callback()

    Thread(target=parent_exit, daemon=True).start()


def _serve(role, directory):
    directory = _owned_directory(directory)
    _require_isolated_database(os.environ['CIRNET_DATABASE_URL'], directory)
    if Path(os.environ['CIRNET_CAPTURE_DIR']).resolve() != directory / 'captures':
        raise ValueError('Capture state must be inside the owned run.')
    probes = os.environ['CIRNET_BASELINE_PROBES']
    if probes == 'phases':
        from tests.integration.native_phase_baseline_cases import install_api_probes, install_hardware_probes
        (install_api_probes if role == 'api' else install_hardware_probes)(directory)
    elif probes == 'stop':
        from tests.integration.native_stop_baseline_cases import install_stop_probes
        install_stop_probes(role, directory)

    if role == 'hardware':
        from hardware_service.server import build_server
        from hardware_service.station.virtual import close_simulation_pool

        server = build_server()
        port = server.add_insecure_port('127.0.0.1:0')
        assert port
        done = Event()
        server.start()
        try:
            _listen_for_eof(done.set)
            _publish_port(directory, role, port)
            done.wait()
        finally:
            server.stop(0).wait()
            close_simulation_pool()
        return

    assert role == 'api'
    import uvicorn
    from app.config import Settings
    from app.main import create_app
    from app.services.auth import AuthService
    from app.services.persistence import Repository

    settings = Settings()
    repo = Repository(settings.database_url)
    try:
        AuthService(repo, settings).bootstrap_admin(
            'e2e_admin', os.environ['CIRNET_BASELINE_ADMIN_PASSWORD'], 'Baseline Administrator',
        )
    finally:
        repo.close()
    server = uvicorn.Server(uvicorn.Config(create_app(configuration=settings, lazy=True), log_level='warning'))
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        _listen_for_eof(lambda: setattr(server, 'should_exit', True))
        _publish_port(directory, role, listener.getsockname()[1])
        server.run(sockets=[listener])


@contextmanager
def benchmark_clients(database_url, url, password, metrics, count):
    """Provision synthetic Student sessions using released AuthService before timing."""
    from app.compatibility import SESSION_COOKIE
    from app.config import Settings
    from app.services.auth import AuthService
    from app.services.persistence import Repository

    settings = Settings(database_url=database_url, allow_guest=True)
    repo = Repository(database_url)
    clients = []
    try:
        auth = AuthService(repo, settings)
        anonymous, _ = auth.ensure_session(None)
        admin, _ = auth.login(anonymous, 'e2e_admin', password, 'native-baseline-admin')
        for index in range(count):
            username = f'baseline_{index}'
            secret = secrets.token_urlsafe(24)
            auth.create_user(username, secret, actor=admin)
            anonymous, _ = auth.ensure_session(None)
            student, token = auth.login(anonymous, username, secret, f'native-baseline-student-{index}')
            client = Session(url, metrics)
            client.client.cookies.set(SESSION_COOKIE, token)
            client.client.headers['X-CSRF-Token'] = student.csrf_token
            clients.append(client)
        yield clients
    finally:
        for client in clients:
            client.close()
        repo.close()


def run_workload_job(client, graph, configuration, vectors, expected_sha256, label):
    key = secrets.token_hex(16)
    created = client.request(f'{label}_create', 'POST', '/api/experiments', expected=(201,),
        headers={'Idempotency-Key': key + ':create'}, json={
            'station_id': 'virtual-station-01', 'circuit_graph': graph,
            'capture_config': configuration, 'test_vectors': vectors,
        }).json()
    path = '/api/experiments/' + created['experiment_id']
    client.request(f'{label}_run', 'POST', path + '/run', headers={'Idempotency-Key': key + ':run'})
    deadline = monotonic() + 30
    while monotonic() < deadline:
        result = client.request(f'{label}_poll', 'GET', path).json()
        assert result['state'] != 'FAULT', result.get('error_code')
        if result['state'] == 'COMPLETE' and result['lease_expires_at'] is None:
            break
        sleep(.05)
    else:
        pytest.fail('Timed out waiting for COMPLETE and lease release.')
    capture = result['capture']
    payload = client.request(f'{label}_capture', 'GET', capture['payload_ref'])
    assert payload.headers['content-type'].startswith('application/vnd.cirnet.capture; version=1')
    assert len(payload.content) == capture['payload_byte_count']
    assert sha256(payload.content).hexdigest() == capture['sha256'] == expected_sha256
    return len(payload.content)


def verified_reference():
    """Verify original release bytes and the installed wheels before measuring."""
    import app
    from scripts.contracts_artifact import installed_provenance as contracts_provenance
    from scripts.hardware_artifact import installed_provenance as hardware_provenance
    from scripts.simulator_artifact import installed_provenance as simulator_provenance

    state_path = getenv('CIRNET_NATIVE_RELEASE_STATE')
    assert state_path, 'Select the install_release state with CIRNET_NATIVE_RELEASE_STATE.'
    selected_state = Path(state_path).resolve()
    assert selected_state.is_relative_to(artifact_directory())
    state = json.loads(selected_state.read_text(encoding='utf-8'))
    assert Path(state['python']).resolve() == Path(sys.executable).resolve()
    assert Path(app.__file__).resolve() == Path(distribution('cirnet-api').locate_file('app/__init__.py')).resolve()
    lock = ROOT / 'integration/release-set.json'
    lock_bytes = lock.read_bytes()
    manifest = json.loads(lock_bytes)
    assert state['releaseVersion'] == manifest['releaseVersion']
    for repo, entry in manifest['repositories'].items():
        for kind, selected in entry['artifacts'].items():
            payload = Path(state['artifacts'][repo][kind]).read_bytes()
            assert len(payload) == selected['size'] and sha256(payload).hexdigest() == selected['sha256'], (repo, kind)
    api = manifest['repositories']['Remote']['artifacts']['python']
    subprocess.run([sys.executable, '-I', '-B', '-c', API_INSTALL_PROBE,
                    state['artifacts']['Remote']['python'], api['sha256']], check=True)
    for repo, probe in [('Contracts', contracts_provenance), ('Hardware', hardware_provenance),
                        ('Simulator', simulator_provenance)]:
        assert probe()['selected_sha256'] == manifest['repositories'][repo]['artifacts']['python']['sha256']
    return sha256(lock_bytes).hexdigest()


@contextmanager
def baseline_database(kind, directory):
    if kind == 'sqlite':
        yield 'sqlite:///' + (directory / 'baseline.sqlite').as_posix()
        return
    from services.api.tests.postgres_cases import IsolatedPostgres

    selected = make_url(os.environ['CIRNET_TEST_POSTGRES_URL'])
    if selected.host != '127.0.0.1' or selected.drivername != 'postgresql+psycopg' or selected.query:
        raise ValueError('Use a dedicated PostgreSQL test cluster on loopback.')
    pg = IsolatedPostgres(selected)
    try:
        _, database_url = pg.new_schema()
        yield database_url
    finally:
        pg.clean()


def _resource_sample(pids):
    sample = {}
    for role, pid in zip(('api', 'hardware'), pids, strict=True):
        root = psutil.Process(pid)
        for process in [root, *root.children(recursive=True)]:
            cpu = process.cpu_times()
            sample[process.pid] = (role, cpu.user + cpu.system, process.memory_info().rss)
    return sample


@contextmanager
def _monitor(pids, result):
    initial = _resource_sample(pids)
    peak_rss = sum(rss for _, _, rss in initial.values())
    final = initial.copy()
    samples = 1
    errors = []
    stop = Event()

    def sample():
        nonlocal peak_rss, samples
        current = _resource_sample(pids)
        if initial.keys() != current.keys():
            errors.append('ProcessInventoryChanged')
        final.update(current)
        peak_rss = max(peak_rss, sum(rss for _, _, rss in current.values()))
        samples += 1

    def periodic():
        try:
            while not stop.wait(.1):
                sample()
        except psutil.Error as error:
            errors.append(type(error).__name__)

    thread = Thread(target=periodic, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join()
        sample()
        assert not errors, errors
        result.update(peak_rss_bytes=peak_rss, samples=samples, process_count=len(final),
                      cpu_seconds={role: sum(cpu - initial[pid][1] for pid, (owner, cpu, _) in final.items() if owner == role)
                                   for role in ('api', 'hardware')})


def _workloads():
    return (
        ('and', and_graph(0), {'signals': ['G.Y1'], 'duration_ns': 40, 'max_events': 100},
         [{'time_ns': 20, 'inputs': {'X.OUT': 1}}], 'a7d9fbe031939f9cdbf60f0f626b325beac173d9e720eb968fc62d9b83314010'),
        ('clock', {'schema_version': '1.0', 'circuit_id': 'baseline-clock',
                   'modules': [{'id': 'C', 'type': 'CLOCK', 'properties': {'frequency_hz': 100_000_000}}],
                   'connections': []}, {'signals': ['C.OUT'], 'duration_ns': 20_000, 'max_events': 100_000},
         [], '05081001462e9933227d167a96b5a6783b19379eea807b441dd75d992e06a3a0'),
    )


def _run_fixed_profile(clients, repetitions, metrics, pids):
    workloads = _workloads()
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda client: run_workload_job(client, *workloads[1][1:], 'warmup'), clients[-4:]))
    metrics.values.clear()

    def jobs(lane):
        byte_count = 0
        last_used = {}
        for index, case in enumerate(workloads * repetitions):
            client = lane[index % len(lane)]
            if client in last_used:
                # The released scheduler admits at most one Run per owner per second.
                sleep(max(0, last_used[client] + 1.05 - monotonic()))
            byte_count += run_workload_job(client, *case[1:], case[0])
            last_used[client] = monotonic()
        return byte_count

    def reads(client):
        for _ in range(10):
            for route in ('projects?limit=10', 'experiments/history?limit=10', 'experiments/active', 'stations'):
                client.request('read_' + route, 'GET', '/api/' + route)

    resources = {}
    with _monitor(pids, resources):
        started = perf_counter_ns()
        with ThreadPoolExecutor(max_workers=10) as pool:
            job_tasks = [pool.submit(jobs, clients[lane:40:4]) for lane in range(4)]
            list(pool.map(reads, clients[40:]))
            byte_count = sum(task.result() for task in job_tasks)
        seconds = (perf_counter_ns() - started) / 1_000_000_000
    latency = metrics.report()
    requests = sum(value['count'] for value in latency.values())
    fixed_requests = sum(value['count'] for operation, value in latency.items() if not operation.endswith('_poll'))
    jobs_count = 4 * repetitions * len(workloads)
    assert not metrics.transport_report()['count']
    return {'measurement_started_ns': started, 'seconds': seconds, 'requests': requests,
            'fixed_requests': fixed_requests, 'jobs': jobs_count,
            'capture_bytes': byte_count,
            'requests_per_second': requests / seconds, 'jobs_per_second': jobs_count / seconds,
            'fixed_requests_per_second': fixed_requests / seconds,
            'capture_bytes_per_second': byte_count / seconds,
            'cpu_seconds_per_job': sum(resources['cpu_seconds'].values()) / jobs_count,
            'resources': resources, 'latency': latency, 'observations': dict(metrics.values)}


@pytest.mark.parametrize('kind', ['sqlite', 'postgresql'])
def test_external_reference_profile(kind):
    manifest_sha256 = verified_reference()
    batches = int(os.environ.get('CIRNET_NATIVE_PROFILE_BATCHES', '3'))
    repetitions = int(os.environ.get('CIRNET_NATIVE_PROFILE_CYCLES', '25'))
    assert 1 <= batches <= 3 and 1 <= repetitions <= 25
    inventory = dict(sorted((item.name, item.version) for item in distributions()))
    configuration = {'principals': 50, 'job_principals': 40, 'http_threads': 10, 'worker_slots': 4,
                     'read_rounds_per_reader': 10, 'warmup_clock_jobs': 4, 'cycles_per_job_lane': repetitions}
    workload_sha256 = sha256(json.dumps([_workloads(), configuration], sort_keys=True).encode()).hexdigest()
    for batch in range(batches):
        directory = artifact_directory(f'native-external/{kind}-{uuid4().hex}')
        metrics = Metrics()
        with baseline_database(kind, directory) as database_url:
            with baseline_services(directory, database_url) as (url, password, pids):
                with benchmark_clients(database_url, url, password, metrics, 50) as clients:
                    report = _run_fixed_profile(clients, repetitions, metrics, pids)
        report.update(backend=kind, batch=batch + 1, manifest_sha256=manifest_sha256, inventory=inventory,
                      harness_sha256=sha256(Path(__file__).read_bytes()).hexdigest(),
                      workload_sha256=workload_sha256, configuration=configuration,
                      host={'platform': platform.platform(), 'python': platform.python_version(),
                            'sqlite': sqlite3.sqlite_version, 'logical_cpus': os.cpu_count(),
                            'ram_bytes': psutil.virtual_memory().total})
        (directory / 'profile.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


def test_reference_grpc_alias_and_presence():
    import grpc
    from contracts.generated import rpc_v2_pb2 as pb

    lock_sha256 = verified_reference()
    directory = artifact_directory(f'native-wire/{uuid4().hex}')
    database_url = 'sqlite:///' + (directory / 'wire.sqlite').as_posix()
    payloads = []
    with baseline_services(directory, database_url):
        port, _ = (directory / 'hardware.port').read_text(encoding='ascii').split()
        with grpc.insecure_channel(f'127.0.0.1:{port}') as channel:
            for namespace in ('cirnet.hardware.v2', 'netcircuit.hardware.v2'):
                call = channel.unary_unary(
                    f'/{namespace}.HardwareService/GetCapabilities',
                    request_serializer=pb.Target.SerializeToString,
                    response_deserializer=pb.StationCapabilities.FromString,
                )
                reply = call(pb.Target(station_id='virtual-station-01'), timeout=3)
                assert reply.available and reply.virtual_digital and not reply.virtual_analog
                payloads.append(reply.SerializeToString(deterministic=True))
                with pytest.raises(grpc.RpcError) as missing:
                    call(pb.Target(station_id='not-a-station'), timeout=3)
                assert missing.value.code() is grpc.StatusCode.NOT_FOUND
                assert missing.value.details() == 'HARDWARE_UNAVAILABLE'
    assert payloads[0] == payloads[1]
    absent = pb.GeneratorCapability()
    explicit = pb.GeneratorCapability(offset_min_v=0)
    assert not absent.HasField('offset_min_v') and explicit.HasField('offset_min_v')
    assert absent.SerializeToString() != explicit.SerializeToString()
    (directory / 'virtual-capabilities.pb').write_bytes(payloads[0])
    (directory / 'rpc-v2.desc').write_bytes(pb.DESCRIPTOR.serialized_pb)
    (directory / 'rpc-reference.json').write_text(json.dumps({
        'manifest_sha256': lock_sha256,
        'absent': absent.SerializeToString().hex(),
        'explicit_zero': explicit.SerializeToString().hex(),
        'invalid_station': {'grpc_status': 'NOT_FOUND', 'detail': 'HARDWARE_UNAVAILABLE'},
    }, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    _serve(sys.argv[1], Path(sys.argv[2]))
