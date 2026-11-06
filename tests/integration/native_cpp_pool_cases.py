"""Opt-in integration of the shipped Python services with the selected C++ worker."""

from contextlib import ExitStack
from hashlib import sha256
from importlib.resources import files
from io import BytesIO
import json
from math import ceil
import os
from pathlib import Path
from statistics import median
import subprocess
import sys
from time import perf_counter_ns
from uuid import uuid4
from zipfile import ZipFile

import psutil
import pytest

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics, Session
from scripts.contracts_artifact import installed_provenance as contracts_provenance
from scripts.hardware_artifact import verify_selected_install as verify_hardware_install
from scripts.install_release import API_INSTALL_PROBE
from scripts.simulator_artifact import verify_selected_install as verify_simulator_install
from tests.integration import native_external_baseline_cases as harness


def _selected_file(entry):
    path = Path(entry['path'])
    assert path.is_absolute() and path.is_file() and not path.is_symlink()
    assert sha256(path.read_bytes()).hexdigest() == entry['sha256']
    return path


def _load_frozen_thresholds(reference, lock_sha256, database, configuration, workload_sha256):
    payload = reference.read_bytes()
    assert sha256(payload).hexdigest() == '73185795872bc1ec7e40e30ecc9732a27ba3cbb5dcf657053db5264302117fbb'
    with ZipFile(BytesIO(payload)) as archive:
        lock = archive.read('release/release-set.json')
        thresholds = archive.read('performance/thresholds.json')
        profile = json.loads(archive.read(f'performance/{database}/load-1.json'))
    assert sha256(lock).hexdigest() == lock_sha256
    assert sha256(thresholds).hexdigest() == 'fd7412c675c0372521519626b77a0e74e83d8967037a597e283086378ba0685a'
    thresholds = json.loads(thresholds)
    assert thresholds['complete_measurement_set'] and thresholds['manifest_sha256'] == lock_sha256
    assert profile['configuration'] == configuration and profile['workload_sha256'] == workload_sha256
    return thresholds['load'][database]


def _compare_frozen_load(profiles, limits):
    assert len(profiles['legacy']) == len(profiles['cpp']) == 3
    report = {}

    def compare(metric, read, limit, bound):
        reference, candidate = (median(read(row) for row in profiles[backend]) for backend in ('legacy', 'cpp'))
        report[metric] = {'legacy': reference, 'cpp': candidate, 'limit': limit, 'bound': bound,
                          'passed': candidate <= limit if bound == 'maximum' else candidate >= limit}

    compare('cpu_seconds_per_job', lambda row: row['cpu_seconds_per_job'], limits['maximum_cpu_seconds_per_job'], 'maximum')
    compare('peak_rss_bytes', lambda row: row['resources']['peak_rss_bytes'], limits['maximum_peak_rss_bytes'], 'maximum')
    for rate in ('fixed_requests_per_second', 'jobs_per_second', 'capture_bytes_per_second'):
        compare(rate, lambda row: row[rate], limits['minimum_' + rate], 'minimum')
    for operation, percentiles in limits['maximum_latency_ms'].items():
        for percentile, limit in percentiles.items():
            compare(f'{operation}.{percentile}', lambda row: row['latency'][operation][percentile], limit, 'maximum')
    return report


def select_candidate(monkeypatch):
    reference = json.loads(Path(os.environ['CIRNET_NATIVE_RELEASE_STATE']).read_bytes())
    lock_bytes = (harness.ROOT / 'integration/release-set.json').read_bytes()
    lock = json.loads(lock_bytes)
    path = Path(os.environ['CIRNET_NATIVE_STAGE1_CANDIDATE'])
    assert path.is_absolute()
    candidate = json.loads(path.read_bytes())
    assert candidate['schemaVersion'] == 1
    assert candidate['referenceSha256'] == sha256(lock_bytes).hexdigest()
    products = candidate['artifacts']
    required = {'Simulator', 'Hardware', 'Worker'}
    assert set(products) in (required, required | {'Remote'})
    for name, verify in (('Simulator', verify_simulator_install), ('Hardware', verify_hardware_install)):
        entry = products[name]
        assert verify(_selected_file(entry), entry['sha256'])['selected_sha256'] == entry['sha256']
    assert contracts_provenance()['selected_sha256'] == lock['repositories']['Contracts']['artifacts']['python']['sha256']
    api = products.get('Remote', {
        'path': reference['artifacts']['Remote']['python'],
        'sha256': lock['repositories']['Remote']['artifacts']['python']['sha256'],
    })
    subprocess.run([sys.executable, '-I', '-B', '-c', API_INSTALL_PROBE,
                    _selected_file(api), api['sha256']], check=True)
    journal = candidate.get('sqliteRollbackJournal')
    monkeypatch.delenv('CIRNET_SQLITE_ROLLBACK_JOURNAL', raising=False)
    monkeypatch.delenv('NETCIRCUIT_SQLITE_ROLLBACK_JOURNAL', raising=False)
    if journal is not None:
        assert journal == 'persist' and 'Remote' in products
        monkeypatch.setenv('CIRNET_SQLITE_ROLLBACK_JOURNAL', journal)
    worker = _selected_file(products['Worker'])
    monkeypatch.setenv('CIRNET_SIM_CPP_WORKER', str(worker))
    monkeypatch.setenv('CIRNET_SIM_CPP_WORKER_SHA256', products['Worker']['sha256'])
    return candidate, worker.resolve()


