"""Build a CI dependency from its pinned CIRNET GitHub source archive."""

import argparse
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
from tempfile import mkdtemp

from artifact_download import download_artifact
from artifact_paths import artifact_directory
from contracts_artifact import NPM_NAME
from environment import append_environment

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = {
    'Contracts': ('requirements-build.lock', 'cirnet_contracts-0.1.2-py3-none-any.whl'),
    'Simulator': ('requirements-verification.lock', 'cirnet_simulator-0.1.2-py3-none-any.whl'),
    'Hardware': ('requirements-verification.lock', 'cirnet_hardware_service-0.1.2-py3-none-any.whl'),
}


def prepare_build_requirements(source, pin, *, python_version=None):
    """Extend wheel hashes for a reviewed interpreter, retaining every exact pin."""
    version = python_version or sys.version_info[:2]
    profile = pin.get('buildWheelHashes', {}).get(f'{version[0]}.{version[1]}', {})
    pending, receipt = {}, {}
    for name, entry in profile.items():
        if name not in {'requirements-build.lock', 'requirements-runtime.lock'}:
            raise ValueError('Unexpected CI build requirements path.')
        path = source / name
        original = path.read_bytes()
        digest = hashlib.sha256(original).hexdigest()
        if digest != entry['sha256']:
            raise ValueError(f'Pinned build requirements changed: {name}')
        text = original.decode('utf-8')
        for requirement, hashes in entry['hashes'].items():
            if (not re.fullmatch(r'[A-Za-z0-9_.-]+==[^\s;\\]+', requirement)
                    or not hashes or any(not re.fullmatch('[0-9a-f]{64}', value) for value in hashes)):
                raise ValueError('Invalid reviewed CI wheel hash entry.')
            pattern = (r'(?m)^' + re.escape(requirement)
                       + r' \\\n(?:[ \t]+--hash=sha256:[0-9a-f]{64}(?: \\\n|\n))+')
            matches = list(re.finditer(pattern, text))
            if len(matches) != 1 or matches[0].group().endswith('\\\n'):
                raise ValueError(f'Reviewed CI requirement is missing or ambiguous: {requirement}')
            match = matches[0]
            added = [value for value in dict.fromkeys(hashes) if value not in match.group()]
            if added:
                block = match.group().rstrip('\n') + ' \\\n' + ' \\\n'.join(
                    '    --hash=sha256:' + value for value in added) + '\n'
                text = text[:match.start()] + block + text[match.end():]
        pending[path] = text.encode('utf-8')
        receipt[name] = {'originalSha256': digest, 'sha256': hashlib.sha256(pending[path]).hexdigest()}
    # Validate every source digest and requirement before modifying any file.
    for path, payload in pending.items():
        path.write_bytes(payload)
    return receipt


