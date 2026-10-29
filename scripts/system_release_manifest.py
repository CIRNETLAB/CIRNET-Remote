"""Validate exact approved integration/product versions and their rollback lock."""
import json
import hashlib
from pathlib import Path
import re
from urllib.parse import urlparse

VERSION = '0.1.1'
RELEASE_PROFILES = {
    '0.1.1': {component: '0.1.1' for component in ('Remote', 'Contracts', 'Interface', 'Simulator', 'Hardware', 'FPGA')},
    '0.1.2': {'Remote': '0.1.1', 'Contracts': '0.1.1', 'Interface': '0.1.2',
              'Simulator': '0.1.1', 'Hardware': '0.1.1', 'FPGA': '0.1.1'},
}
FILENAMES = {
    'Remote': {'python': 'netcircuit_api-0.1.1-py3-none-any.whl', 'sdist': 'netcircuit_api-0.1.1.tar.gz', 'deployment': 'netcircuit-remote-0.1.1-deployment.tar.gz'},
    'Contracts': {'python': 'netcircuit_contracts-0.1.1-py3-none-any.whl', 'sdist': 'netcircuit_contracts-0.1.1.tar.gz', 'npm': 'tinihi-labs-contracts-0.1.1.tgz', 'dev': 'netcircuit_artifact_paths-1.0.0a1-py3-none-any.whl', 'dev_npm': 'tinihi-labs-artifact-paths-1.0.0-m1.0.tgz'},
    'Simulator': {'python': 'netcircuit_simulator-0.1.1-py3-none-any.whl', 'sdist': 'netcircuit_simulator-0.1.1.tar.gz'},
    'Hardware': {'python': 'netcircuit_hardware_service-0.1.1-py3-none-any.whl', 'sdist': 'netcircuit_hardware_service-0.1.1.tar.gz'},
    'Interface': {'source': 'netcircuit-interface-0.1.1-source.tar.gz', 'static': 'netcircuit-interface-0.1.1-static.tar.gz'},
    'FPGA': {'source': 'netcircuit-fpga-scaffold-0.1.1.tar.gz'},
}
COMPATIBILITY = {'contractsVersion': VERSION, 'hardwareRpcVersion': '2.0', 'fpgaLogicalProtocolVersion': '1.0-scaffold',
                 'fpgaRegisterMapVersion': '1.0-reserved', 'sameOrigin': True, 'apiSchedulerProcesses': 1, 'hardwareRpcScope': 'local-only'}
ROLLBACK_VERSIONS = {'Remote': '0.1.0', 'Contracts': '1.0.1', 'Interface': '0.1.0-m2.0', 'Simulator': '0.2.0', 'Hardware': '0.1.1', 'FPGA': '0.1.0'}
REPOSITORY_PREFIXES = ('CIRNETLAB/CIRNET-', 'TINIHI-Labs/net-Circuit-')


def repository_urls(component):
    """Current identity and its recorded pre-rename alias; never a download fallback."""
    if component not in FILENAMES:
        raise ValueError('Unknown release repository owner: ' + component)
    return tuple('https://github.com/' + prefix + component for prefix in REPOSITORY_PREFIXES)


def _repository_prefix(repository, component):
    for prefix, url in zip(REPOSITORY_PREFIXES, repository_urls(component)):
        if repository in (url, url + '.git'):
            return prefix
    raise ValueError('Unknown canonical or historical release repository: ' + component)


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate property in release manifest: ' + key)
        result[key] = value
    return result


def load_manifest(path, *, local_artifacts=False):
    return validate_manifest(json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=_object), local_artifacts=local_artifacts)


