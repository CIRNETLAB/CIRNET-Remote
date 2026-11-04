"""Build a CI dependency from its pinned CIRNET GitHub source archive."""

import argparse
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tarfile
from tempfile import mkdtemp

from artifact_download import download_artifact
from artifact_paths import artifact_directory

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = {
    'Contracts': ('requirements-build.lock', 'cirnet_contracts-0.1.1-py3-none-any.whl'),
    'Simulator': ('requirements-verification.lock', 'netcircuit_simulator-0.1.1-py3-none-any.whl'),
    'Hardware': ('requirements-verification.lock', 'netcircuit_hardware_service-0.1.1-py3-none-any.whl'),
}


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
    repo = f'CIRNET-{component}'
    url = f'https://codeload.github.com/CIRNETLAB/{repo}/tar.gz/{revision}'
    archive_root = f'{repo}-{revision}'
    workspace = Path(mkdtemp(prefix=f'{component.lower()}-', dir=artifact_directory('ci-source-dependencies')))
    epoch = extract_source(download_artifact(url, digest), workspace, archive_root)
    source = workspace / archive_root
    build_env = workspace / 'build-env'
    dist = workspace / 'dist'
    temporary = workspace / 'tmp'
    temporary.mkdir()
    environment = {key: value for key, value in os.environ.items()
                   if key not in {'PYTHONPATH', 'PYTHONHOME', 'VIRTUAL_ENV', 'PIP_TARGET', 'PIP_PREFIX'}}
    environment.update(TMP=str(temporary), TEMP=str(temporary), TMPDIR=str(temporary),
                       PIP_CACHE_DIR=str(workspace / 'pip-cache'), SOURCE_DATE_EPOCH=str(epoch),
                       PYTHONDONTWRITEBYTECODE='1')

    def run(*arguments):
        subprocess.run(arguments, cwd=source, env=environment, stdout=sys.stderr, check=True)

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
    manifest = workspace / 'artifacts.json'
    manifest.write_text(json.dumps({
        'schemaVersion': 1,
        'python': {'path': str(wheel), 'sha256': wheel_digest},
        'source': {'repository': f'https://github.com/CIRNETLAB/{repo}', 'revision': revision,
                   'sha256': digest},
    }, indent=2) + '\n', encoding='utf-8')
    if args.github_env is not None:
        prefix = f'NETCIRCUIT_CI_{component.upper()}_WHEEL'
        with args.github_env.open('a', encoding='utf-8') as output:
            output.write(f'{prefix}={wheel}\n{prefix}_SHA256={wheel_digest}\n')
    print(manifest)


if __name__ == '__main__':
    main()
