"""Explicit loaded-Stop benchmark using installed API, Hardware and Simulator."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, closing
from contextvars import ContextVar
from hashlib import file_digest, sha256
import json
from math import ceil
import os
from pathlib import Path
import re
import sqlite3
from threading import Lock
from time import get_clock_info, monotonic, perf_counter_ns, sleep
from uuid import uuid4
from zipfile import ZipFile

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics, Session
from scripts.environment import getenv


WORKERS = 4
STATION = 'virtual-station-01'
SATURATED_PROFILE = 'saturated-v1'
SATURATED_DURATION_NS = 3_500_000
SATURATED_RELEASE_LEAD_NS = 25_000_000
SATURATED_STOP_OFFSET_NS = 20_000_000
SATURATED_WORKLOAD_SHA256 = 'e48b3d87456a93e3b97f8872fa39ea45099bbf34a49d0e32b888d9b4458a0c2c'
STAGE0_ARCHIVE_SHA256 = '73185795872bc1ec7e40e30ecc9732a27ba3cbb5dcf657053db5264302117fbb'
STOP_THRESHOLDS_SHA256 = 'fd7412c675c0372521519626b77a0e74e83d8967037a597e283086378ba0685a'
STOP_GATE_FIELDS = ('http_ns', 'grpc_ack_ns', 'safe_release_ns')
STOP_GATE_PERCENTILES = ('p95_ms', 'p99_ms')


def _experiment_trace(root, experiment):
    if not re.fullmatch(r'[0-9a-f]{32}', experiment):
        raise ValueError('Expected a generated experiment ID.')
    path = root / experiment
    path.mkdir(exist_ok=True)
    return path


def _event(path, event, timestamp_ns, **fields):
    entry = path / f'{timestamp_ns}-{event}.json'
    entry.write_text(json.dumps({'event': event, 'at_ns': timestamp_ns, **fields}), encoding='utf-8')


def _sleep_until_ns(deadline):
    while (remaining := deadline - perf_counter_ns()) > 0:
        sleep(remaining / 1_000_000_000)


def _ready_for_processing(path):
    if getenv('CIRNET_NATIVE_STOP_PROFILE', 'frozen') != SATURATED_PROFILE:
        (path / 'ready').touch(exist_ok=False)
        return
    step = 'read-wave-ticket'
    try:
        ticket = (path / 'wave').read_text(encoding='ascii')
        if not re.fullmatch(r'[0-9a-f]{32}', ticket):
            raise ValueError('Expected a generated wave ID.')
        release = path.parent / f'{ticket}.release'
        step = 'publish-ready'
        (path / 'ready').touch(exist_ok=False)
        step = 'wait-release-flag'
        _until(release.is_file, 5, 'Saturated wave was not released.')
        step = 'read-release-deadline'
        deadline = int(release.with_suffix('.deadline').read_text(encoding='ascii'))
        step = 'wait-release-deadline'
        _sleep_until_ns(deadline)
    except (AssertionError, OSError, ValueError) as error:
        try:
            _event(path, 'worker-rendezvous-error', perf_counter_ns(), pid=os.getpid(),
                   step=step, error_type=type(error).__name__,
                   errno=getattr(error, 'errno', None), winerror=getattr(error, 'winerror', None))
        except OSError:
            pass  # Preserve the original failure if the diagnostic write also fails.
        raise


def _publish_release(root, ticket, release_ns):
    # Close the deadline file before exposing the flag. On Windows a renamed
    # file can be visible to is_file() while the rename still denies open().
    with (root / f'{ticket}.deadline').open('x', encoding='ascii') as deadline:
        deadline.write(str(release_ns))
    (root / f'{ticket}.release').touch(exist_ok=False)


def _timed_simulation(operation, path, enqueued_ns, args, kwargs):
    # The ready marker only triggers the client. Qualification uses both
    # timestamps around the real computation after this marker has been written.
    _ready_for_processing(path)
    began = perf_counter_ns()
    try:
        return operation(*args, **kwargs)
    finally:
        _event(path, 'worker-finished', perf_counter_ns(),
               enqueued_ns=enqueued_ns, began_ns=began, pid=os.getpid())


def _install_cpp_stop_probes(root, current, virtual):
    from cirnet_sim import cpp_backend

    running = ContextVar('native_stop_worker', default=None)
    pending_plans, pending_pipes = {}, {}
    lock = Lock()
    original_submit = virtual._submit_execution
    original_run = virtual.run_plan
    original_exchange = cpp_backend._Connection.exchange
    original_read = cpp_backend._read_reply

    def submit(native, plan, *args):
        assert native, 'The C++ Stop probe requires the native Hardware path.'
        key = id(plan)
        path = _experiment_trace(root, current.get())
        with lock:
            pending_plans[key] = {'path': path, 'enqueued_ns': perf_counter_ns()}

        def discard(_):
            with lock:
                pending_plans.pop(key, None)

        try:
            future, cancel = original_submit(native, plan, *args)
        except BaseException:
            discard(None)
            raise
        future.add_done_callback(discard)
        return future, cancel

    def run(plan, *args, **kwargs):
        with lock:
            job = pending_plans.pop(id(plan))
        token = running.set(job)
        began = perf_counter_ns()
        cancelled = False
        try:
            return original_run(plan, *args, **kwargs)
        except virtual.SimulationError as error:
            cancelled = str(error) == 'CANCELLED'
            raise
        finally:
            finished = perf_counter_ns()
            child = job.get('child')
            _event(job['path'], 'worker-finished', finished,
                   enqueued_ns=job['enqueued_ns'], began_ns=began,
                   pid=child.pid if child is not None else None,
                   native_began_ns=job.get('native_began_ns'), native_finished_ns=job.get('native_finished_ns'),
                   cancelled=cancelled, child_reaped=child is not None and child.returncode is not None)
            running.reset(token)

    def exchange(self, request, deadline, cancel):
        job = running.get()
        key = id(self.child.stdout)
        job['child'] = self.child
        with lock:
            pending_pipes[key] = job
        try:
            # Do not make pipe IO wait for a diagnostic write after dispatch.
            _ready_for_processing(job['path'])
            return original_exchange(self, request, deadline, cancel)
        finally:
            with lock:
                pending_pipes.pop(key, None)

    def read(pipe):
        with lock:
            job = pending_pipes.get(id(pipe))
        if job is None:
            return original_read(pipe)
        # The installed IO loop has flushed the request before invoking this reader.
        job['native_began_ns'] = perf_counter_ns()
        try:
            return original_read(pipe)
        finally:
            job['native_finished_ns'] = perf_counter_ns()

    virtual._submit_execution = submit
    virtual.run_plan = run
    cpp_backend._Connection.exchange = exchange
    cpp_backend._read_reply = read


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

        if getenv('CIRNET_SIMULATION_BACKEND', 'legacy') == 'cpp':
            _install_cpp_stop_probes(root, current, virtual)
        else:
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


def _saturated_load():
    modules = [
        {'id': 'C', 'type': 'CLOCK', 'properties': {'frequency_hz': 1_000_000}},
        {'id': 'S', 'type': 'DIGITAL_SWITCH', 'properties': {'state': True}},
    ]
    connections = []
    for index in range(31):
        gate, led = f'G{index}', f'L{index}'
        modules.extend(({'id': gate, 'type': '74HC08'}, {'id': led, 'type': 'LED'}))
        connections.extend((
            {'source': 'C.OUT', 'destination': f'{gate}.A1'},
            {'source': 'S.OUT', 'destination': f'{gate}.B1'},
            {'source': f'{gate}.Y1', 'destination': f'{led}.IN'},
        ))
    # These clock sources interleave queue timestamps without enlarging the
    # retained capture. The fanout and clocks together remain below 1M events.
    for index, rate in enumerate((3_700_000, 4_100_000, 4_700_000, 5_300_000, 5_900_000, 6_100_000)):
        modules.append({'id': f'K{index}', 'type': 'CLOCK', 'properties': {'frequency_hz': rate}})
    return {
        'station_id': STATION,
        'circuit_graph': {'schema_version': '1.0', 'circuit_id': 'native-stop-saturated-v1',
                          'modules': modules, 'connections': connections},
        'capture_config': {'signals': ['G0.Y1'], 'duration_ns': SATURATED_DURATION_NS, 'max_events': 1_000_000},
    }


def _until(predicate, timeout, description):
    deadline = monotonic() + timeout
    while True:
        result = predicate()
        if result:
            return result
        assert monotonic() < deadline, description
        sleep(.005)


def _create(client, payload):
    key = uuid4().hex
    record = client.request('create', 'POST', '/api/experiments', expected=(201,),
                            headers={'Idempotency-Key': key + ':create'}, json=payload).json()
    return record['experiment_id'], key


def _run(client, experiment, key):
    client.request('run', 'POST', f'/api/experiments/{experiment}/run',
                   headers={'Idempotency-Key': key + ':run'})
    return experiment


def _create_and_run(client, payload):
    return _run(client, *_create(client, payload))


def _stop(client, experiment):
    started = perf_counter_ns()
    client.request('stop', 'POST', f'/api/experiments/{experiment}/stop',
                   headers={'Idempotency-Key': uuid4().hex})
    return started, perf_counter_ns()


def _saturated_wave(threads, clients, controllers, payload, root, wave):
    creations = [threads.submit(_create, client, payload) for client in clients]
    entries = [future.result() for future in creations]
    experiments = [entry[0] for entry in entries]
    ticket = uuid4().hex
    paths = [_experiment_trace(root, experiment) for experiment in experiments]
    for path in paths:
        (path / 'wave').write_text(ticket, encoding='ascii')
    runs = [threads.submit(_run, client, *entry) for client, entry in zip(clients, entries)]
    _until(lambda: all((path / 'ready').is_file() for path in paths), 8,
           'All four real jobs must reach the saturated wave rendezvous.')
    # A common monotonic release gives each process the same launch point.
    # The intervals used for qualification exclude this wait.
    release_ns = perf_counter_ns() + SATURATED_RELEASE_LEAD_NS
    _publish_release(root, ticket, release_ns)
    http = [None] * WORKERS
    if wave:
        target = (wave - 1) % WORKERS
        _sleep_until_ns(release_ns + SATURATED_STOP_OFFSET_NS)
        http[target] = _stop(controllers[target], experiments[target])
    for run in runs:
        run.result()
    return experiments, paths, http, monotonic(), release_ns


def _peer_capture(client, terminal):
    from contracts.capture_codec import decode_digital

    capture = terminal['capture']
    assert capture['available'] and capture['duration_ns'] == SATURATED_DURATION_NS
    response = client.request('peer_capture', 'GET', capture['payload_ref'])
    decoded = decode_digital(response.content)
    assert decoded['duration_ns'] == SATURATED_DURATION_NS
    expected = [{'signal': 'G0.Y1', 'time_ns': 0, 'value': 'X'}]
    expected.extend({'signal': 'G0.Y1', 'time_ns': stamp + 8, 'value': (stamp // 500) % 2}
                    for stamp in range(0, SATURATED_DURATION_NS - 8, 500))
    assert decoded['samples'] == expected
    return sha256(response.content).hexdigest()


def _finished(client, experiment):
    record = client.request('terminal_poll', 'GET', f'/api/experiments/{experiment}').json()
    if record['state'] in ('COMPLETE', 'FAULT') and record['lease_expires_at'] is None:
        return record


def _read_events(trace):
    return sorted((json.loads(path.read_text(encoding='utf-8')) for path in trace.glob('*.json')),
                  key=lambda entry: entry['at_ns'])


def _active_workers(workers, at):
    active = set()
    for worker in workers:
        start = worker.get('native_began_ns', worker['began_ns'])
        finish = worker.get('native_finished_ns', worker['at_ns'])
        if start is not None and finish is not None and start <= at < finish:
            active.add(worker['pid'])
    return active


def _qualify(http, events, workers, terminal, *, supplemental=False):
    started, replied = http
    ack = next((entry for entry in events if entry['event'] == 'stop-ack'
                and entry['kind'] == 'stop' and started <= entry['sent_ns'] <= entry['at_ns'] <= replied), None)
    if ack is None:
        return {'rejected': 'no client Stop acknowledgement in the request window'}
    ingress = [entry for entry in events if entry['event'] == 'stop-rpc'
               and ack['sent_ns'] <= entry['entered_ns'] <= entry['at_ns'] <= ack['at_ns']]
    assert len(ingress) == 1, 'Stop RPC must match the client call window.'
    ingress = ingress[0]
    active_pids = _active_workers(workers, ingress['entered_ns'])
    if len(active_pids) != WORKERS:
        reason = ('fewer than four native worker requests in flight at Stop RPC ingress'
                  if 'native_began_ns' in workers[0]
                  else 'fewer than four worker processes computing at Stop RPC ingress')
        return {'rejected': reason, 'busy_workers': len(active_pids)}
    if supplemental:
        active_at_http = _active_workers(workers, started)
        if active_at_http != active_pids:
            return {'rejected': 'fewer than four target-wave workers active at HTTP Stop start',
                    'busy_workers_at_http': len(active_at_http), 'busy_workers': len(active_pids)}
    assert ingress['safe'] and ack['safe'], 'Busy Stop had no safe gRPC acknowledgement.'
    assert terminal['state'] == 'COMPLETE' and terminal['error_code'] == 'STOPPED'
    history = terminal['state_history']
    assert history[-5:] == ['RUNNING', 'STOPPING', 'SAFE_STATE', 'RELEASE', 'COMPLETE']
    assert not (terminal.get('capture') or {}).get('available'), 'Stopped generation published capture.'
    durable = [entry for entry in events if entry['event'] in ('lease-released', 'lease-quarantined')]
    assert len(durable) == 1 and durable[0]['event'] == 'lease-released'
    worker = next(entry for entry in events if entry['event'] == 'worker-finished')
    assert not worker.get('cancelled') or worker['child_reaped'], 'Cancelled native child was not reaped.'
    cleanup = [entry for entry in events if entry['event'] == 'stop-ack' and entry['kind'] == 'run']
    assert len(cleanup) == 1 and cleanup[0]['safe']
    assert worker['at_ns'] <= cleanup[0]['at_ns'] <= durable[0]['at_ns'], 'Lease released before cleanup ACK.'
    result = {
        'http_ns': replied - started, 'grpc_ack_ns': ack['at_ns'] - started,
        'cleanup_grpc_ack_ns': cleanup[0]['at_ns'] - started, 'safe_release_ns': durable[0]['at_ns'] - started,
        'worker_remaining_ns': worker['at_ns'] - started, 'busy_workers': len(active_pids),
    }
    if supplemental:
        result['proof'] = {
            'http_started_ns': started, 'stop_rpc_ingress_ns': ingress['entered_ns'],
            'target_pid': worker['pid'], 'terminal_state': terminal['state'],
            'terminal_error': terminal['error_code'], 'history_tail': history[-5:],
            'stale_capture_available': bool((terminal.get('capture') or {}).get('available')),
            'safe_initial_ack': ack['safe'], 'safe_cleanup_ack': cleanup[0]['safe'],
            'durable_lease_event': durable[0]['event'],
        }
    return result


def _summarize(samples, field):
    values = sorted(sample[field] for sample in samples)
    return {f'p{q}_ms': values[ceil(q / 100 * len(values)) - 1] / 1_000_000
            for q in (50, 95, 99)} if values else {}


def _wave_receipt(workers, wave, release_ns):
    starts = [worker.get('native_began_ns', worker['began_ns']) for worker in workers]
    return {
        'wave': wave,
        'peak_active_workers': max((len(_active_workers(workers, start)) for start in starts
                                    if start is not None), default=0),
        'worker_spans': workers,
        **({'release_ns': release_ns} if release_ns is not None else {}),
    }


def _load_stop_limits(reference_sha256):
    selected = getenv('CIRNET_NATIVE_STAGE0_REFERENCE')
    assert selected, 'Select the published Stage 0 archive with CIRNET_NATIVE_STAGE0_REFERENCE.'
    path = Path(selected)
    assert path.is_absolute()
    with path.open('rb') as source:
        assert file_digest(source, 'sha256').hexdigest() == STAGE0_ARCHIVE_SHA256
        with ZipFile(source) as archive:
            lock = archive.read('release/release-set.json')
            thresholds = archive.read('performance/thresholds.json')
    assert sha256(lock).hexdigest() == reference_sha256
    assert sha256(thresholds).hexdigest() == STOP_THRESHOLDS_SHA256
    value = json.loads(thresholds)
    assert value['manifest_sha256'] == reference_sha256 and value['complete_measurement_set'] is True
    assert value['compatibility_and_safety_differences_allowed'] == 0
    return {field: {percentile: value['stop'][field][percentile] for percentile in STOP_GATE_PERCENTILES}
            for field in STOP_GATE_FIELDS}


def _reference_receipt():
    selected = getenv('CIRNET_NATIVE_STOP_REFERENCE_RECEIPT')
    if not selected:
        return None
    path = Path(selected)
    assert path.is_absolute() and path.resolve().is_relative_to(artifact_directory())
    raw = path.read_bytes()
    receipt = json.loads(raw)
    assert receipt['profile'] == SATURATED_PROFILE and receipt['backend'] == 'legacy'
    return sha256(raw).hexdigest(), receipt


def _paired_reference(reference, report, minimum):
    if reference is None:
        return None
    digest, receipt = reference
    for key in ('release_set_sha256', 'workload_sha256', 'harness_sha256', 'peer_capture_sha256',
                'worker_limit', 'database', 'stop_offset_ns', 'clock', 'driver', 'invariant_scope',
                'launcher_sha256', 'client_sha256', 'capture_diagnostic_sha256'):
        assert receipt[key] == report[key], f'Stop comparison changed {key}'
    assert receipt['valid_count'] >= minimum
    return {'sha256': digest, 'valid_count': receipt['valid_count'],
            'percentiles': receipt['percentiles']}


def _validated_stop_percentiles(report, minimum):
    samples = report['samples']
    count = len(samples)
    assert count == report['valid_count'] and count >= max(100, minimum)
    assert count == len({sample['experiment_id'] for sample in samples}) == len({sample['wave'] for sample in samples})
    assert report['injected_load'] is False and report['residual_leases'] == 0
    waves = {wave['wave']: wave for wave in report['saturated_waves']}
    for sample in samples:
        proof = sample['proof']
        wave = waves[sample['wave']]
        workers = wave['worker_spans']
        active = _active_workers(workers, proof['stop_rpc_ingress_ns'])
        assert sample['busy_workers'] == len(active) == len(workers) == WORKERS
        assert proof['http_started_ns'] <= proof['stop_rpc_ingress_ns'] <= (
            proof['http_started_ns'] + sample['grpc_ack_ns'])
        assert _active_workers(workers, proof['http_started_ns']) == active
        assert proof['target_pid'] in active
        assert all(worker.get('native_began_ns', worker['began_ns']) >= wave['release_ns'] for worker in workers)
        target = next(worker for worker in workers if worker['pid'] == proof['target_pid'])
        assert not target.get('cancelled') or target['child_reaped']
        assert proof['terminal_state'] == 'COMPLETE' and proof['terminal_error'] == 'STOPPED'
        assert proof['history_tail'] == ['RUNNING', 'STOPPING', 'SAFE_STATE', 'RELEASE', 'COMPLETE']
        assert proof['stale_capture_available'] is False and proof['durable_lease_event'] == 'lease-released'
        assert proof['safe_initial_ack'] is True and proof['safe_cleanup_ack'] is True
        assert all(type(sample[field]) is int and sample[field] > 0 for field in STOP_GATE_FIELDS)
        assert 0 < sample['grpc_ack_ns'] <= sample['http_ns']
        assert sample['worker_remaining_ns'] == target['at_ns'] - proof['http_started_ns']
        assert 0 < sample['worker_remaining_ns'] <= sample['cleanup_grpc_ack_ns'] <= sample['safe_release_ns']
    percentiles = {field: _summarize(samples, field) for field in STOP_GATE_FIELDS}
    assert all(report['percentiles'][field] == values for field, values in percentiles.items())
    return percentiles


def _supplemental_stop_gate(report, minimum, limits, *, reference=None):
    outcome = {
        'status': 'INSUFFICIENT_SAMPLES',
        'stage0_thresholds_sha256': STOP_THRESHOLDS_SHA256,
        'minimum_samples_per_side': minimum,
        'frozen_stop_disposition': 'Separate qualification on the frozen Stage 0 fixture.',
    }
    if len(report['samples']) < minimum:
        return outcome
    measured = _validated_stop_percentiles(report, minimum)
    if reference is None:
        outcome['status'] = 'REFERENCE_READY'
        return outcome
    reference_measured = _validated_stop_percentiles(reference[1], minimum)
    comparisons = {
        f'{field}.{percentile}': {
            'reference_ms': reference_measured[field][percentile],
            'candidate_ms': measured[field][percentile], 'maximum_ms': limit,
            'passed': measured[field][percentile] <= limit,
        }
        for field, values in limits.items() for percentile, limit in values.items()
    }
    outcome.update(status='PASS' if all(check['passed'] for check in comparisons.values()) else 'FAIL',
                   paired_reference_sha256=reference[0], comparisons=comparisons)
    return outcome


def test_loaded_stop_baseline(monkeypatch):
    from tests.integration.native_external_baseline_cases import baseline_services, verified_reference

    minimum = int(getenv('CIRNET_NATIVE_STOP_SAMPLES', '100'))
    assert 1 <= minimum <= 1000
    backend = getenv('CIRNET_NATIVE_STOP_BACKEND', 'legacy')
    assert backend in ('legacy', 'cpp')
    candidate = None
    if backend == 'cpp':
        from tests.integration.native_cpp_pool_cases import select_candidate

        candidate, _ = select_candidate(monkeypatch)
        reference_sha256 = candidate['referenceSha256']
    else:
        reference_sha256 = verified_reference()
    profile = getenv('CIRNET_NATIVE_STOP_PROFILE', 'frozen')
    assert profile in ('frozen', SATURATED_PROFILE)
    saturated = profile == SATURATED_PROFILE
    gate_requested = getenv('CIRNET_NATIVE_STOP_GATE', '0')
    assert gate_requested in ('0', '1')
    label = f'{profile}-{backend}' if saturated else ('baseline' if candidate is None else 'cpp')
    directory = artifact_directory(f'native-stop-{label}-{uuid4().hex}')
    database = directory / 'stop.sqlite3'
    database_url = f'sqlite:///{database.as_posix()}'
    payload = _saturated_load() if saturated else _load()
    identity = {
        'release_set_sha256': reference_sha256,
        'workload_sha256': sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest(),
        'harness_sha256': sha256(Path(__file__).read_bytes()).hexdigest(),
        'clock': vars(get_clock_info('perf_counter')), 'database': 'sqlite',
        'guest_sessions': WORKERS, 'worker_limit': WORKERS, 'warmup_waves': 1,
    }
    reference = _reference_receipt() if saturated and candidate is not None else None
    if saturated:
        assert identity['workload_sha256'] == SATURATED_WORKLOAD_SHA256
        diagnostic_sha256 = None
        if os.environ.get('CIRNET_NATIVE_CAPTURE_FAULT_DIAGNOSTIC') == '1':
            probe_source = Path(__file__).with_name('native_phase_baseline_cases.py')
            diagnostic_sha256 = sha256(probe_source.read_bytes()).hexdigest()
        identity.update(
            profile=profile, stop_offset_ns=SATURATED_STOP_OFFSET_NS, invariant_scope='qualified-stop-cleanup-v2',
            launcher_sha256=sha256(Path(baseline_services.__code__.co_filename).read_bytes()).hexdigest(),
            client_sha256=sha256(Path(Session.request.__code__.co_filename).read_bytes()).hexdigest(),
            capture_diagnostic_sha256=diagnostic_sha256,
            driver={'release_lead_ns': SATURATED_RELEASE_LEAD_NS, 'stop_per_wave': 1,
                    'stop_target': 'round-robin', 'controller': 'same-guest independent HTTP connection',
                    'release_publication': 'closed deadline followed by a separate flag'},
        )
    limits = None
    if gate_requested == '1':
        assert saturated and minimum >= 100, 'The supplemental gate requires saturated-v1 and 100+ samples.'
        limits = _load_stop_limits(reference_sha256)
        if candidate is not None:
            assert reference is not None, 'Select a full legacy receipt with CIRNET_NATIVE_STOP_REFERENCE_RECEIPT.'
            receipt = reference[1]
            assert all(receipt[key] == value for key, value in identity.items()), 'Reference driver scope differs.'
            assert receipt['supplemental_gate']['status'] == 'REFERENCE_READY'
            assert receipt['supplemental_gate']['stage0_thresholds_sha256'] == STOP_THRESHOLDS_SHA256
            _validated_stop_percentiles(receipt, minimum)
    maximum_waves = (int(getenv('CIRNET_NATIVE_STOP_MAX_WAVES', str(2 * minimum + 3))) if saturated
                     else 2 * ceil(minimum / WORKERS) + 3)
    assert 2 <= maximum_waves <= 3000
    metrics = Metrics()
    samples, rejected, wave_receipts = [], [], []
    peer_hashes = set()
    with baseline_services(directory, database_url, probes='stop', backend=backend) as (url, _, service_pids):
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
            controllers = []
            if saturated:
                for client in clients:
                    control = Session(url, metrics)
                    stack.callback(control.close)
                    control.client.cookies.update(client.client.cookies)
                    control.client.headers.update(client.client.headers)
                    controllers.append(control)
            root = directory / 'stop-observations'

            for wave in range(maximum_waves):
                release_ns = None
                if saturated:
                    experiments, paths, http, admitted, release_ns = _saturated_wave(
                        threads, clients, controllers, payload, root, wave)
                else:
                    starts = [threads.submit(_create_and_run, client, payload) for client in clients]
                    experiments = [future.result() for future in starts]
                    admitted = monotonic()
                    paths = [root / experiment for experiment in experiments]
                    _until(lambda: all((path / 'ready').is_file() for path in paths), 10,
                           'All installed workers must enter the real simulation.')
                    stops = [threads.submit(_stop, client, experiment)
                             for client, experiment in zip(clients, experiments)]
                    http = [future.result() for future in stops]
                terminals = [_until(lambda: _finished(client, experiment), 15, 'Run did not reach a durable terminal state.')
                             for client, experiment in zip(clients, experiments)]
                traces = [_read_events(path) for path in paths]
                if saturated:
                    assert all(terminal['state'] == 'COMPLETE' for terminal in terminals), {
                        'terminals': [(terminal['experiment_id'], terminal['state'], terminal.get('error_code'))
                                      for terminal in terminals],
                        'rendezvous_errors': [entry for trace in traces for entry in trace
                                              if entry['event'] == 'worker-rendezvous-error'],
                    }
                workers = [entry for trace in traces for entry in trace if entry['event'] == 'worker-finished']
                assert len(workers) == WORKERS and all(worker['enqueued_ns'] <= worker['began_ns'] < worker['at_ns']
                                                      for worker in workers)
                assert all(worker['pid'] is not None for worker in workers)
                assert not {worker['pid'] for worker in workers}.intersection(service_pids)
                if not saturated:
                    assert all(terminal['state'] == 'COMPLETE' for terminal in terminals), terminals
                if saturated:
                    for trace in traces:
                        assert [entry['event'] for entry in trace
                                if entry['event'] in ('lease-released', 'lease-quarantined')] == ['lease-released']
                        assert all(entry['safe'] for entry in trace if entry['event'] in ('stop-rpc', 'stop-ack'))
                    for observation, client, terminal in zip(http, clients, terminals):
                        if observation is None:
                            peer_hashes.add(_peer_capture(client, terminal))
                    assert len(peer_hashes) == 1, 'Unstopped peers produced different NCAP bytes.'
                if wave:
                    if candidate is not None or saturated:
                        wave_receipts.append(_wave_receipt(workers, wave, release_ns))
                    for observation, trace, terminal in zip(http, traces, terminals):
                        if observation is None:
                            continue
                        result = _qualify(observation, trace, workers, terminal, supplemental=saturated)
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
        residual_leases = connection.execute('SELECT COUNT(*) FROM lab_leases').fetchone()[0]
        assert residual_leases == 0

    report = {
        **identity, 'valid_count': len(samples),
        'api_pid': service_pids[0], 'hardware_pid': service_pids[1], 'injected_load': False,
        'waves_measured': wave, 'rejected_count': len(rejected), 'rejections': rejected,
        'percentiles': {field: _summarize(samples, field)
                        for field in ('http_ns', 'grpc_ack_ns', 'cleanup_grpc_ack_ns',
                                      'safe_release_ns', 'worker_remaining_ns')},
        'samples': samples,
    }
    if candidate is not None:
        report.update(backend=backend, candidate=candidate, native_waves=wave_receipts, qualifying_minimum=minimum,
                      native_span='request flushed to reply read or aborted, with actual child PID')
    if saturated:
        report.update(
            backend=backend, saturated_waves=wave_receipts, qualifying_minimum=minimum,
            peer_capture_sha256=next(iter(peer_hashes)), residual_leases=residual_leases,
            scope='Supplemental saturated Stop profile. Rendezvous precedes legacy simulation or native IPC. '
                  'The frozen Stage 0 Stop workload and original thresholds are separate.',
        )
        if candidate is not None:
            report['paired_reference'] = _paired_reference(reference, report, minimum)
    if limits is not None:
        report['supplemental_gate'] = _supplemental_stop_gate(report, minimum, limits, reference=reference)
    output = directory / 'loaded-stop.json'
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Loaded Stop evidence: {output}')
    assert len(samples) >= minimum, (report if candidate is None and not saturated
                                     else f'Only {len(samples)} of {minimum} qualifying samples. See {output}.')
    if limits is not None:
        assert report['supplemental_gate']['status'] in ('REFERENCE_READY', 'PASS'), report['supplemental_gate']
