"""Opt-in timing probes around the selected Python reference services.

The launcher loads these probes in its own children. Artifact bytes and service
entrypoints stay intact. The timings describe an instrumented run and the spans
overlap (for example, cursor time is inside an HTTP or scheduler span).
"""

import atexit
from collections import defaultdict
from contextvars import ContextVar
from functools import wraps
from hashlib import sha256
import json
from math import ceil
import os
from pathlib import Path
from time import perf_counter_ns
from uuid import uuid4


_experiment = ContextVar('native_phase_experiment', default=None)
_worker_trace = None
_WORKLOAD_BY_NCAP_BYTES = {124: 'and', 44109: 'clock'}


class _Trace:
    def __init__(self, directory, role, context=None):
        self.pid = os.getpid()
        self.path = directory / f'spans-{role}-{self.pid}.json'
        self.rows = []
        self.context = context
        atexit.register(self.flush)

    def record(self, phase, started, ended=None, **labels):
        ended = perf_counter_ns() if ended is None else ended
        context = self.context() if self.context else {}
        ids = {name: context[name] for name in ('request_id', 'experiment_id') if context.get(name)}
        self.rows.append({
            'phase': phase, 'pid': self.pid, 'start_ns': started, 'end_ns': ended,
            **ids, **labels,
        })

    def flush(self):
        self.path.write_text(json.dumps(self.rows, separators=(',', ':')) + '\n', encoding='utf-8')


def _owned_directory(output):
    from scripts.artifact_paths import artifact_directory, validate_artifact_directory

    directory = validate_artifact_directory(output)
    session = artifact_directory()
    if directory == session or not directory.is_relative_to(session) or not directory.is_dir():
        raise ValueError('Phase timing output must be an existing owned session child.')
    return directory


def _wrap(owner, attribute, trace, phase):
    operation = getattr(owner, attribute)

    @wraps(operation)
    def observed(*args, **kwargs):
        started = perf_counter_ns()
        try:
            return operation(*args, **kwargs)
        finally:
            trace.record(phase, started)

    setattr(owner, attribute, observed)


def install_api_probes(output):
    """Attach before launching the selected API so new engines are observed."""
    from sqlalchemy import event
    from sqlalchemy.engine import Connection, Engine
    from sqlalchemy.pool import Pool

    from app import main
    from app.services import experiments, hardware_client, observability
    from app.services.capture_store import FilesystemCaptureStore
    from app.services.experiments import ExperimentManager
    from app.services.lab_compiler import LabExecutionCompiler

    trace = _Trace(_owned_directory(output), 'api', observability.current_correlation)
    _wrap(Pool, 'connect', trace, 'database.connection_acquire')
    _wrap(Connection, '_commit_impl', trace, 'database.commit')
    _wrap(LabExecutionCompiler, 'compile', trace, 'api.plan_compile')
    _wrap(ExperimentManager, '_execute_in_context', trace, 'api.scheduler_execute')
    _wrap(FilesystemCaptureStore, 'put', trace, 'api.capture_store')
    _wrap(FilesystemCaptureStore, 'get', trace, 'api.capture_read_and_validate')
    _wrap(hardware_client, 'decode_digital', trace, 'api.capture_ncap_decode')

    @event.listens_for(Engine, 'before_cursor_execute')
    def before_cursor_execute(_connection, _cursor, _statement, _parameters, context, _many):
        context._native_baseline_started = perf_counter_ns()

    @event.listens_for(Engine, 'after_cursor_execute')
    def after_cursor_execute(_connection, _cursor, _statement, _parameters, context, _many):
        trace.record('database.cursor_execute', context._native_baseline_started)

    invoke = hardware_client.HardwareServiceClient._invoke

    @wraps(invoke)
    def observed_invoke(client, method, request):
        if method != 'ReadCapture':
            return invoke(client, method, request)
        started = perf_counter_ns()
        reply = invoke(client, method, request)
        trace.record('api.capture_rpc_round_trip', started, capture_bytes=len(reply.capture_payload))
        return reply

    hardware_client.HardwareServiceClient._invoke = observed_invoke
    log = main.log_event

    @wraps(log)
    def observed_log(event_name, **fields):
        if event_name == 'http.completed':
            ended = perf_counter_ns()
            trace.record(
                'api.http_application', ended - round(fields['duration_ms'] * 1_000_000), ended,
                method=fields['method'], route=fields['route'], status=fields['status'],
            )
        return log(event_name, **fields)

    main.log_event = observed_log
    log_experiment = experiments.log_event
    enqueued = {}

    @wraps(log_experiment)
    def observed_experiment_log(event_name, **fields):
        if event_name == 'experiment.transition' and fields['state'] == 'QUEUED':
            enqueued.setdefault(fields['experiment_id'], perf_counter_ns())
        elif event_name == 'experiment.worker_started':
            experiment_id = observability.current_correlation().get('experiment_id')
            started = enqueued.pop(experiment_id, None)
            if started is not None:
                trace.record('api.queue_commit_to_scheduler_entry', started)
        return log_experiment(event_name, **fields)

    experiments.log_event = observed_experiment_log


