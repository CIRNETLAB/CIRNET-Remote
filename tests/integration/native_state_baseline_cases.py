"""Explicit Stage 0 paired database and NCAP backup/restore verification."""

from contextlib import closing
from copy import deepcopy
from hashlib import sha256
from importlib.metadata import distribution
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, delete, select, text

from scripts.artifact_paths import artifact_directory, validate_artifact_directory
from scripts.benchmark_web_sessions import graph, verify_digital_evidence
from scripts.check_release_rollback import load_environment
from scripts.contracts_artifact import installed_provenance as contracts_provenance
from scripts.environment import getenv
from scripts.install_release import API_INSTALL_PROBE, verify_api_wheel
from scripts.simulator_artifact import installed_provenance as simulator_provenance
from services.api.tests.postgres_cases import pg, run_database_tool


ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / 'integration/release-set.json'
ORIGIN = 'http://testserver'
FIXTURE_TIME = 1_700_000_000
CAPTURE_DIGEST = 'a7d9fbe031939f9cdbf60f0f626b325beac173d9e720eb968fc62d9b83314010'


@pytest.fixture(scope='module')
def release_proof():
    import app

    selected_state = getenv('CIRNET_NATIVE_RELEASE_STATE')
    assert selected_state, 'Select release-env.json from scripts.install_release.'
    state_path = Path(selected_state)
    assert state_path.is_absolute(), 'The release state path must be absolute.'
    owned = artifact_directory()
    assert validate_artifact_directory(state_path.parent).is_relative_to(owned)
    state = load_environment(state_path)
    assert Path(state['environmentFile']).resolve() == state_path.resolve()
    assert Path(state['environment']['CIRNET_ARTIFACTS_SESSION']).resolve() == owned
    lock_bytes = LOCK.read_bytes()
    lock = json.loads(lock_bytes)
    assert lock['releaseVersion'] == '0.1.4'
    assert json.loads(Path(state['manifest']).read_bytes()) == lock
    digest = lock['repositories']['Remote']['artifacts']['python']['sha256']
    wheel = verify_api_wheel(state['artifacts']['Remote']['python'], digest)
    api = subprocess.run(
        [sys.executable, '-I', '-B', '-c', API_INSTALL_PROBE, str(wheel), digest],
        capture_output=True, check=True, timeout=30,
    )
    assert Path(app.__file__).resolve() == Path(distribution('cirnet-api').locate_file('app/__init__.py')).resolve()
    artifacts = {'Remote': json.loads(api.stdout)}
    for component, proof in (('Contracts', contracts_provenance), ('Simulator', simulator_provenance)):
        receipt = proof()
        assert receipt['selected_sha256'] == lock['repositories'][component]['artifacts']['python']['sha256']
        artifacts[component] = {key: receipt[key] for key in ('name', 'version', 'selected_sha256')}
    return {'release_version': lock['releaseVersion'], 'lock_sha256': sha256(lock_bytes).hexdigest(), 'artifacts': artifacts}


