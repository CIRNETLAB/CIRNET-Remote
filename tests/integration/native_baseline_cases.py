"""Explicit Stage 0 microbenchmark against the selected Simulator and Contracts."""

from hashlib import sha256
import json
from math import ceil
from pathlib import Path
from time import perf_counter_ns, process_time_ns
from uuid import uuid4

from cirnet_sim.backends import compile_graph, run_plan
from contracts.capture_codec import decode_digital, encode_digital

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import graph, verify_digital_evidence
from scripts.contracts_artifact import installed_provenance as contracts_provenance
from scripts.environment import getenv
from scripts.simulator_artifact import installed_provenance as simulator_provenance


def measure(operation):
    for _ in range(20):
        operation()
    repetitions = []
    for _ in range(3):
        observations = []
        cpu_start = process_time_ns()
        wall_start = perf_counter_ns()
        for _ in range(200):
            start = perf_counter_ns()
            operation()
            observations.append(perf_counter_ns() - start)
        elapsed_ns = perf_counter_ns() - wall_start
        cpu_ns = process_time_ns() - cpu_start
        ordered = sorted(observations)
        repetitions.append({
            'count': len(ordered),
            'p50_us': ordered[ceil(.50 * len(ordered)) - 1] / 1_000,
            'p95_us': ordered[ceil(.95 * len(ordered)) - 1] / 1_000,
            'p99_us': ordered[ceil(.99 * len(ordered)) - 1] / 1_000,
            'elapsed_ns': elapsed_ns,
            'process_cpu_ns_per_operation': cpu_ns / len(ordered),
            'observations_ns': observations,
        })
    return repetitions


def test_legacy_digital_phase_baseline():
    assert getenv('CIRNET_CONTRACTS_ARTIFACT_MANIFEST'), 'Select the baseline Contracts artifact.'
    assert getenv('CIRNET_SIMULATOR_ARTIFACT_MANIFEST'), 'Select the baseline Simulator artifact.'
    receipts = (contracts_provenance(), simulator_provenance())
    workload = {
        'graph': graph(0),
        'configuration': {'signals': ['G.Y1'], 'duration_ns': 40, 'max_events': 100},
        'vectors': [{'time_ns': 20, 'inputs': {'X.OUT': 1}}],
    }
    plan = compile_graph(workload['graph'], backend_id='legacy')
    capture = run_plan(plan, workload['configuration'], workload['vectors'])
    binary = encode_digital(capture['samples'], capture['duration_ns'])
    binary_digest = sha256(binary).hexdigest()
    assert binary_digest == 'a7d9fbe031939f9cdbf60f0f626b325beac173d9e720eb968fc62d9b83314010'
    assert verify_digital_evidence({
        'source': 'simulation', 'available': capture['available'],
        'sample_count': len(capture['samples']), 'payload_byte_count': len(binary),
        'sha256': binary_digest,
    }, binary) == 3

    report = {
        'backend': plan.backend.id,
        'artifacts': {
            receipt['name']: {'version': receipt['version'], 'sha256': receipt['selected_sha256']}
            for receipt in receipts
        },
        'harness_sha256': sha256(Path(__file__).read_bytes()).hexdigest(),
        'workload_sha256': sha256(json.dumps(workload, sort_keys=True).encode()).hexdigest(),
        'ncap_sha256': binary_digest,
        'compile': measure(lambda: compile_graph(workload['graph'], backend_id='legacy')),
        'run': measure(lambda: run_plan(plan, workload['configuration'], workload['vectors'])),
        'ncap_encode': measure(lambda: encode_digital(capture['samples'], capture['duration_ns'])),
        'ncap_decode': measure(lambda: decode_digital(binary)),
    }
    output = artifact_directory('native-baseline-phases') / f'and-74hc08-{uuid4().hex}.json'
    output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