def _timed_worker(output, experiment_id, submitted, operation, args, kwargs):
    # A module-level target preserves the real ProcessPool's spawn path.
    global _worker_trace
    began = perf_counter_ns()
    if _worker_trace is None:
        _worker_trace = _Trace(output, 'worker')
    try:
        return operation(*args, **kwargs)
    finally:
        ended = perf_counter_ns()
        _worker_trace.record('simulator.submit_to_worker_entry', submitted, began, experiment_id=experiment_id)
        _worker_trace.record('simulator.run', began, ended, experiment_id=experiment_id)


def install_hardware_probes(output):
    """Observe the real gRPC dispatch and Simulator pool without replacing either."""
    from hardware_service import rpc
    from hardware_service.station import virtual

    output = _owned_directory(output)
    trace = _Trace(output, 'hardware', lambda: {'experiment_id': _experiment.get()})
    _wrap(virtual, 'compile_graph', trace, 'hardware.graph_compile')
    _wrap(virtual.VirtualHardwareStation, 'read_capture', trace, 'hardware.capture_read')
    _wrap(rpc, 'encode_digital', trace, 'hardware.capture_ncap_encode')
    execute = rpc.LifecycleRpc._execute

    @wraps(execute)
    def observed_execute(service, request, action):
        target = request.target if hasattr(request, 'target') else request
        token = _experiment.set(target.experiment_id)
        try:
            if action.__name__ != 'read_capture':
                return execute(service, request, action)
            started = perf_counter_ns()
            try:
                return execute(service, request, action)
            finally:
                trace.record('hardware.capture_rpc_handler', started)
        finally:
            _experiment.reset(token)

    rpc.LifecycleRpc._execute = observed_execute
    pool = virtual.simulation_pool

    class PoolProbe:
        def submit(self, operation, *args, **kwargs):
            # Import by its stable name even when a launcher was run as __main__.
            from tests.integration.native_phase_baseline_cases import _timed_worker

            executor = pool()
            return executor.submit(_timed_worker, output, _experiment.get(), perf_counter_ns(), operation, args, kwargs)

    probe = PoolProbe()
    virtual.simulation_pool = lambda: probe


def _percentiles(durations):
    ordered = sorted(durations)
    return {
        'count': len(ordered),
        **{f'p{p}_ms': ordered[ceil(p * len(ordered) / 100) - 1] / 1_000_000 for p in (50, 95, 99)},
    }


