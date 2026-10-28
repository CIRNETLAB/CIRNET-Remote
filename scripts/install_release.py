"""Install a pinned six-repository release into the invoking Python virtualenv.

No service, board, migration, Start command or deployment is launched. Credentials
are consumed only by the shared authenticated downloader and never saved in state.
"""
import sys
sys.dont_write_bytecode = True

import argparse
from contextlib import redirect_stdout
from email.parser import Parser
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import uuid
from zipfile import ZipFile

try:
    from scripts.system_release_manifest import load_manifest, local_artifact_bytes, repository_urls, VERSION
    from scripts.artifact_download import download_artifact
except ModuleNotFoundError:
    from system_release_manifest import load_manifest, local_artifact_bytes, repository_urls, VERSION
    from artifact_download import download_artifact

ROOT = Path(__file__).resolve().parents[1]
PROCESS_PATH_KEYS = ('TMP', 'TEMP', 'TMPDIR', 'PIP_CACHE_DIR', 'npm_config_cache')
PROCESS_ENVIRONMENT_KEYS = {*PROCESS_PATH_KEYS, 'PYTHONDONTWRITEBYTECODE'}


def _bootstrap(value, *, local_artifacts=False):
    try:
        from scripts.bootstrap_contract_tools import bootstrap
    except ModuleNotFoundError:
        from bootstrap_contract_tools import bootstrap
    selected = value['repositories']['Contracts']['artifacts']['dev']
    if local_artifacts:
        return bootstrap(wheel=selected['path'], digest=selected['sha256'])
    return bootstrap(url=selected['url'], digest=selected['sha256'])


def _artifact_bytes(artifact, *, local_artifacts=False):
    return local_artifact_bytes(artifact) if local_artifacts else download_artifact(artifact['url'], artifact['sha256'])


def _owned_environment_file(path, session):
    try:
        from scripts.artifact_paths import validate_artifact_directory
    except ModuleNotFoundError:
        from artifact_paths import validate_artifact_directory
    selected = Path(path)
    if not selected.is_absolute():
        if selected.name != str(path) or selected.name in ('', '.', '..'):
            raise ValueError('--environment-file must be an absolute owned path or a single filename inside the newly allocated session.')
        selected = Path(session) / selected
    destination = selected.resolve()
    parent = validate_artifact_directory(destination.parent)
    if not destination.is_relative_to(Path(session).resolve()) or destination == Path(session).resolve():
        raise ValueError('--environment-file must be a child of the allocator-owned session.')
    if destination.exists() and not destination.is_file():
        raise ValueError('--environment-file must identify a regular JSON file.')
    return parent / destination.name


def _checked_tar(contents):
    archive = tarfile.open(fileobj=io.BytesIO(contents), mode='r:gz')
    members = []; names = {}; directories = set(); spelling = {}; total = 0
    try:
        for member in archive:
            path = PurePosixPath(member.name)
            total += member.size
            if len(members) >= 20000 or total > 1024 * 1024 * 1024:
                raise ValueError('Release archive exceeds its bounded member/expanded-byte limits.')
            if (path.is_absolute() or '..' in path.parts or '\\' in member.name or ':' in member.name
                    or any(part.casefold() == '.git' or part.endswith(('.', ' ')) or re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part, re.I) for part in path.parts)
                    or not (member.isfile() or member.isdir())):
                raise ValueError('Release archive contains an unsafe path, alias or special file.')
            if not path.parts:
                if not member.isdir(): raise ValueError('Invalid archive root.')
                continue
            name = path.as_posix(); key = name.casefold()
            if key in names or (member.isfile() and key in directories):
                raise ValueError('Release archive contains colliding targets.')
            for index in range(1, len(path.parts) + 1):
                prefix = '/'.join(path.parts[:index]); folded = prefix.casefold()
                if folded in spelling and spelling[folded] != prefix:
                    raise ValueError('Release archive contains case aliases.')
                spelling[folded] = prefix
                if index < len(path.parts):
                    if names.get(folded) == 'file': raise ValueError('Release archive contains file/directory collisions.')
                    directories.add(folded)
            names[key] = 'file' if member.isfile() else 'directory'
            members.append(member)
        return archive, members
    except BaseException:
        archive.close()
        raise


def _check_source(identity, component, value):
    selected = value['repositories'][component]
    source = identity.get('source', {})
    if (selected['repository'].removesuffix('.git') not in repository_urls(component)
            or not isinstance(source.get('repository'), str)
            or source['repository'].removesuffix('.git') not in repository_urls(component)
            or source.get('revision') != selected['sourceRevision'] or source.get('uncommittedMigration') is not False):
        raise ValueError(component + ' source provenance differs from the exact committed release lock.')