def _worker_ids(parent, executable):
    result = set()
    for process in psutil.Process(parent).children(recursive=True):
        try:
            if Path(process.exe()).resolve() == executable:
                result.add(process.pid)
        except psutil.NoSuchProcess:
            continue
    return result


def _guest(stack, url, metrics):
    client = Session(url, metrics)
    stack.callback(client.close)
    session = client.request('auth', 'GET', '/api/auth/session').json()
    client.client.headers['X-CSRF-Token'] = session['csrf_token']
    return client


def _physical_fixture():
    graph = json.loads(files('contracts').joinpath('circuit-schema/examples/physical-hc08-led.json').read_bytes())
    config = {'signals': ['U1.3', 'U1.6'], 'duration_ns': 40, 'max_events': 100}
    return ('physical', graph, config, [], '8ca10f1834fe8bd35b1693023576a238000d0036a27d543058d0570ed1f70f06')


def _exercise(directory, executable, backend, profiles):
    database = 'sqlite:///' + (directory / 'integration.sqlite').as_posix()
    metrics = Metrics()
    started = perf_counter_ns()
    with harness.baseline_services(directory, database, backend=backend) as (url, _, pids), ExitStack() as stack:
        ready = perf_counter_ns()
        api, hardware = pids
        preview_workers = run_workers = None
        results = {}
        for profile, fixtures in profiles.items():
            previews = []
            for route in ('/api/circuits/physical-preview', '/api/v2/circuits/physical-preview'):
                preview = _guest(stack, url, metrics).request('preview', 'POST', route, json=fixtures[0][1]).json()
                previews.append(preview)
                current_preview_workers = _worker_ids(api, executable)
                if preview_workers is None:
                    preview_workers = current_preview_workers
                assert current_preview_workers == preview_workers, 'A serial preview must reuse its native worker.'
            captures = []
            for label, *fixture in fixtures:
                client = _guest(stack, url, metrics)
                captures.append(harness.run_workload_job(client, *fixture, label))
                current_run_workers = _worker_ids(hardware, executable)
                if run_workers is None:
                    run_workers = current_run_workers
                assert current_run_workers == run_workers, 'A serial Run must reuse its native worker.'
            results[profile] = (previews, captures)
        if backend == 'cpp':
            assert len(preview_workers) == len(run_workers) == 1
            assert preview_workers.isdisjoint(run_workers)
        else:
            assert not preview_workers and not run_workers
        checked = perf_counter_ns()
    assert all(not psutil.pid_exists(pid) for pid in preview_workers | run_workers)
    return results, {
        'service_startup_ns': ready - started, 'smoke_assertions_ns': checked - ready,
        'cleanup_ns': perf_counter_ns() - checked, 'service_pids': {'api': api, 'hardware': hardware},
        'preview_worker_pids': sorted(preview_workers), 'run_worker_pids': sorted(run_workers),
    }