def summarize_phases(directory, service_pids, verified_runs, measurement_started_ns):
    """Require complete phase coverage on the same verified experiments."""
    api_pid, hardware_pid = service_pids
    assert api_pid != hardware_pid
    rows = [
        row
        for path in sorted(directory.glob('spans-*.json'))
        for row in json.loads(path.read_text(encoding='utf-8'))
        if row['start_ns'] >= measurement_started_ns
    ]
    assert all(row['end_ns'] >= row['start_ns'] for row in rows)
    run_ids = {row['experiment_id'] for row in rows if row['phase'] == 'simulator.run'}
    assert None not in run_ids and len(run_ids) == verified_runs
    expected_pids = {
        'api.queue_commit_to_scheduler_entry': api_pid,
        'api.scheduler_execute': api_pid,
        'api.capture_rpc_round_trip': api_pid,
        'api.capture_ncap_decode': api_pid,
        'api.capture_store': api_pid,
        'hardware.graph_compile': hardware_pid,
        'hardware.capture_rpc_handler': hardware_pid,
        'hardware.capture_read': hardware_pid,
        'hardware.capture_ncap_encode': hardware_pid,
        'simulator.submit_to_worker_entry': None,
        'simulator.run': None,
    }
    for phase, pid in expected_pids.items():
        phase_rows = [row for row in rows if row['phase'] == phase]
        assert {row.get('experiment_id') for row in phase_rows} == run_ids, phase
        assert len(phase_rows) == verified_runs, phase
        if pid is None:
            assert all(row['pid'] not in service_pids for row in phase_rows), phase
        else:
            assert all(row['pid'] == pid for row in phase_rows), phase

    capture_gets = [
        row for row in rows
        if row['phase'] == 'api.http_application'
        and row['route'] == '/api/captures/{capture_id}/payload'
        and row['method'] == 'GET' and row['status'] == 200
    ]
    capture_ids = {row['request_id'] for row in capture_gets}
    assert len(capture_ids) >= verified_runs
    capture_reads = {row.get('request_id') for row in rows if row['phase'] == 'api.capture_read_and_validate'}
    assert capture_ids <= capture_reads
    grouped = defaultdict(list)
    by_workload = defaultdict(lambda: defaultdict(list))
    capture_rpc_spans = defaultdict(dict)
    workload_by_experiment = {
        row['experiment_id']: _WORKLOAD_BY_NCAP_BYTES[row['capture_bytes']]
        for row in rows if row['phase'] == 'api.capture_rpc_round_trip'
    }
    for row in rows:
        if not (row.get('request_id') or row.get('experiment_id')):
            continue  # Unscoped startup migrations and background maintenance.
        phase = row['phase']
        if phase == 'api.http_application':
            phase = f"{phase} {row['method']} {row['route']}"
        duration = row['end_ns'] - row['start_ns']
        grouped[phase].append(duration)
        workload = workload_by_experiment.get(row.get('experiment_id'))
        if workload:
            by_workload[workload][phase].append(duration)
        if phase in ('api.capture_rpc_round_trip', 'hardware.capture_rpc_handler'):
            capture_rpc_spans[row['experiment_id']][phase] = duration
    for experiment_id, spans in capture_rpc_spans.items():
        remaining = spans['api.capture_rpc_round_trip'] - spans['hardware.capture_rpc_handler']
        assert remaining >= 0
        phase = 'capture_rpc.transport_dispatch_codec_residual'
        grouped[phase].append(remaining)
        by_workload[workload_by_experiment[experiment_id]][phase].append(remaining)
    for phase in ('database.connection_acquire', 'database.cursor_execute', 'database.commit'):
        assert grouped[phase], phase
    return {
        'phases': {phase: _percentiles(values) for phase, values in sorted(grouped.items())},
        'by_workload': {
            workload: {phase: _percentiles(values) for phase, values in sorted(spans.items())}
            for workload, spans in sorted(by_workload.items())
        },
        'runs': verified_runs,
        'api_pid': api_pid,
        'hardware_pid': hardware_pid,
        'worker_pids': sorted({row['pid'] for row in rows if row['phase'] == 'simulator.run'}),
        'wire_capture_bytes': sum(row.get('capture_bytes', 0) for row in rows),
    }


def test_integrated_reference_phases():
    from scripts.artifact_paths import artifact_directory
    from scripts.benchmark_web_sessions import Metrics
    from scripts.environment import getenv
    from tests.integration.native_external_baseline_cases import (
        _run_fixed_profile, _workloads, baseline_database, baseline_services, benchmark_clients, verified_reference,
    )

    manifest_sha256 = verified_reference()
    directory = artifact_directory(f'native-phase-baseline/{uuid4().hex}')
    metrics = Metrics()
    database = getenv('CIRNET_PHASE_DATABASE', 'sqlite')
    cycles = int(getenv('CIRNET_PHASE_CYCLES', '25'))
    assert database in ('sqlite', 'postgresql') and 1 <= cycles <= 25
    with baseline_database(database, directory) as database_url:
        with baseline_services(directory, database_url, probes=True) as (url, password, pids):
            with benchmark_clients(database_url, url, password, metrics, 50) as clients:
                profile = _run_fixed_profile(clients, cycles, metrics, pids)

    report = summarize_phases(directory, pids, profile['jobs'], profile['measurement_started_ns'])
    assert report['wire_capture_bytes'] == profile['capture_bytes']
    report.update(
        http_client=profile['latency'],
        database=database,
        configuration={'cycles': cycles, 'clients': 50, 'workers': 4},
        manifest_sha256=manifest_sha256,
        harness_sha256=sha256(Path(__file__).read_bytes()).hexdigest(),
        workload_sha256=sha256(json.dumps(_workloads(), sort_keys=True).encode()).hexdigest(),
    )
    (directory / 'phase-summary.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