def extract_source(content, destination, archive_root):
    """Allow only regular source files and directories below the expected root."""
    with tarfile.open(fileobj=BytesIO(content), mode='r:gz') as archive:
        members = archive.getmembers()
        seen = set()
        epoch = None
        for member in members:
            name = PurePosixPath(member.name)
            if (not (member.isdir() or member.isfile()) or name.is_absolute()
                    or not name.parts or name.parts[0] != archive_root
                    or '..' in name.parts or '\\' in member.name or ':' in member.name
                    or str(name).casefold() in seen):
                raise ValueError(f'Unexpected source archive member: {member.name}')
            seen.add(str(name).casefold())
            if name.parts == (archive_root,) and member.isdir():
                epoch = int(member.mtime)
        if epoch is None:
            raise ValueError('Source archive is missing its pinned root directory.')
        archive.extractall(destination, members=members, filter='data')
    return epoch


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('component', choices=PRODUCTS)
    parser.add_argument('--github-env', type=Path)
    args = parser.parse_args(argv)
    component = args.component
    pin = json.loads((ROOT / 'integration/ci-source-dependencies.json').read_text(encoding='utf-8'))[component]
    revision, digest = pin['revision'], pin['sha256']
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise ValueError(f'CI source dependency requires a full Git commit ID: {component}')
    repo = f'cirnet-{component.lower()}'
    url = f'https://codeload.github.com/cirnetlab/{repo}/tar.gz/{revision}'
    archive_root = f'{repo}-{revision}'
    workspace = Path(mkdtemp(prefix=f'{component.lower()}-', dir=artifact_directory('ci-source-dependencies')))
    epoch = extract_source(download_artifact(url, digest), workspace, archive_root)
    extracted = (workspace / archive_root).resolve()
    source = workspace / 'source'
    # Keep native tool executable paths below Windows' process-launch limit.
    # Both move endpoints must stay directly inside this owned workspace.
    boundary = workspace.resolve()
    if extracted.parent != boundary or source.resolve().parent != boundary:
        raise ValueError('Source staging must stay inside its owned workspace.')
    extracted.rename(source)
    prepared_requirements = prepare_build_requirements(source, pin)
    build_env = workspace / 'build-env'
    dist = workspace / 'dist'
    temporary = workspace / 'tmp'
    temporary.mkdir()
    environment = {key: value for key, value in os.environ.items()
                   if key not in {'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', 'PIP_TARGET', 'PIP_PREFIX'}}
    environment.update(TMP=str(temporary), TEMP=str(temporary), TMPDIR=str(temporary),
                       PIP_CACHE_DIR=str(workspace / 'pip-cache'), SOURCE_DATE_EPOCH=str(epoch),
                       PYTHONDONTWRITEBYTECODE='1')

    def run(*arguments, cwd=source):
        subprocess.run(arguments, cwd=cwd, env=environment, stdout=sys.stderr, check=True)

    requirements, filename = PRODUCTS[component]
    run(sys.executable, '-B', '-m', 'venv', str(build_env))
    python = build_env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    run(str(python), '-B', '-m', 'pip', 'install', '--disable-pip-version-check',
        '--require-hashes', '--only-binary=:all:', '-r', requirements)
    run(str(python), '-B', '-m', 'build', '--wheel', '--no-isolation', '--outdir', str(dist))
    wheel = dist / filename
    if list(dist.glob('*.whl')) != [wheel]:
        raise ValueError(f'{component} build did not produce the expected wheel: {filename}')
    wheel_digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    artifacts = {
        'schemaVersion': 1,
        'python': {'path': str(wheel), 'sha256': wheel_digest},
        'source': {'repository': f'https://github.com/cirnetlab/{repo}', 'revision': revision,
                   'sha256': digest},
    }
    if prepared_requirements:
        artifacts['buildRequirements'] = {
            'python': f'{sys.version_info.major}.{sys.version_info.minor}',
            'locks': prepared_requirements,
        }
    if component == 'Contracts':
        # Python resources and browser schemas must come from one source pin.
        # The published release SDK remains a separate, immutable selection.
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if npm is None:
            raise RuntimeError('npm is required to build the pinned Contracts public SDK.')
        sdk = source / 'packages/public-sdk'
        environment['npm_config_cache'] = str(workspace / 'npm-cache')
        run(npm, 'ci', '--no-audit', '--no-fund', cwd=sdk)
        run(npm, 'run', 'build', cwd=sdk)
        run(npm, 'pack', '--ignore-scripts', '--pack-destination', str(dist), cwd=sdk)
        packages = list(dist.glob('*.tgz'))
        if len(packages) != 1:
            raise ValueError('The Contracts source build must produce exactly one SDK package.')
        package = packages[0]
        with tarfile.open(package, 'r:gz') as archive:
            metadata = json.load(archive.extractfile('package/package.json'))
        name = metadata.get('name')
        if (name != NPM_NAME or metadata.get('version') != '0.1.2'
                or package.name != name.removeprefix('@').replace('/', '-') + '-0.1.2.tgz'):
            raise ValueError('The source SDK must be a supported Contracts 0.1.2 package.')
        artifacts['npm'] = {'path': str(package), 'sha256': hashlib.sha256(package.read_bytes()).hexdigest()}
    manifest = workspace / 'artifacts.json'
    manifest.write_text(json.dumps(artifacts, indent=2) + '\n', encoding='utf-8')
    if args.github_env is not None:
        prefix = f'CIRNET_CI_{component.upper()}_WHEEL'
        exports = {prefix: str(wheel), prefix + '_SHA256': wheel_digest,
                   f'CIRNET_CI_{component.upper()}_ARTIFACT_MANIFEST': str(manifest)}
        if component == 'Contracts':
            exports['CIRNET_CONTRACTS_ARTIFACT_MANIFEST'] = str(manifest)
        append_environment(exports, args.github_env)
    print(manifest)


if __name__ == '__main__':
    main()
