"""Run real backup/restore and replay-safety gates without claiming artifact rollback.

The registered gates exercise isolated PostgreSQL schemas and installed-package
probes. A full old-artifact reinstall/recovery rehearsal remains separately
NOT_RUN until performed against the preserved rollback bundle and paired backups.
"""
import sys
sys.dont_write_bytecode = True

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from xml.etree import ElementTree

try:
    from scripts.system_release_manifest import load_manifest, VERSION
    from scripts.install_release import validate_process_environment
except ModuleNotFoundError:
    from system_release_manifest import load_manifest, VERSION
    from install_release import validate_process_environment

ROOT = Path(__file__).resolve().parents[1]
POSTGRES = 'services/api/tests/postgres_cases.py'
REPLAY = [
    'services/api/tests/test_operation_identity.py::test_run_and_stop_lost_ack_do_not_replay_side_effects',
    'services/api/tests/test_instrument_commands.py::test_timeout_is_unknown_evidence_and_never_replays_after_recovery',
    'services/api/tests/test_instrument_commands.py::test_new_manager_recovers_a_durable_intent_without_replaying_output',
    'services/api/tests/test_observability.py::test_restart_recovery_audit_failure_retains_lease_for_retry_without_replaying_start',
    'services/api/tests/test_auth_migration_integration.py::test_migration_preserves_payloads_capture_operations_and_quarantine_without_claiming_orphans',
    'services/api/tests/test_capture_storage.py::test_recovery_stops_live_lease_before_legacy_capture_storage_failure',
    'services/api/tests/test_capture_maintenance.py::test_maintenance_dry_run_and_bounded_batches_preserve_active_and_quarantined_payloads',
    'services/api/tests/test_lab_lifecycle.py::test_failed_safe_cleanup_quarantines_slot',
]


def verification_plan(temporary_root):
    temporary = Path(temporary_root)
    return [
        {'gate': 'postgres-backup-restore', 'command': [sys.executable, '-B', '-m', 'pytest', '-q', POSTGRES, '--basetemp', str(temporary / 'postgres'), '--junitxml', str(temporary / 'postgres.xml')]},
        {'gate': 'replay-and-quarantine', 'command': [sys.executable, '-B', '-m', 'pytest', '-q', *REPLAY, '--basetemp', str(temporary / 'replay'), '--junitxml', str(temporary / 'replay.xml')]},
        {'gate': 'installed-artifact-isolation', 'command': [sys.executable, '-B', str(ROOT / 'scripts/check_contract_package.py'), '--temporary-root', str(temporary / 'package')]},
    ]


def load_environment(path):
    state = json.loads(Path(path).read_text(encoding='utf-8'))
    if state.get('schemaVersion') != 1 or state.get('releaseVersion') != VERSION or Path(state.get('python', '')).resolve() != Path(sys.executable).resolve():
        raise ValueError('Use the selected release installation and its invoking virtualenv.')
    manifest = Path(state['manifest'])
    if hashlib.sha256(manifest.read_bytes()).hexdigest() != state.get('manifestSha256'):
        raise ValueError('Installed release manifest snapshot differs from its verified digest.')
    load_manifest(manifest)
    exports = state.get('environment')
    if not isinstance(exports, dict) or any(not key.startswith('NETCIRCUIT_') or any(marker in key for marker in ('TOKEN', 'PASSWORD', 'SECRET'))
            or not isinstance(value, str) or '\n' in value or '\r' in value for key, value in exports.items()):
        raise ValueError('Release environment must contain only explicit non-secret NETCIRCUIT selections.')
    required = {'NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST', 'NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST', 'NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST',
                'NETCIRCUIT_FPGA_ARTIFACT_MANIFEST', 'NETCIRCUIT_INTERFACE_ROOT', 'NETCIRCUIT_FPGA_ROOT', 'NETCIRCUIT_ARTIFACTS_SESSION', 'NETCIRCUIT_ARTIFACTS_CONTEXT'}
    if not required <= exports.keys():
        raise ValueError('Release environment is missing an explicit artifact selection.')
    state['processEnvironment'] = validate_process_environment(state.get('processEnvironment'),
        session=exports['NETCIRCUIT_ARTIFACTS_SESSION'], context=exports['NETCIRCUIT_ARTIFACTS_CONTEXT'])
    return state


def run(environment_file):
    state = load_environment(environment_file)
    if not os.environ.get('NETCIRCUIT_TEST_POSTGRES_URL'):
        raise ValueError('NETCIRCUIT_TEST_POSTGRES_URL must select an isolated real PostgreSQL test database; this gate is never skipped.')
    # Configure the selected allocator context before importing its bridge.
    os.environ.update(state['environment'])
    os.environ.update(state['processEnvironment'])
    try:
        from scripts.artifact_paths import artifact_directory
    except ModuleNotFoundError:
        from artifact_paths import artifact_directory
    temporary = artifact_directory('rollback-verification')
    environment = {**os.environ,
                   'NETCIRCUIT_DATABASE_URL': 'sqlite:///' + (temporary / 'default.sqlite').as_posix(), 'NETCIRCUIT_CAPTURE_DIR': str(temporary / 'captures')}
    plan = verification_plan(temporary)
    results = [{'gate': gate['gate'], 'status': 'NOT_RUN'} for gate in plan]
    for index, gate in enumerate(plan):
        log = temporary / (gate['gate'] + '.log')
        with log.open('wb') as output:
            completed = subprocess.run(gate['command'], cwd=ROOT, env=environment, stdout=output, stderr=subprocess.STDOUT)
        successful = completed.returncode == 0
        skipped = None
        if '--junitxml' in gate['command']:
            report = Path(gate['command'][gate['command'].index('--junitxml') + 1])
            if not report.is_file(): successful = False
            else:
                skipped = len(ElementTree.parse(report).findall('.//testcase/skipped'))
                successful = successful and skipped == 0
        results[index] = {'gate': gate['gate'], 'status': 'PASS' if successful else 'FAIL', 'exitCode': completed.returncode, 'skippedTests': skipped, 'log': str(log)}
        if not successful: break
    report = {'releaseVersion': VERSION, 'registeredGates': results, 'gateStatus': 'PASS' if len(results) == 3 and all(item['status'] == 'PASS' for item in results) else 'FAIL',
              'fullPriorArtifactRollbackRehearsal': 'NOT_RUN', 'limitation': 'These gates do not reinstall the old artifact set or restore an operator database/capture backup pair.'}
    path = temporary / 'result.json'; path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report, path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--environment-file', type=Path)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--show-plan', action='store_true')
    modes.add_argument('--run', action='store_true')
    args = parser.parse_args(argv)
    if args.show_plan:
        if args.manifest: load_manifest(args.manifest)
        print(json.dumps({'gates': verification_plan(Path('ALLOCATOR_OWNED_RUNTIME')), 'executionStatus': 'NOT_RUN', 'fullPriorArtifactRollbackRehearsal': 'NOT_RUN'}, indent=2))
        return 0
    if not args.environment_file: parser.error('--run requires --environment-file from install_release.py.')
    if args.manifest: parser.error('--manifest is for --show-plan; --run uses the digest-bound installation environment file.')
    report, path = run(args.environment_file)
    print(json.dumps({'gateStatus': report['gateStatus'], 'report': str(path), 'fullPriorArtifactRollbackRehearsal': 'NOT_RUN'}))
    return 0 if report['gateStatus'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