def seed_reference(repository, capture_dir):
    from app.config import Settings
    from app.services.auth import AuthError, AuthService
    from app.services.capture_store import FilesystemCaptureStore
    from app.services.captures import CaptureService
    from app.services.operations import request_fingerprint
    from app.services.projects import ProjectService
    from app.services.verification import result
    from cirnet_sim.backends import compile_graph, run_plan
    from contracts.boundary.models import ExperimentCreate

    auth = AuthService(repository, Settings(environment='test', allow_guest=True, trusted_origins=(ORIGIN,)),
                       clock=lambda: FIXTURE_TIME)
    owner, owner_cookie = auth.ensure_session(None)
    stranger, stranger_cookie = auth.ensure_session(None)
    assert owner.owner_id and stranger.owner_id and owner.owner_id != stranger.owner_id
    auth.verify_mutation(owner, ORIGIN, owner.csrf_token)
    with pytest.raises(AuthError, match='ORIGIN_REJECTED'):
        auth.verify_mutation(owner, 'http://other.test', owner.csrf_token)
    with pytest.raises(AuthError, match='CSRF_REJECTED'):
        auth.verify_mutation(owner, ORIGIN, 'invalid')

    projects = ProjectService(repository, clock=lambda: FIXTURE_TIME, authorize_session=auth.require_principal_session)
    authority = {'auth_session_id': owner.session_id}
    project = projects.create_project(owner.owner_id, {'name': 'Native baseline project'}, **authority)
    design = graph(0)
    document = projects.create_circuit(owner.owner_id, project['project_id'], {'name': 'AND v1', 'graph': design}, **authority)
    revised_design = deepcopy(design)
    revised_design['modules'][0]['properties']['state'] = True
    revised = projects.save_circuit(owner.owner_id, document['document_id'],
                                    {'base_revision': 1, 'name': 'AND v2', 'graph': revised_design}, **authority)

    plan = compile_graph(design, backend_id='legacy')
    configuration = {'signals': ['G.Y1'], 'duration_ns': 40, 'max_events': 100}
    vectors = [{'time_ns': 20, 'inputs': {'X.OUT': 1}}]
    store = FilesystemCaptureStore(capture_dir)
    metadata = CaptureService(store).persist(run_plan(plan, configuration, vectors), 'simulation')
    binary = store.get(metadata)
    assert sha256(binary).hexdigest() == CAPTURE_DIGEST
    assert verify_digital_evidence(metadata, binary) == 3

    operation_key = 'native-baseline-create'
    operation_request = ExperimentCreate.model_validate({
        'station_id': 'virtual-station-01', 'circuit_document_id': document['document_id'], 'circuit_revision': 1,
        'capture_config': configuration, 'test_vectors': vectors,
    }).model_dump()
    operation_fingerprint = request_fingerprint(operation_request)
    defaults = {
        'schema_version': '1.0', 'circuit_id': design['circuit_id'], 'assignment_id': None,
        'mode': 'simulation', 'capture': None, 'lease_expires_at': None, 'error_code': None,
        'queue_position': None, 'execution_decision': None, 'safety_verification': None,
        'topology_verification': None, 'topology_resolution': None, 'assessment': None,
        'functional_verification': result('NOT_EVALUATED'),
        '_circuit_graph': design, '_snapshot_provenance': 'created', '_assignment_snapshot': None,
    }
    completed = {
        **defaults,
        'experiment_id': '1' * 32, 'state': 'CREATED', 'revision': 0, 'state_history': ['CREATED'],
        'station_id': 'virtual-station-01',
        '_document_reference': {'document_id': document['document_id'], 'revision': 1},
        '_operation': {'key': operation_key, 'fingerprint': operation_fingerprint},
    }
    repository.create_experiment(owner.owner_id, completed, authorize_session=auth.require_principal_session, **authority)
    history = ['CREATED', 'QUEUED', 'RESERVED', 'SAFE_STATE', 'RUNNING', 'CAPTURING', 'RELEASE', 'COMPLETE']
    completed.update(state='COMPLETE', revision=len(history) - 1, state_history=history, capture=metadata)
    repository.save_experiment(completed)

    history = ['CREATED', 'QUEUED', 'RESERVED', 'RUNNING']
    faulted = {**defaults, 'experiment_id': '2' * 32, 'state': 'RUNNING', 'revision': len(history) - 1,
               'state_history': history, 'station_id': 'baseline-isolated-station', 'lease_expires_at': FIXTURE_TIME + 100}
    repository.create_experiment(owner.owner_id, faulted, authorize_session=auth.require_principal_session, **authority)
    assert repository.reserve(faulted['station_id'], 0, faulted['experiment_id'], faulted['lease_expires_at'])
    faulted.update(state='FAULT', revision=len(history), state_history=[*history, 'FAULT'],
                   error_code='RESTART_RECOVERY', lease_expires_at=None)
    repository.recover_experiment(faulted, safe=False)

    # Keep revocation tombstones. Discard the replacement sessions minted by logout.
    replacements = [auth.logout(context)[0] for context in (owner, stranger)]
    with repository.engine.begin() as db:
        db.execute(delete(repository.auth_sessions).where(
            repository.auth_sessions.c.session_id.in_([context.session_id for context in replacements]),
        ))
        db.execute(delete(repository.auth_principals).where(
            repository.auth_principals.c.principal_id.in_([context.principal_id for context in replacements]),
        ))
    return {
        'owner': owner.owner_id, 'stranger': stranger.owner_id,
        'project': project, 'document_revisions': [document, revised],
        'history': [faulted, completed], 'capture': metadata,
        'operation_request': operation_request,
        'operation': {'schema_version': '1.0', 'operation_key': operation_key, 'kind': 'create', 'status': 'APPLIED',
                      'experiment_id': completed['experiment_id'], 'error_code': None, 'revision': 1,
                      '_fingerprint': operation_fingerprint},
        'quarantined_lease': {'station_id': faulted['station_id'], 'slot': 0,
                              'experiment_id': faulted['experiment_id'], 'expires_at': FIXTURE_TIME + 100,
                              'quarantined': True},
    }, (owner_cookie, stranger_cookie)