def test_configured_cpp_run_preview_and_worker_reuse(monkeypatch):
    started = perf_counter_ns()
    profile = os.environ.get('CIRNET_NATIVE_SMOKE_PROFILE', 'combined')
    assert profile in ('combined', 'digital', 'physical')
    candidate, worker = select_candidate(monkeypatch)
    verified = perf_counter_ns()
    profiles = {}
    if profile != 'physical':
        digital = harness._workloads()
        profiles['digital'] = (*digital, digital[0])
    if profile != 'digital':
        physical = _physical_fixture()
        profiles['physical'] = (physical, physical)
    output = artifact_directory(f'native-cpp-pool/{uuid4().hex}')
    for backend in ('legacy', 'cpp'):
        (output / backend).mkdir()
    setup = perf_counter_ns()
    legacy, legacy_timing = _exercise(output / 'legacy', worker, 'legacy', profiles)
    cpp, cpp_timing = _exercise(output / 'cpp', worker, 'cpp', profiles)
    comparing = perf_counter_ns()
    assert cpp == legacy
    for previews, _ in cpp.values():
        assert previews[0] == previews[1]
    if 'physical' in cpp:
        preview = cpp['physical'][0][0]
        assert preview['device_states']['U1']['state'] == 'POWERED'
        assert preview['device_states']['D1']['state'] == 'ON'
    checked = perf_counter_ns()
    (output / 'candidate.json').write_text(json.dumps({
        'candidate': candidate, 'configuration': 'installed API and Hardware with normal backend selection',
        'profile': profile, 'profiles': list(profiles),
        'captures_bytes': [size for _, captures in cpp.values() for size in captures],
        'preview_routes': ['/api/circuits/physical-preview', '/api/v2/circuits/physical-preview'],
        'worker_processes': 'reused in Run and preview lanes, reaped on shutdown',
        'build_disposition': 'reused verified artifacts (no artifact compilation)',
        'timing': {
            'provenance_ns': verified - started, 'setup_ns': setup - verified,
            'legacy': legacy_timing, 'cpp': cpp_timing, 'paired_assertions_ns': checked - comparing,
            'total_ns': checked - started,
        },
    }, indent=2) + '\n', encoding='utf-8')


def test_paired_worker_profile(monkeypatch):
    from cirnet_sim.backends import close_native_workers, compile_graph, run_plan

    candidate, worker = select_candidate(monkeypatch)
    results = {}
    try:
        for label, graph, config, vectors, _ in harness._workloads():
            modes = ('legacy', 'cpp')
            plans = {mode: compile_graph(graph, backend_id=mode) for mode in modes}
            windows = []
            for _ in range(3):
                measurements = {mode: [] for mode in modes}
                for sample in range(-5, 100):
                    order = modes if sample % 2 else modes[::-1]
                    results_by_mode = {}
                    for mode in order:
                        began = perf_counter_ns()
                        results_by_mode[mode] = run_plan(plans[mode], config, vectors)
                        elapsed = perf_counter_ns() - began
                        if sample >= 0:
                            measurements[mode].append(elapsed)
                    assert results_by_mode['legacy'] == results_by_mode['cpp']
                assert len(_worker_ids(os.getpid(), worker)) == 1
                windows.append({
                    mode: {'samples_ns': samples, **{
                        f'p{q}_ms': sorted(samples)[ceil(len(samples) * q / 100) - 1] / 1_000_000
                        for q in (50, 95, 99)
                    }} for mode, samples in measurements.items()
                })
            results[label] = windows
    finally:
        close_native_workers()
    assert not _worker_ids(os.getpid(), worker)
    output = artifact_directory(f'native-cpp-paired/{uuid4().hex}')
    (output / 'paired.json').write_text(json.dumps({
        'candidate': candidate, 'scope': 'paired Simulator facade diagnostic without REST or gRPC',
        'results': results,
    }, indent=2) + '\n', encoding='utf-8')