def ci_environment(value):
    """Select CI dependencies from the reviewed lock, independent of Actions variables."""
    validate_manifest(value)
    environment = {}
    for component, kind, prefix in (
        ('Contracts', 'python', 'NETCIRCUIT_CONTRACTS_WHEEL'),
        ('Contracts', 'dev', 'NETCIRCUIT_CONTRACTS_DEV_WHEEL'),
        ('Contracts', 'npm', 'NETCIRCUIT_CONTRACTS_NPM'),
        ('Contracts', 'sdist', 'NETCIRCUIT_CONTRACTS_SDIST'),
        ('Contracts', 'dev_npm', 'NETCIRCUIT_ARTIFACT_PATHS_NPM'),
        ('Simulator', 'python', 'NETCIRCUIT_SIMULATOR_WHEEL'),
        ('Hardware', 'python', 'NETCIRCUIT_HARDWARE_WHEEL'),
        ('FPGA', 'source', 'NETCIRCUIT_FPGA_ARTIFACT'),
    ):
        artifact = value['repositories'][component]['artifacts'][kind]
        for key in ('url', 'sha256', 'filename'):
            environment[prefix + '_' + key.upper()] = artifact[key]
    return environment


def _sha(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def _revision(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{40}', value) is not None and value != '0' * 40


def _filename(value):
    return isinstance(value, str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]*', value) is not None and value not in ('.', '..')


def local_artifact_bytes(value):
    """Read exact local package bytes; never fall back to a URL."""
    if not isinstance(value, dict) or 'url' in value or not isinstance(value.get('path'), str):
        raise ValueError('Local artifacts require an explicit path without a URL.')
    path = Path(value['path'])
    if (not path.is_absolute() or path.name != value.get('filename') or path.is_symlink()
            or not path.is_file() or not _sha(value.get('sha256'))):
        raise ValueError('Local artifacts require an absolute regular package file with the exact filename and SHA256.')
    contents = path.read_bytes()
    if hashlib.sha256(contents).hexdigest() != value['sha256']:
        raise ValueError('Local artifact SHA256 does not match the selected set.')
    return contents


def _artifact(value, component, expected=None, *, released=True, local_artifacts=False, repository_prefix=REPOSITORY_PREFIXES[0]):
    if not isinstance(value, dict) or not _filename(value.get('filename')) or not _sha(value.get('sha256')):
        raise ValueError('Each artifact requires a safe exact filename and SHA256: ' + component)
    if expected is not None and value['filename'] != expected:
        raise ValueError('Unexpected versioned artifact filename for ' + component)
    if released:
        if local_artifacts:
            local_artifact_bytes(value)
            return
        if 'path' in value:
            raise ValueError('Published artifacts cannot contain a local path: ' + component)
        url = value.get('url')
        if not isinstance(url, str):
            raise ValueError('An immutable GitHub release asset URL is required: ' + component)
        parsed = urlparse(url)
        prefix = '/repos/' + repository_prefix + component + '/releases/assets/'
        if (parsed.scheme != 'https' or parsed.netloc != 'api.github.com' or parsed.query or parsed.fragment
                or not re.fullmatch(re.escape(prefix) + '[1-9][0-9]*', parsed.path)):
            raise ValueError('Artifact URL must identify a canonical immutable GitHub API asset: ' + component)


def validate_manifest(value, *, local_artifacts=False):
    if (not isinstance(value, dict) or type(value.get('schemaVersion')) is not int or value['schemaVersion'] != 1
            or not isinstance(value.get('releaseVersion'), str) or value['releaseVersion'] not in RELEASE_PROFILES):
        raise ValueError('The system release must use schemaVersion 1 and an explicitly reviewed releaseVersion (0.1.1 or 0.1.2).')
    versions = RELEASE_PROFILES[value['releaseVersion']]
    if type(local_artifacts) is not bool or (local_artifacts and value.get('distribution') != 'local'):
        raise ValueError('Local artifact mode requires an explicit distribution: local manifest.')
    if not local_artifacts and value.get('distribution') not in (None, 'github-release'):
        raise ValueError('Local artifact manifests require explicit --local-artifacts mode.')
    repositories = value.get('repositories')
    if not isinstance(repositories, dict) or set(repositories) != set(FILENAMES):
        raise ValueError('The release must identify exactly all six repository owners.')
    urls = set()
    repository_prefix = None
    for component, filenames in FILENAMES.items():
        product = repositories[component]
        version = versions[component]
        if (not isinstance(product, dict) or product.get('version') != version
                or not _revision(product.get('sourceRevision'))):
            raise ValueError('Each product requires its reviewed version and exact sourceRevision: ' + component)
        selected_prefix = _repository_prefix(product.get('repository'), component)
        if repository_prefix is not None and repository_prefix != selected_prefix:
            raise ValueError('A release cannot mix current and historical repository namespaces.')
        repository_prefix = selected_prefix
        artifacts = product.get('artifacts')
        if not isinstance(artifacts, dict) or set(artifacts) != set(filenames):
            raise ValueError('The product artifact set is incomplete or unknown: ' + component)
        for kind, filename in filenames.items():
            if component == 'Interface':
                filename = filename.replace('0.1.1', version)
            _artifact(artifacts[kind], component, filename, local_artifacts=local_artifacts, repository_prefix=repository_prefix)
            location = str(Path(artifacts[kind]['path']).resolve()) if local_artifacts else artifacts[kind]['url']
            if location in urls:
                raise ValueError('An artifact location cannot identify multiple artifacts.')
            urls.add(location)
    if value['releaseVersion'] == '0.1.2':
        integration = value.get('integration')
        if (not isinstance(integration, dict) or integration.get('version') != value['releaseVersion']
                or integration.get('repository') != repositories['Remote']['repository']
                or not _revision(integration.get('sourceRevision'))):
            raise ValueError('System patch integration requires its own exact Remote source revision, distinct from retained API provenance.')
    compatibility = value.get('compatibility')
    if not isinstance(compatibility, dict) or any(type(compatibility.get(key)) is not type(expected) or compatibility[key] != expected for key, expected in COMPATIBILITY.items()):
        raise ValueError('Release compatibility must preserve the reviewed protocol and runtime boundaries.')
    rollback = value.get('rollback')
    required = {'matchingDatabaseBackupRequired': True, 'matchingCaptureBackupRequired': True, 'preserveQuarantine': True, 'automaticStartReplay': False}
    if (not isinstance(rollback, dict) or any(rollback.get(key) is not expected for key, expected in required.items())
            or rollback.get('provenance') != 'reviewed-pre-m6-local-set' or 'priorPublishedRelease' not in rollback
            or rollback['priorPublishedRelease'] is not None):
        raise ValueError('Rollback must identify the reviewed pre-M6 set and preserve paired backups, quarantine and no replay.')
    _artifact(rollback.get('source'), 'Remote', 'netcircuit-system-rollback-pre-m6.tar.gz', local_artifacts=local_artifacts, repository_prefix=repository_prefix)
    artifact_set = rollback.get('artifactSet')
    if (not isinstance(artifact_set, list) or len(artifact_set) != len(ROLLBACK_VERSIONS)
            or any(not isinstance(item, dict) for item in artifact_set)
            or any(not isinstance(item.get('component'), str) for item in artifact_set)
            or {item.get('component') for item in artifact_set} != set(ROLLBACK_VERSIONS)):
        raise ValueError('Rollback artifactSet must identify all six preserved owners exactly once.')
    for item in artifact_set:
        if item.get('version') != ROLLBACK_VERSIONS[item['component']] or not _revision(item.get('sourceRevision')):
            raise ValueError('Rollback must preserve the recorded old product version and sourceRevision.')
        artifacts = item.get('artifacts')
        if not isinstance(artifacts, dict) or not artifacts:
            raise ValueError('Rollback artifacts require their original filenames and digests.')
        for artifact in artifacts.values():
            _artifact(artifact, item['component'], released=False)
    return value