def verify_reference(repository, capture_dir, expected, revoked_cookies):
    from app.config import Settings
    from app.services.auth import AuthService
    from app.services.capture_store import FilesystemCaptureStore
    from app.services.operations import OperationIdentity, request_fingerprint
    from app.services.projects import ProjectService
    from contracts.boundary.models import ExperimentRecord

    owner, stranger = expected['owner'], expected['stranger']
    projects = ProjectService(repository)
    assert projects.get_project(owner, expected['project']['project_id']) == expected['project']
    document, revised = expected['document_revisions']
    assert projects.resolve_snapshot(owner, document['document_id'], 1) == document
    assert projects.get_circuit(owner, document['document_id']) == revised
    with pytest.raises(PermissionError, match='FORBIDDEN'):
        projects.get_circuit(stranger, document['document_id'])
    history, cursor = repository.experiment_page(owner)
    assert cursor is None and history == expected['history']
    for experiment in history:
        ExperimentRecord.model_validate({key: value for key, value in experiment.items() if not key.startswith('_')})
    assert repository.experiment_page(stranger) == ([], None)
    assert repository.scheduler_recovery_page('queued') == []
    operation = expected['operation']
    identity = OperationIdentity(SimpleNamespace(repo=repository))
    fingerprint = request_fingerprint(expected['operation_request'])
    assert identity.existing(owner, 'create', operation['operation_key'], '', fingerprint) == operation
    changed = {**expected['operation_request'], 'circuit_revision': 2}
    with pytest.raises(ValueError, match='IDEMPOTENCY_CONFLICT'):
        identity.existing(owner, 'create', operation['operation_key'], '', request_fingerprint(changed))
    with pytest.raises(KeyError, match='OPERATION_NOT_FOUND'):
        repository.operation(stranger, 'create', operation['operation_key'])
    assert repository.leases() == [expected['quarantined_lease']]
    with repository.engine.connect() as db:
        assert db.execute(select(repository.audit.c.action).where(
            repository.audit.c.subject_id == expected['quarantined_lease']['experiment_id'],
        )).scalar_one() == 'EXPERIMENT_RESTART_QUARANTINED'
        assert db.execute(select(repository.auth_sessions.c.revoked)).scalars().all() == [True, True]

    metadata = expected['capture']
    reference = repository.capture_reference(metadata['capture_id'], owner)
    assert reference['metadata'] == metadata and reference['experiment_id'] == operation['experiment_id']
    with pytest.raises(PermissionError, match='FORBIDDEN'):
        repository.capture_reference(metadata['capture_id'], stranger)
    payload = FilesystemCaptureStore(capture_dir).get(reference['metadata'])
    assert verify_digital_evidence(metadata, payload) == 3 and sha256(payload).hexdigest() == CAPTURE_DIGEST
    auth = AuthService(repository, Settings(environment='test', allow_guest=True, trusted_origins=(ORIGIN,)),
                       clock=lambda: FIXTURE_TIME)
    assert all(auth.current(cookie) is None for cookie in revoked_cookies)


