"""Validate exact approved integration/product versions and their rollback lock."""
import json
import hashlib
from pathlib import Path
import re
try:
    from scripts.environment import export_environment
except ModuleNotFoundError:
    from environment import export_environment
from urllib.parse import urlparse

VERSION = '0.1.2'
SYSTEM_VERSION = '0.1.4'
PRODUCT_VERSIONS = {'Remote': VERSION, 'Contracts': VERSION, 'Interface': '0.1.4',
                    'Simulator': VERSION, 'Hardware': VERSION, 'FPGA': VERSION}
FILENAMES = {
    'Remote': {'python': 'cirnet_api-0.1.2-py3-none-any.whl', 'sdist': 'cirnet_api-0.1.2.tar.gz', 'deployment': 'cirnet-remote-0.1.2-deployment.tar.gz'},
    'Contracts': {'python': 'cirnet_contracts-0.1.2-py3-none-any.whl', 'sdist': 'cirnet_contracts-0.1.2.tar.gz', 'npm': 'cirnet-contracts-0.1.2.tgz', 'dev': 'cirnet_artifact_paths-1.0.0a1-py3-none-any.whl', 'dev_npm': 'cirnet-artifact-paths-1.0.0-m1.0.tgz'},
    'Simulator': {'python': 'cirnet_simulator-0.1.2-py3-none-any.whl', 'sdist': 'cirnet_simulator-0.1.2.tar.gz'},
    'Hardware': {'python': 'cirnet_hardware_service-0.1.2-py3-none-any.whl', 'sdist': 'cirnet_hardware_service-0.1.2.tar.gz'},
    'Interface': {'source': 'cirnet-interface-0.1.4-source.tar.gz', 'static': 'cirnet-interface-0.1.4-static.tar.gz'},
    'FPGA': {'source': 'cirnet-fpga-scaffold-0.1.2.tar.gz'},
}
COMPATIBILITY = {'contractsVersion': VERSION, 'hardwareRpcVersion': '2.0', 'fpgaLogicalProtocolVersion': '1.0-scaffold',
                 'fpgaRegisterMapVersion': '1.0-reserved', 'sameOrigin': True, 'apiSchedulerProcesses': 1, 'hardwareRpcScope': 'local-only'}
ROLLBACK_POLICY = {'matchingDatabaseBackupRequired': True, 'matchingCaptureBackupRequired': True,
                   'preserveQuarantine': True, 'automaticStartReplay': False}
GITHUB_REPOSITORY_BASE = 'https://github.com/'


def repository_slug(component):
    if component not in FILENAMES:
        raise ValueError('Unknown release repository owner: ' + component)
    return f'cirnetlab/cirnet-{component.lower()}'


def repository_urls(component):
    return (GITHUB_REPOSITORY_BASE + repository_slug(component),)


def release_tag(component):
    return 'v' + (SYSTEM_VERSION if component == 'Remote' else PRODUCT_VERSIONS[component])


def release_title(component):
    return repository_slug(component).split('/')[1] + '-' + release_tag(component)


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate property in release manifest: ' + key)
        result[key] = value
    return result


def load_manifest(path, *, local_artifacts=False):
    return validate_manifest(json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=_object), local_artifacts=local_artifacts)


def artifact_url(product, kind, *, public_downloads=False):
    """Select the transport for an artifact from an already validated lock."""
    artifact = product['artifacts'][kind]
    if public_downloads:
        return f"{product['repository']}/releases/download/{product['releaseTag']}/{artifact['filename']}"
    return artifact['url']


def ci_environment(value, *, public_downloads=False):
    """Select CI dependencies from the reviewed lock, independent of Actions variables."""
    validate_manifest(value)
    environment = {}
    for component, kind, prefix in (
        ('Contracts', 'python', 'CIRNET_CONTRACTS_WHEEL'),
        ('Contracts', 'dev', 'CIRNET_CONTRACTS_DEV_WHEEL'),
        ('Contracts', 'npm', 'CIRNET_CONTRACTS_NPM'),
        ('Contracts', 'sdist', 'CIRNET_CONTRACTS_SDIST'),
        ('Contracts', 'dev_npm', 'CIRNET_ARTIFACT_PATHS_NPM'),
        ('Simulator', 'python', 'CIRNET_SIMULATOR_WHEEL'),
        ('Hardware', 'python', 'CIRNET_HARDWARE_WHEEL'),
        ('FPGA', 'source', 'CIRNET_FPGA_ARTIFACT'),
    ):
        product = value['repositories'][component]
        artifact = product['artifacts'][kind]
        environment[prefix + '_URL'] = artifact_url(product, kind, public_downloads=public_downloads)
        for key in ('sha256', 'filename'):
            environment[prefix + '_' + key.upper()] = artifact[key]
    return export_environment(environment)


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


