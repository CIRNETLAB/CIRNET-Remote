"""Run the same released Interface browser workflow against Stage 3 B and C."""
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4

import psutil

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import stop_owned_backend
from scripts.install_release import _checked_tar
from tests.integration.native_hardware_gate_cases import harness, matrix_services, selected


def test_stage3_released_interface_browser(selected, monkeypatch):
    run = artifact_directory(f'native-hardware-browser/{uuid4().hex}')
    state_path = Path(os.environ['CIRNET_NATIVE_RELEASE_STATE']).resolve(strict=True)
    assert state_path.is_relative_to(artifact_directory())
    state = json.loads(state_path.read_bytes())
    lock_bytes = (harness.ROOT / 'integration/release-set.json').read_bytes()
    assert sha256(lock_bytes).hexdigest() == selected['reference_sha256']
    lock = json.loads(lock_bytes)
    static = Path(state['artifacts']['Interface']['static']).read_bytes()
    static_hash = sha256(static).hexdigest()
    identity = lock['repositories']['Interface']['artifacts']['static']
    assert static_hash == identity['sha256'] and len(static) == identity['size']
    static_root = run / 'interface'
    archive, members = _checked_tar(static)
    with archive:
        archive.extractall(static_root, members=members, filter='data')
    assert (static_root / 'index.html').is_file()

    interface = Path(os.environ['CIRNET_STAGE3_INTERFACE_TOOL_ROOT']).resolve(strict=True)
    browsers = Path(os.environ['PLAYWRIGHT_BROWSERS_PATH']).resolve(strict=True)
    assert (interface / 'node_modules/playwright').is_dir() and browsers.is_dir()
    script = Path(__file__).with_name('native_hardware_browser.mjs')
    _, graph, configuration, vectors, capture_hash = harness._workloads()[0]
    graph['metadata']['name'] = 'Stage 3 browser AND'
    results = {}
    for native, name in ((False, 'B'), (True, 'C')):
        lane = run / name
        lane.mkdir()
        (lane / 'workload.json').write_text(json.dumps({
            'graph': graph, 'configuration': configuration, 'vectors': vectors,
        }), encoding='utf-8')
        with harness.baseline_database('sqlite', lane) as database_url:
            with matrix_services(lane, database_url, native, selected, monkeypatch) as (url, password, _):
                environment = {**os.environ, 'PLAYWRIGHT_BROWSERS_PATH': str(browsers),
                               'CIRNET_BROWSER_PASSWORD': password, 'TMP': str(lane),
                               'TEMP': str(lane), 'TMPDIR': str(lane)}
                with (lane / 'browser.log').open('wb') as log:
                    with subprocess.Popen(
                        ['node', str(script), str(interface), str(static_root), harness.ORIGIN, url, str(lane)],
                        cwd=lane, env=environment, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
                    ) as child:
                        try:
                            status = child.wait(timeout=100)
                        except subprocess.TimeoutExpired:
                            stop_owned_backend(child, psutil, graceful_seconds=2)
                            raise
                assert status == 0, f'Inspect browser evidence in {lane}.'
        results[name] = json.loads((lane / 'result.json').read_bytes())

    assert results['B'] == results['C']
    assert results['C']['captureSha256'] == capture_hash
    (run / 'comparison.json').write_text(json.dumps({
        'passed': True, 'interfaceSha256': static_hash, 'candidateSha256': selected['manifest_sha256'],
        'results': results,
    }, indent=2) + '\n', encoding='utf-8')
    print(f'Stage 3 browser comparison: {run}')