def _extract_static(path, directory, value, source_identity):
    archive, members = _checked_tar(Path(path).read_bytes())
    with archive:
        files = {PurePosixPath(member.name).as_posix(): member for member in members if member.isfile()}
        required = {'interface-artifact.json', 'index.html', 'oscilloscope-preview.html', 'function-generator-preview.html'}
        if not required <= files.keys():
            raise ValueError('Interface static release is missing production entrypoints or metadata.')
        identity = json.load(archive.extractfile(files['interface-artifact.json']))
        if (identity.get('name') != 'netcircuit-interface' or identity.get('version') != VERSION
                or identity.get('kind') != 'static' or identity.get('contractsVersion') != VERSION
                or identity.get('sourceFingerprint') != source_identity['sourceFingerprint']):
            raise ValueError('Interface static release does not match the selected source product.')
        _check_source(identity, 'Interface', value)
        directory.mkdir(exist_ok=False)
        archive.extractall(directory, members=members, filter='data')
    return directory


def verify_rollback_bundle(path, value):
    """Verify preserved filenames/hashes without installing or extracting old code."""
    archive, members = _checked_tar(Path(path).read_bytes())
    with archive:
        files = {}
        for member in members:
            if member.isfile(): files.setdefault(PurePosixPath(member.name).name, []).append(member)
        checked = 0
        for product in value['rollback']['artifactSet']:
            for artifact in product['artifacts'].values():
                candidates = files.get(artifact['filename'], [])
                if len(candidates) != 1 or hashlib.sha256(archive.extractfile(candidates[0]).read()).hexdigest() != artifact['sha256']:
                    raise ValueError('Rollback archive differs from its original filename/digest inventory.')
                checked += 1
    return checked