def sqlite_url(path):
    return 'sqlite:///' + path.as_posix()


@pytest.mark.parametrize('database', ['sqlite', 'postgresql'])
def test_paired_reference_state_snapshot(database, request, release_proof):
    from app.migrations import HEAD
    from app.services.persistence import Repository

    postgres = request.getfixturevalue('pg') if database == 'postgresql' else None
    output = artifact_directory('native-baseline-state') / f'{database}-{uuid4().hex}'
    pair = output / 'pair'
    pair.mkdir(parents=True)
    restored = output / 'restored'
    restored.mkdir()
    if postgres is None:
        source = output / 'source.sqlite'
        source_url = sqlite_url(source)
        archive = pair / 'database.sqlite'
        restored_file = restored / 'database.sqlite'
        restored_url = sqlite_url(restored_file)
    else:
        source_schema, source_url = postgres.new_schema()
        restored_schema, restored_url = postgres.new_schema(create=False)
        archive = pair / 'database.sql'

    source_captures = output / 'source-captures'
    with closing(Repository(source_url)) as source_repository:
        expected, revoked_cookies = seed_reference(source_repository, source_captures)
        verify_reference(source_repository, source_captures, expected, revoked_cookies)
    if postgres is None:
        with closing(sqlite3.connect(source)) as live, closing(sqlite3.connect(archive)) as snapshot:
            live.backup(snapshot)
            assert snapshot.execute('PRAGMA integrity_check').fetchone() == ('ok',)
        shutil.copyfile(archive, restored_file)
    else:
        run_database_tool(postgres, 'pg_dump', [
            f'--schema={source_schema}', '--no-owner', '--no-privileges', f'--file={archive}',
        ])
        restored_sql = restored / 'restore.sql'
        restored_sql.write_bytes(archive.read_bytes().replace(source_schema.encode(), restored_schema.encode()))
        run_database_tool(postgres, 'psql', ['--no-psqlrc', '--set=ON_ERROR_STOP=1', f'--file={restored_sql}'])

    shutil.copytree(source_captures, pair / 'captures')
    shutil.copytree(pair / 'captures', restored / 'captures')
    engine = create_engine(restored_url)
    try:
        with engine.connect() as db:
            assert db.execute(text('SELECT version_num FROM alembic_version')).scalar_one() == HEAD
    finally:
        engine.dispose()
    with closing(Repository(restored_url)) as restored_repository:
        verify_reference(restored_repository, restored / 'captures', expected, revoked_cookies)
        station = expected['quarantined_lease']['station_id']
        candidate = {'experiment_id': 'native-baseline-reserve-probe', 'state': 'CREATED',
                     'revision': 0, 'station_id': station, 'mode': 'simulation', 'capture': None}
        restored_repository.create_experiment(expected['owner'], candidate)
        assert not restored_repository.reserve(station, 0, candidate['experiment_id'], FIXTURE_TIME + 100)
        assert restored_repository.leases() == [expected['quarantined_lease']]

    files = sorted(path for path in pair.rglob('*') if path.is_file())
    receipt = {
        **release_proof, 'database': database, 'schema_revision': HEAD,
        'harness_sha256': sha256(Path(__file__).read_bytes()).hexdigest(),
        'archive_source_schema': source_schema if postgres is not None else None,
        'files': {path.relative_to(pair).as_posix(): {'size': path.stat().st_size,
                                                   'sha256': sha256(path.read_bytes()).hexdigest()} for path in files},
        'expected': expected,
    }
    (pair / 'reference.json').write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n', encoding='utf-8')