@pytest.mark.parametrize('database', ['sqlite', 'postgresql'])
def test_paired_service_profile(monkeypatch, database):
    from tests.integration.native_phase_baseline_cases import summarize_phases

    started = perf_counter_ns()
    candidate, _ = select_candidate(monkeypatch)
    release_state = Path(os.environ['CIRNET_NATIVE_RELEASE_STATE'])
    original_python = Path(json.loads(release_state.read_bytes())['python']).resolve()
    assert original_python.is_relative_to(artifact_directory())
    assert original_python != Path(sys.executable).resolve()
    subprocess.run([original_python, '-B', '-c',
                    'from tests.integration.native_external_baseline_cases import verified_reference; verified_reference()'],
                   cwd=harness.ROOT, check=True)
    windows = int(os.environ.get('CIRNET_NATIVE_PROFILE_BATCHES', '3'))
    cycles = int(os.environ.get('CIRNET_NATIVE_PROFILE_CYCLES', '25'))
    assert 1 <= windows <= 3 and 1 <= cycles <= 25
    configuration, workload_sha256 = harness.fixed_profile_configuration(cycles)
    phases = os.environ.get('CIRNET_NATIVE_PROFILE_PHASES') == '1'
    reference = os.environ.get('CIRNET_NATIVE_STAGE0_REFERENCE')
    if reference is not None:
        assert windows == 3 and cycles == 25 and not phases, 'Thresholds require the full uninstrumented profile.'
        limits = _load_frozen_thresholds(Path(reference), candidate['referenceSha256'],
                                        database, configuration, workload_sha256)
    profiles = {'legacy': [], 'cpp': []}
    category = 'native-cpp-phases' if phases else 'native-cpp-services'
    output = artifact_directory(f'{category}/{database}-{uuid4().hex}')
    print(f'Paired service profiles: {output}', flush=True)
    setup_finished = perf_counter_ns()
    for window in range(windows):
        order = ('legacy', 'cpp') if window % 2 == 0 else ('cpp', 'legacy')
        for backend in order:
            window_started = perf_counter_ns()
            directory = output / f'{window + 1}-{backend}'
            directory.mkdir()
            python = original_python if backend == 'legacy' else sys.executable
            metrics = Metrics()
            with monkeypatch.context() as runtime:
                if backend == 'legacy':
                    runtime.delenv('CIRNET_SQLITE_ROLLBACK_JOURNAL', raising=False)
                with harness.baseline_database(database, directory) as database_url:
                    database_ready = perf_counter_ns()
                    with harness.baseline_services(directory, database_url, probes=phases,
                                                   backend=backend, python=python) as (url, password, pids):
                        services_ready = perf_counter_ns()
                        with harness.benchmark_clients(database_url, url, password, metrics, 50) as clients:
                            clients_ready = perf_counter_ns()
                            report = harness._run_fixed_profile(clients, cycles, metrics, pids)
                            test_finished = perf_counter_ns()
            window_finished = perf_counter_ns()
            measured_ns = round(report['seconds'] * 1_000_000_000)
            measured_start = report['measurement_started_ns']
            report['wall_timing_ns'] = {
                'database_and_window_setup': database_ready - window_started,
                'service_startup': services_ready - database_ready,
                'client_setup': clients_ready - services_ready,
                'warmup': measured_start - clients_ready,
                'measured_workload': measured_ns,
                'measurement_teardown': test_finished - measured_start - measured_ns,
                'cleanup': window_finished - test_finished,
            }
            if phases:
                spans = summarize_phases(directory, pids, report['jobs'], report['measurement_started_ns'], backend=backend)
                assert spans['wire_capture_bytes'] == report['capture_bytes']
                journal = os.environ.get('CIRNET_NATIVE_PHASE_SQLITE_JOURNAL')
                if database == 'sqlite' and journal is not None:
                    spans.update(sqlite_journal=journal, sqlite_synchronous=2)
                    report.update(sqlite_journal=journal, sqlite_synchronous=2)
                (directory / 'phase-summary.json').write_text(json.dumps(spans, indent=2) + '\n', encoding='utf-8')
            report.update(database=database, backend=backend, window=window + 1, cycles=cycles, candidate=candidate,
                          configuration=configuration, workload_sha256=workload_sha256)
            (directory / 'profile.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
            profiles[backend].append(report)
    (output / 'wall-timing.json').write_text(json.dumps({
        'setup_ns': setup_finished - started,
        'build': 'reused verified artifacts',
        'total_ns': perf_counter_ns() - started,
        'candidate_manifest_sha256': sha256(Path(os.environ['CIRNET_NATIVE_STAGE1_CANDIDATE']).read_bytes()).hexdigest(),
        'reference_state_sha256': sha256(release_state.read_bytes()).hexdigest(),
        'driver_sha256': sha256(Path(__file__).read_bytes()).hexdigest(),
        'launcher_sha256': sha256(Path(harness.__file__).read_bytes()).hexdigest(),
        'client_sha256': sha256(Path(Session.request.__code__.co_filename).read_bytes()).hexdigest(),
    }, indent=2) + '\n', encoding='utf-8')
    if reference is not None:
        report = _compare_frozen_load(profiles, limits)
        failed = [metric for metric, result in report.items() if not result['passed']]
        (output / 'gate-load-summary.json').write_text(json.dumps({
            'database': database, 'passed': not failed, 'checks': report,
        }, indent=2) + '\n', encoding='utf-8')
        assert not failed, f'Frozen {database} service load limits exceeded: {failed}'