def verify_api_wheel(path, digest):
    path = Path(path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('API wheel differs from selected SHA256.')
    with ZipFile(path) as archive:
        names = archive.namelist()
        metadata = [name for name in names if name.endswith('.dist-info/METADATA')]
        if len(metadata) != 1 or len(names) != len(set(names)) or 'app/__init__.py' not in names:
            raise ValueError('API wheel must contain one distribution and its owned app package.')
        value = Parser().parsestr(archive.read(metadata[0]).decode())
        if value['Name'] != 'netcircuit-api' or value['Version'] != VERSION:
            raise ValueError('API wheel must identify netcircuit-api==0.1.1.')
        dependencies = [item.replace(' ', '') for item in value.get_all('Requires-Dist', []) if ';' not in item]
        if not {'netcircuit-contracts==0.1.1', 'netcircuit-simulator==0.1.1'} <= set(dependencies) or any(item.startswith('netcircuit-hardware') for item in dependencies):
            raise ValueError('API wheel dependencies cross the reviewed release/Hardware process boundary.')
        for name in names:
            relative = PurePosixPath(name)
            if (not relative.parts or relative.is_absolute() or '..' in relative.parts or '\\' in name or ':' in name
                    or relative.parts[0] not in {'app', 'netcircuit_api-0.1.1.dist-info'}):
                raise ValueError('API wheel contains an unexpected payload owner or unsafe path.')
    return path


def verify_package_archive(path, name, version, *, npm=False):
    archive, members = _checked_tar(Path(path).read_bytes())
    with archive:
        candidates = [member for member in members if member.isfile() and
                      (PurePosixPath(member.name).as_posix() == 'package/package.json' if npm else PurePosixPath(member.name).name == 'PKG-INFO' and len(PurePosixPath(member.name).parts) == 2)]
        if len(candidates) != 1:
            raise ValueError('Release package archive must contain one root package identity.')
        contents = archive.extractfile(candidates[0]).read()
        identity = json.loads(contents) if npm else Parser().parsestr(contents.decode())
        if (identity.get('name' if npm else 'Name') != name or identity.get('version' if npm else 'Version') != version):
            raise ValueError('Release package archive identity differs from its product/tooling pin.')
    return path


API_INSTALL_PROBE = r'''
from importlib.metadata import distribution
import hashlib,json,sys
from pathlib import Path
from zipfile import ZipFile
import app
wheel,digest=sys.argv[1:]
product=distribution('netcircuit-api')
assert product.version=='0.1.1','API installation has the wrong product version'
direct=json.loads(product.read_text('direct_url.json') or '{}')
assert 'dir_info' not in direct,'API must be installed from the selected wheel'
info=direct.get('archive_info',{})
actual=info.get('hashes',{}).get('sha256')
if actual is None and info.get('hash','').startswith('sha256='):actual=info['hash'].split('=',1)[1]
assert actual==digest,'installed API archive digest differs from the selected release'
root=Path(product.locate_file('app')).resolve()
assert Path(app.__file__).resolve()==root/'__init__.py','API import is shadowed by source'
with ZipFile(wheel) as archive:
    expected={name for name in archive.namelist() if name.startswith('app/') and not name.endswith('/')}
    observed={'app/'+path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc'}
    assert expected==observed,'installed API inventory differs from the selected archive'
    for name in expected:assert Path(product.locate_file(name)).read_bytes()==archive.read(name),'installed API bytes differ: '+name
print(json.dumps({'name':'netcircuit-api','version':'0.1.1','selectedSha256':digest,'ownedFiles':len(expected)}))
'''


def _component_install_command(component, script, value, local):
    artifact = value['repositories'][component]['artifacts']['python']
    command = [sys.executable, '-B', str(ROOT / 'scripts' / script), '--wheel', str(local[component]['python']), '--sha256', artifact['sha256']]
    if component == 'Contracts': command += ['--npm-url', '']
    return command


def _write_selected_manifests(value, local, directory):
    selected = {}
    for component in ('Contracts', 'Simulator', 'Hardware', 'FPGA'):
        kinds = ('python', 'sdist', 'npm', 'dev', 'dev_npm') if component == 'Contracts' else ('source',) if component == 'FPGA' else ('python',)
        entry = {'schemaVersion': 1, **{kind: {'path': str(local[component][kind]), 'sha256': value['repositories'][component]['artifacts'][kind]['sha256']} for kind in kinds}}
        path = directory / (component.lower() + '-artifacts.json')
        path.write_text(json.dumps(entry, indent=2) + '\n', encoding='utf-8')
        selected[component] = path
    return selected


def validate_process_environment(values, *, session, context):
    """Delegate Git/alias/session ownership to the canonical allocator bridge."""
    if (not isinstance(values, dict) or set(values) != PROCESS_ENVIRONMENT_KEYS
            or values.get('PYTHONDONTWRITEBYTECODE') != '1'
            or any(not isinstance(value, str) or '\r' in value or '\n' in value for value in values.values())):
        raise ValueError('processEnvironment must contain exactly the five owned output paths and PYTHONDONTWRITEBYTECODE=1.')
    if not isinstance(session, str) or not Path(session).is_absolute():
        raise ValueError('The selected allocator session must be absolute.')
    try:
        from scripts.artifact_paths import artifact_directory, validate_artifact_directory
    except ModuleNotFoundError:
        from artifact_paths import artifact_directory, validate_artifact_directory
    parsed_context = json.loads(context) if isinstance(context, str) else context
    previous = {key: os.environ.get(key) for key in ('NETCIRCUIT_ARTIFACTS_SESSION', 'NETCIRCUIT_ARTIFACTS_CONTEXT')}
    os.environ['NETCIRCUIT_ARTIFACTS_SESSION'] = session
    os.environ['NETCIRCUIT_ARTIFACTS_CONTEXT'] = json.dumps(parsed_context)
    try:
        # An inherited selection is admitted only after the canonical marker,
        # owner and participating-root checks. No independent Git discovery or
        # filesystem-alias policy is implemented here.
        owned = artifact_directory(context=parsed_context)
        checked = {}; result = {'PYTHONDONTWRITEBYTECODE': '1'}
        for key in PROCESS_PATH_KEYS:
            candidate = Path(values[key])
            if not candidate.is_absolute():
                raise ValueError('Process output directories must be absolute allocator-owned children.')
            if values[key] not in checked:
                checked[values[key]] = validate_artifact_directory(candidate, context=parsed_context)
            path = checked[values[key]]
            if path == owned or not path.is_relative_to(owned) or not path.is_dir():
                raise ValueError('Process output directories must be available children of the selected allocator session.')
            result[key] = str(path)
        return result
    finally:
        for key, value in previous.items():
            if value is None: os.environ.pop(key, None)
            else: os.environ[key] = value


def _install_components(value, local, environment, directory):
    commands = [('Contracts', 'install_contracts.py'), ('Simulator', 'install_simulator.py'), ('Hardware', 'install_hardware.py')]
    logs = directory / 'logs'; logs.mkdir()
    for component, script in commands:
        command = _component_install_command(component, script, value, local)
        with (logs / (component.lower() + '-install.log')).open('wb') as output:
            subprocess.run(command, env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
    api = value['repositories']['Remote']['artifacts']['python']
    wheel = verify_api_wheel(local['Remote']['python'], api['sha256'])
    with (logs / 'api-install.log').open('wb') as output:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--cache-dir', environment['PIP_CACHE_DIR'], str(wheel)], env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
        # An older or same-version installation must never mask selected bytes.
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--force-reinstall', '--no-deps', '--cache-dir', environment['PIP_CACHE_DIR'], str(wheel)], env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
    with (logs / 'pip-check.log').open('wb') as output:
        subprocess.run([sys.executable, '-I', '-m', 'pip', 'check'], env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
    probe = subprocess.run([sys.executable, '-I', '-c', API_INSTALL_PROBE, str(wheel), api['sha256']], env=environment, capture_output=True, text=True)
    (logs / 'api-selected-install.log').write_text(probe.stdout + probe.stderr, encoding='utf-8')
    probe.check_returncode()
    return json.loads(probe.stdout)


def install(manifest, environment_file, *, local_artifacts=False):
    # Complete lock/byte validation precedes all local or network side effects.
    value = load_manifest(manifest, local_artifacts=True) if local_artifacts else load_manifest(manifest)
    if not Path(environment_file).is_absolute() and (Path(environment_file).name != str(environment_file) or str(environment_file) in ('', '.', '..')):
        raise ValueError('--environment-file must be an explicit owned path or a single session-local filename.')
    if sys.prefix == sys.base_prefix:
        raise ValueError('Invoke install_release.py using the Python executable of the chosen virtualenv.')
    github_env = os.environ.pop('GITHUB_ENV', None)
    try:
        with redirect_stdout(io.StringIO()):
            allocated = _bootstrap(value, local_artifacts=True) if local_artifacts else _bootstrap(value)
    finally:
        if github_env is not None: os.environ['GITHUB_ENV'] = github_env
    try:
        from scripts.artifact_paths import artifact_directory
        from scripts.install_interface import extract_product
        from scripts import fpga_artifact
    except ModuleNotFoundError:
        from artifact_paths import artifact_directory
        from install_interface import extract_product
        import fpga_artifact
    target = _owned_environment_file(environment_file, allocated['session'])
    directory = artifact_directory('system-release') / ('installation-' + uuid.uuid4().hex)
    directory.mkdir()
    local = {}
    for component, product in value['repositories'].items():
        destination = directory / component; destination.mkdir()
        local[component] = {}
        for kind, artifact in product['artifacts'].items():
            path = destination / artifact['filename']
            path.write_bytes(_artifact_bytes(artifact, local_artifacts=local_artifacts))
            local[component][kind] = path
    rollback = value['rollback']['source']; rollback_path = directory / rollback['filename']
    rollback_path.write_bytes(_artifact_bytes(rollback, local_artifacts=local_artifacts))
    rollback_files = verify_rollback_bundle(rollback_path, value)
    for component, name in (('Remote', 'netcircuit-api'), ('Contracts', 'netcircuit-contracts'), ('Simulator', 'netcircuit-simulator'), ('Hardware', 'netcircuit-hardware-service')):
        verify_package_archive(local[component]['sdist'], name, VERSION)
    verify_package_archive(local['Contracts']['npm'], '@tinihi-labs/contracts', VERSION, npm=True)
    verify_package_archive(local['Contracts']['dev_npm'], '@tinihi-labs/artifact-paths', '1.0.0-m1.0', npm=True)
    verify_api_wheel(local['Remote']['python'], value['repositories']['Remote']['artifacts']['python']['sha256'])
    deployment, deployment_members = _checked_tar(local['Remote']['deployment'].read_bytes())
    with deployment:
        if not any(member.isfile() for member in deployment_members):
            raise ValueError('Deployment release material cannot be an empty archive.')
    interface = extract_product(local['Interface']['source'].read_bytes(), directory / 'interface-source')
    identity = json.loads((interface / 'interface-artifact.json').read_text(encoding='utf-8'))
    _check_source(identity, 'Interface', value)
    static = _extract_static(local['Interface']['static'], directory / 'interface-static', value, identity)
    fpga_identity = fpga_artifact.verify_archive(local['FPGA']['source'], value['repositories']['FPGA']['artifacts']['source']['sha256'])['identity']
    _check_source(fpga_identity, 'FPGA', value)
    fpga = fpga_artifact.extract_product(local['FPGA']['source'], value['repositories']['FPGA']['artifacts']['source']['sha256'])
    selected = _write_selected_manifests(value, local, directory)
    exports = {'NETCIRCUIT_ARTIFACTS_SESSION': str(allocated['session']), 'NETCIRCUIT_ARTIFACTS_CONTEXT': json.dumps(allocated['context']),
               'NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST': str(selected['Contracts']), 'NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST': str(selected['Simulator']),
               'NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST': str(selected['Hardware']), 'NETCIRCUIT_FPGA_ARTIFACT_MANIFEST': str(selected['FPGA']),
               'NETCIRCUIT_INTERFACE_ROOT': str(interface), 'NETCIRCUIT_INTERFACE_STATIC_ROOT': str(static), 'NETCIRCUIT_FPGA_ROOT': str(fpga)}
    exports.update(NETCIRCUIT_DATABASE_URL='sqlite:///' + (directory / 'verification-default.sqlite').as_posix(),
                   NETCIRCUIT_CAPTURE_DIR=str(directory / 'verification-captures'))
    names = {'Contracts': {'python': 'NETCIRCUIT_CONTRACTS_WHEEL', 'npm': 'NETCIRCUIT_CONTRACTS_NPM', 'sdist': 'NETCIRCUIT_CONTRACTS_SDIST', 'dev': 'NETCIRCUIT_CONTRACTS_DEV_WHEEL', 'dev_npm': 'NETCIRCUIT_ARTIFACT_PATHS_NPM'},
             'Simulator': {'python': 'NETCIRCUIT_SIMULATOR_WHEEL'}, 'Hardware': {'python': 'NETCIRCUIT_HARDWARE_WHEEL'},
             'Interface': {'source': 'NETCIRCUIT_INTERFACE_ARTIFACT'}, 'FPGA': {'source': 'NETCIRCUIT_FPGA_ARTIFACT'}}
    for component, kinds in names.items():
        for kind, prefix in kinds.items():
            for field, suffix in (('url', 'URL'), ('sha256', 'SHA256'), ('filename', 'FILENAME')):
                exports[prefix + '_' + suffix] = '' if local_artifacts and field == 'url' else value['repositories'][component]['artifacts'][kind][field]
    temporary = directory / 'tmp'; temporary.mkdir()
    cache = directory / 'pip-cache'; cache.mkdir()
    npm_cache = directory / 'npm-cache'; npm_cache.mkdir()
    process_environment = validate_process_environment({'TMP': str(temporary), 'TEMP': str(temporary), 'TMPDIR': str(temporary),
        'PIP_CACHE_DIR': str(cache), 'npm_config_cache': str(npm_cache), 'PYTHONDONTWRITEBYTECODE': '1'},
        session=str(allocated['session']), context=allocated['context'])
    # Apply through os.environ before copying it: Windows folds environment
    # names, so an inherited NPM_CONFIG_CACHE cannot survive beside a second
    # lowercase npm_config_cache entry with an ambiguous value.
    os.environ.update(process_environment)
    environment = {key: item for key, item in os.environ.items() if key != 'GITHUB_ENV'}
    environment.update(exports)
    verification = _install_components(value, local, environment, directory)
    snapshot = directory / 'release-set.json'; snapshot.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')
    state = {'schemaVersion': 1, 'releaseVersion': VERSION, 'python': sys.executable, 'environmentFile': str(target), 'manifest': str(snapshot),
             'manifestSha256': hashlib.sha256(snapshot.read_bytes()).hexdigest(), 'environment': exports, 'processEnvironment': process_environment,
             'artifacts': {name: {kind: str(path) for kind, path in paths.items()} for name, paths in local.items()},
             'apiVerification': verification, 'rollback': {'archive': str(rollback_path), 'verifiedPreservedArtifacts': rollback_files, 'rehearsalStatus': 'NOT_RUN'}}
    if local_artifacts:
        state['distribution'] = 'local'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary_state = target.with_name(target.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary_state.write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8'); temporary_state.replace(target)
    return state


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--environment-file', required=True, type=Path)
    parser.add_argument('--local-artifacts', action='store_true', help='Explicitly install a distribution: local set of digest-verified package files; no GitHub transport fallback.')
    args = parser.parse_args(argv)
    state = install(args.manifest, args.environment_file, local_artifacts=args.local_artifacts)
    print(json.dumps({'releaseVersion': state['releaseVersion'], 'environmentFile': state['environmentFile'], 'manifest': state['manifest'], 'apiVersion': state['apiVerification']['version'], 'rollbackRehearsal': 'NOT_RUN'}))
    return 0


if __name__ == '__main__':
    # Existing Interface adapters use the package-qualified scripts namespace.
    # Re-enter through the normal module CLI rather than altering sys.path.
    if not __package__:
        raise SystemExit(subprocess.run([sys.executable, '-B', '-m', 'scripts.install_release', *sys.argv[1:]], cwd=ROOT).returncode)
    raise SystemExit(main())