def _artifact(value, component, expected, *, local_artifacts=False):
    if not isinstance(value, dict) or not _filename(value.get('filename')) or not _sha(value.get('sha256')):
        raise ValueError('Each artifact requires a safe exact filename and SHA256: ' + component)
    if value['filename'] != expected:
        raise ValueError('Unexpected versioned artifact filename for ' + component)
    if local_artifacts:
        local_artifact_bytes(value)
        return
    if 'path' in value:
        raise ValueError('Published artifacts cannot contain a local path: ' + component)
    url = value.get('url')
    if not isinstance(url, str):
        raise ValueError('An immutable GitHub release asset URL is required: ' + component)
    parsed = urlparse(url)
    prefix = f'/repos/{repository_slug(component)}/releases/assets/'
    if (parsed.scheme != 'https' or parsed.netloc != 'api.github.com' or parsed.query or parsed.fragment
            or not re.fullmatch(re.escape(prefix) + '[1-9][0-9]*', parsed.path)):
        raise ValueError('Artifact URL must identify a canonical immutable GitHub API asset: ' + component)


def validate_manifest(value, *, local_artifacts=False):
    if (not isinstance(value, dict) or type(value.get('schemaVersion')) is not int or value['schemaVersion'] != 1
            or value.get('releaseVersion') != SYSTEM_VERSION):
        raise ValueError(f'This installer supports only system release {SYSTEM_VERSION} with schemaVersion 1.')
    if type(local_artifacts) is not bool or (local_artifacts and value.get('distribution') != 'local'):
        raise ValueError('Local artifact mode requires an explicit distribution: local manifest.')
    if not local_artifacts and value.get('distribution') not in (None, 'github-release'):
        raise ValueError('Local artifact manifests require explicit --local-artifacts mode.')
    repositories = value.get('repositories')
    if not isinstance(repositories, dict) or set(repositories) != set(FILENAMES):
        raise ValueError('The release must identify exactly all six repository owners.')
    urls = set()
    for component, filenames in FILENAMES.items():
        product = repositories[component]
        if (not isinstance(product, dict) or product.get('version') != PRODUCT_VERSIONS[component]
                or not _revision(product.get('sourceRevision'))):
            raise ValueError('Each product requires its reviewed version and exact sourceRevision: ' + component)
        if product.get('repository') not in repository_urls(component):
            raise ValueError('Unknown release repository: ' + component)
        if product.get('releaseTag') != release_tag(component) or product.get('releaseTitle') != release_title(component):
            raise ValueError('Release tag or title differs from the selected product: ' + component)
        artifacts = product.get('artifacts')
        if not isinstance(artifacts, dict) or set(artifacts) != set(filenames):
            raise ValueError('The product artifact set is incomplete or unknown: ' + component)
        for kind, filename in filenames.items():
            _artifact(artifacts[kind], component, filename, local_artifacts=local_artifacts)
            location = str(Path(artifacts[kind]['path']).resolve()) if local_artifacts else artifacts[kind]['url'].lower()
            if location in urls:
                raise ValueError('An artifact location cannot identify multiple artifacts.')
            urls.add(location)
    integration = value.get('integration')
    if (not isinstance(integration, dict) or integration.get('version') != SYSTEM_VERSION
            or integration.get('repository') != repositories['Remote']['repository']
            or not _revision(integration.get('sourceRevision'))):
        raise ValueError('System integration requires an exact Remote source revision.')
    compatibility = value.get('compatibility')
    if not isinstance(compatibility, dict) or any(type(compatibility.get(key)) is not type(expected) or compatibility[key] != expected for key, expected in COMPATIBILITY.items()):
        raise ValueError('Release compatibility must preserve the reviewed protocol and runtime boundaries.')
    rollback = value.get('rollback')
    if (not isinstance(rollback, dict) or set(rollback) != set(ROLLBACK_POLICY)
            or any(rollback[key] is not expected for key, expected in ROLLBACK_POLICY.items())):
        raise ValueError('Rollback requires paired backups, preserved quarantine and no automatic replay.')
    return value
