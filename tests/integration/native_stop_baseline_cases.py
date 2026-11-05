"""Explicit loaded-Stop benchmark using installed API, Hardware and Simulator."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, closing
from contextvars import ContextVar
from hashlib import sha256
import json
from math import ceil
import os
from pathlib import Path
import re
import sqlite3
from time import get_clock_info, monotonic, perf_counter_ns, sleep
from uuid import uuid4

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics, Session
from scripts.environment import getenv


WORKERS = 4
STATION = 'virtual-station-01'


def _experiment_trace(root, experiment):
    if not re.fullmatch(r'[0-9a-f]{32}', experiment):
        raise ValueError('Expected a generated experiment ID.')
    path = root / experiment
    path.mkdir(exist_ok=True)
    return path


def _event(path, event, timestamp_ns, **fields):
    entry = path / f'{timestamp_ns}-{event}.json'
    entry.write_text(json.dumps({'event': event, 'at_ns': timestamp_ns, **fields}), encoding='utf-8')


def _timed_simulation(operation, path, enqueued_ns, args, kwargs):
    # The ready marker only triggers the client. Qualification uses both
    # timestamps around the real computation after this marker has been written.
    (path / 'ready').touch(exist_ok=False)
    began = perf_counter_ns()
    try:
        return operation(*args, **kwargs)
    finally:
        _event(path, 'worker-finished', perf_counter_ns(),
               enqueued_ns=enqueued_ns, began_ns=began, pid=os.getpid())


def install_stop_probes(role, directory):
    """Observe the installed implementation from inside an owned service child."""
    root = Path(directory) / 'stop-observations'
    root.mkdir(exist_ok=True)
    if role == 'hardware':
        from hardware_service.rpc import LifecycleRpc
        from hardware_service.station import virtual

        current = ContextVar('native_stop_experiment')
        original_pool = virtual.simulation_pool
        original_execute = LifecycleRpc._execute

        class ObservedPool:
            def submit(self, operation, *args, **kwargs):
                path = _experiment_trace(root, current.get())
                return original_pool().submit(_timed_simulation, operation, path,
                                              perf_counter_ns(), args, kwargs)

        def execute(self, request, action):
            target = request.target if hasattr(request, 'target') else request
            if action.__name__ == 'start_execution':
                token = current.set(target.experiment_id)
                try:
                    return original_execute(self, request, action)
                finally:
                    current.reset(token)
            if action.__name__ == 'stop_execution':
                entered = perf_counter_ns()
                reply = original_execute(self, request, action)
                _event(_experiment_trace(root, target.experiment_id), 'stop-rpc', perf_counter_ns(),
                       entered_ns=entered, safe=reply.accepted and reply.code == self.pb.OK
                       and reply.state == 'SAFE_STATE')
                return reply
            return original_execute(self, request, action)

        virtual.simulation_pool = ObservedPool
        LifecycleRpc._execute = execute
    elif role == 'api':
        from app.services.hardware_client import HardwareServiceClient
        from app.services.observability import current_correlation
        from app.services.persistence import Repository

        original_invoke = HardwareServiceClient._invoke

        def invoke(self, method, request):
            if method != 'StopExecution':
                return original_invoke(self, method, request)
            sent = perf_counter_ns()
            reply = None
            try:
                reply = original_invoke(self, method, request)
            finally:
                received = perf_counter_ns()
                safe = (reply is not None and reply.accepted and reply.code == self.pb.OK
                        and reply.state == 'SAFE_STATE')
                _event(_experiment_trace(root, request.experiment_id), 'stop-ack', received,
                       sent_ns=sent, kind=current_correlation().get('kind'), safe=safe)
            return reply

        def observe_commit(operation, name):
            def commit(self, experiment_id):
                result = operation(self, experiment_id)
                _event(_experiment_trace(root, experiment_id), name, perf_counter_ns())
                return result
            return commit

        HardwareServiceClient._invoke = invoke
        Repository.release = observe_commit(Repository.release, 'lease-released')
        Repository.quarantine = observe_commit(Repository.quarantine, 'lease-quarantined')
    else:
        raise ValueError('Unknown Stop benchmark service role.')


def _load():
    modules, connections = [], []
    for index in range(WORKERS):
        clock, switch, gate, led = (f'{prefix}{index}' for prefix in 'CXGL')
        modules.extend((
            {'id': clock, 'type': 'CLOCK', 'properties': {'frequency_hz': 1_000_000}},
            {'id': switch, 'type': 'DIGITAL_SWITCH', 'properties': {'state': True}},
            {'id': gate, 'type': '74HC08'},
            {'id': led, 'type': 'LED'},
        ))
        connections.extend((
            {'source': f'{clock}.OUT', 'destination': f'{gate}.A1'},
            {'source': f'{switch}.OUT', 'destination': f'{gate}.B1'},
            {'source': f'{gate}.Y1', 'destination': f'{led}.IN'},
        ))
    return {
        'station_id': STATION,
        'circuit_graph': {'schema_version': '1.0', 'circuit_id': 'native-stop-load',
                          'modules': modules, 'connections': connections},
        'capture_config': {'signals': ['G0.Y1'], 'duration_ns': 6_000_000, 'max_events': 1_000_000},
    }


def _until(predicate, timeout, description):
    deadline = monotonic() + timeout
    while True:
        result = predicate()
        if result:
            return result
        assert monotonic() < deadline, description
        sleep(.005)


def _create_and_run(client, payload):
    key = uuid4().hex
    record = client.request('create', 'POST', '/api/experiments', expected=(201,),
                            headers={'Idempotency-Key': key + ':create'}, json=payload).json()
    experiment = record['experiment_id']
    client.request('run', 'POST', f'/api/experiments/{experiment}/run',
                   headers={'Idempotency-Key': key + ':run'})
    return experiment


def _stop(client, experiment):
    started = perf_counter_ns()
    client.request('stop', 'POST', f'/api/experiments/{experiment}/stop',
                   headers={'Idempotency-Key': uuid4().hex})
    return started, perf_counter_ns()


def _finished(client, experiment):
    record = client.request('terminal_poll', 'GET', f'/api/experiments/{experiment}').json()
    if record['state'] in ('COMPLETE', 'FAULT') and record['lease_expires_at'] is None:
        return record


def _read_events(trace):
    return sorted((json.loads(path.read_text(encoding='utf-8')) for path in trace.glob('*.json')),
                  key=lambda entry: entry['at_ns'])


def _qualify(http, events, workers, terminal):
    started, replied = http
    ack = next((entry for entry in events if entry['event'] == 'stop-ack'
                and entry['kind'] == 'stop' and started <= entry['sent_ns'] <= entry['at_ns'] <= replied), None)
    if ack is None:
        return {'rejected': 'no client Stop acknowledgement in the request window'}
    ingress = [entry for entry in events if entry['event'] == 'stop-rpc'
               and ack['sent_ns'] <= entry['entered_ns'] <= entry['at_ns'] <= ack['at_ns']]
    assert len(ingress) == 1, 'Stop RPC must match the client call window.'
    ingress = ingress[0]
    active_pids = {worker['pid'] for worker in workers
                   if worker['began_ns'] <= ingress['entered_ns'] < worker['at_ns']}
    if len(active_pids) != WORKERS:
        return {'rejected': 'fewer than four worker processes computing at Stop RPC ingress',
                'busy_workers': len(active_pids)}
    assert ingress['safe'] and ack['safe'], 'Busy Stop had no safe gRPC acknowledgement.'
    assert terminal['state'] == 'COMPLETE' and terminal['error_code'] == 'STOPPED'
    history = terminal['state_history']
    assert history[-5:] == ['RUNNING', 'STOPPING', 'SAFE_STATE', 'RELEASE', 'COMPLETE']
    assert not (terminal.get('capture') or {}).get('available'), 'Stopped generation published capture.'
    durable = [entry for entry in events if entry['event'] in ('lease-released', 'lease-quarantined')]
    assert len(durable) == 1 and durable[0]['event'] == 'lease-released'
    worker = next(entry for entry in events if entry['event'] == 'worker-finished')
    cleanup = [entry for entry in events if entry['event'] == 'stop-ack' and entry['kind'] == 'run']
    assert len(cleanup) == 1 and cleanup[0]['safe']
    assert worker['at_ns'] <= cleanup[0]['at_ns'] <= durable[0]['at_ns'], 'Lease released before cleanup ACK.'
    return {
        'http_ns': replied - started, 'grpc_ack_ns': ack['at_ns'] - started,
        'cleanup_grpc_ack_ns': cleanup[0]['at_ns'] - started, 'safe_release_ns': durable[0]['at_ns'] - started,
        'worker_remaining_ns': worker['at_ns'] - started, 'busy_workers': len(active_pids),
    }


def _summarize(samples, field):
    values = sorted(sample[field] for sample in samples)
    return {f'p{q}_ms': values[ceil(q / 100 * len(values)) - 1] / 1_000_000
            for q in (50, 95, 99)} if values else {}


def test_loaded_stop_baseline():
    from tests.integration.native_external_baseline_cases import baseline_services, verified_reference

    minimum = int(getenv('CIRNET_NATIVE_STOP_SAMPLES', '100'))
    assert 1 <= minimum <= 1000
    reference_sha256 = verified_reference()
    directory = artifact_directory(f'native-stop-baseline-{uuid4().hex}')
    database = directory / 'stop.sqlite3'
    database_url = f'sqlite:///{database.as_posix()}'
    payload = _load()
    metrics = Metrics()
    samples, rejected = [], []
    with baseline_services(directory, database_url, probes='stop') as (url, _, service_pids):
        with ExitStack() as stack, ThreadPoolExecutor(max_workers=WORKERS) as threads:
            clients = [Session(url, metrics) for _ in range(WORKERS)]
            for client in clients:
                stack.callback(client.close)
            owners = set()
            for client in clients:
                session = client.request('session', 'GET', '/api/auth/session').json()
                client.client.headers['X-CSRF-Token'] = session['csrf_token']
                owners.add(session['principal']['principal_id'])
            assert len(owners) == WORKERS

            for wave in range(2 * ceil(minimum / WORKERS) + 3):
                starts = [threads.submit(_create_and_run, client, payload) for client in clients]
                experiments = [future.result() for future in starts]
                admitted = monotonic()
                paths = [directory / 'stop-observations' / experiment for experiment in experiments]
                _until(lambda: all((path / 'ready').is_file() for path in paths), 10,
                       'All installed workers must enter the real simulation.')
                stops = [threads.submit(_stop, client, experiment)
                         for client, experiment in zip(clients, experiments)]
                http = [future.result() for future in stops]
                terminals = [_until(lambda: _finished(client, experiment), 15, 'Run did not reach a durable terminal state.')
                             for client, experiment in zip(clients, experiments)]
                traces = [_read_events(path) for path in paths]
                workers = [entry for trace in traces for entry in trace if entry['event'] == 'worker-finished']
                assert len(workers) == WORKERS and all(worker['enqueued_ns'] <= worker['began_ns'] < worker['at_ns']
                                                      for worker in workers)
                assert not {worker['pid'] for worker in workers}.intersection(service_pids)
                assert all(terminal['state'] == 'COMPLETE' for terminal in terminals), terminals
                if wave:
                    for observation, trace, terminal in zip(http, traces, terminals):
                        result = _qualify(observation, trace, workers, terminal)
                        result.update(wave=wave, experiment_id=terminal['experiment_id'])
                        if 'rejected' in result:
                            rejected.append(result)
                        else:
                            samples.append(result)
                if len(samples) >= minimum:
                    break
                # The release admits at most one Run per owner per second.
                sleep(max(0, admitted + 1.01 - monotonic()))

    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as connection:
        assert connection.execute('SELECT COUNT(*) FROM lab_leases').fetchone() == (0,)

    report = {
        'release_set_sha256': reference_sha256,
        'workload_sha256': sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
        'harness_sha256': sha256(Path(__file__).read_bytes()).hexdigest(),
        'clock': vars(get_clock_info('perf_counter')), 'database': 'sqlite',
        'guest_sessions': WORKERS, 'worker_limit': WORKERS, 'warmup_waves': 1, 'valid_count': len(samples),
        'api_pid': service_pids[0], 'hardware_pid': service_pids[1], 'injected_load': False,
        'waves_measured': wave, 'rejected_count': len(rejected), 'rejections': rejected,
        'percentiles': {field: _summarize(samples, field)
                        for field in ('http_ns', 'grpc_ack_ns', 'cleanup_grpc_ack_ns',
                                      'safe_release_ns', 'worker_remaining_ns')},
        'samples': samples,
    }
    (directory / 'loaded-stop.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Loaded Stop evidence: {directory / "loaded-stop.json"}')
    assert len(samples) >= minimum, report
