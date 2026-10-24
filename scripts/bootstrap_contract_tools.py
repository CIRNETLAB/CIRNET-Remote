"""Bootstrap the independent DEV allocator from verified wheel bytes.

Before the allocator exists, the wheel and canonical Node implementation remain
in memory. The canonical implementation allocates the first external session;
only then are the wheel, pip cache and diagnostics written to disk.
"""
import argparse
import base64
from email.parser import Parser
import hashlib
from importlib.metadata import distribution
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import urlparse
import uuid
from zipfile import ZipFile
try:
    from scripts.artifact_download import download_artifact
except ModuleNotFoundError:
    from artifact_download import download_artifact

ROOT = Path(__file__).resolve().parents[1]
DEV_NAME = 'netcircuit-artifact-paths'
DEV_VERSION = '1.0.0a1'
NODE_RESOURCE = 'netcircuit_artifact_paths/artifact-paths.mjs'


def verified_dev_payload(payload, digest):
    if len(digest) != 64 or hashlib.sha256(payload).hexdigest() != digest.lower():
        raise ValueError('DEV wheel SHA256 does not match the selected artifact.')
    with ZipFile(io.BytesIO(payload)) as archive:
        metadata = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
        if len(metadata) != 1:
            raise ValueError('Expected one DEV wheel distribution metadata file.')
        value = Parser().parsestr(archive.read(metadata[0]).decode('utf-8'))
        if value['Name'] != DEV_NAME or value['Version'] != DEV_VERSION:
            raise ValueError(f'Expected independent {DEV_NAME}=={DEV_VERSION}.')
        if NODE_RESOURCE not in archive.namelist():
            raise ValueError('DEV wheel lacks the canonical Node allocator resource.')
        return archive.read(NODE_RESOURCE)


def materialize_allocator(cache_root=None, *, lock_root=ROOT):
    selected = json.loads((Path(lock_root) / 'integration/contracts-version.json').read_text())['dev']
    artifact = distribution(DEV_NAME)
    if artifact.version != DEV_VERSION:
        raise ValueError(f'Install {DEV_NAME}=={DEV_VERSION} before using verification tooling.')
    direct = artifact.read_text('direct_url.json')
    if direct and 'dir_info' in json.loads(direct):
        raise ValueError('DEV tooling must be installed from its pinned wheel, not editable source.')
    entry = next((entry for entry in artifact.files or () if str(entry) == NODE_RESOURCE), None)
    if entry is None or entry.hash is None or entry.hash.mode != 'sha256':
        raise ValueError('Installed DEV wheel has no RECORD-owned canonical Node allocator.')
    contents = Path(artifact.locate_file(entry)).read_bytes()
    digest = hashlib.sha256(contents).hexdigest()
    encoded = base64.urlsafe_b64encode(bytes.fromhex(digest)).rstrip(b'=').decode()
    if digest != selected['node_sha256'] or encoded != entry.hash.value:
        raise ValueError('Installed DEV Node resource differs from the selected wheel/lock.')
    base = Path(cache_root or lock_root).resolve()
    target = base / '.build/contracts-tools'
    if not target.resolve().is_relative_to(base):
        raise ValueError('Allocator cache must remain inside its selected compilation cache root.')
    target.mkdir(parents=True, exist_ok=True)
    for name, content in (
        ('allocator.mjs', contents),
        ('allocator.json', (json.dumps({'name': DEV_NAME, 'version': DEV_VERSION,
            'resource': NODE_RESOURCE, 'sha256': digest}, sort_keys=True) + '\n').encode()),
    ):
        destination = target / name
        if destination.is_file() and destination.read_bytes() == content:
            continue
        temporary = target / (name + '.' + uuid.uuid4().hex + '.tmp')
        temporary.write_bytes(content)
        temporary.replace(destination)
    return target


def bootstrap(*, wheel=None, digest=None, url=None, manifest=None, repository_root=ROOT, cache_root=None):
    selected_manifest = manifest or os.environ.get('NETCIRCUIT_CONTRACTS_DEV_ARTIFACT_MANIFEST') or os.environ.get('NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST')
    if not wheel and not url and selected_manifest:
        value = json.loads(Path(selected_manifest).read_text(encoding='utf-8'))
        if value.get('schemaVersion', 1) != 1:
            raise ValueError('Unsupported Contracts artifact manifest schemaVersion.')
        selected = value.get('dev')
        if selected:
            wheel, digest = selected['path'], selected['sha256']
    url = url or os.environ.get('NETCIRCUIT_CONTRACTS_DEV_WHEEL_URL')
    digest = digest or os.environ.get('NETCIRCUIT_CONTRACTS_DEV_WHEEL_SHA256')
    if wheel:
        if not Path(wheel).is_absolute():
            raise ValueError('DEV wheel path must be absolute.')
        payload = Path(wheel).read_bytes()
    elif url:
        if urlparse(url).scheme != 'https':
            raise ValueError('DEV artifact download requires an explicit HTTPS URL.')
        payload = download_artifact(url, digest)
    else:
        raise ValueError('Provide the pinned DEV wheel/path+SHA256 or NETCIRCUIT_CONTRACTS_DEV_WHEEL_URL/SHA256 before allocating verification output.')
    if not digest:
        raise ValueError('The DEV wheel SHA256 must be supplied explicitly.')
    node_source = verified_dev_payload(payload, digest)
    lock = json.loads((ROOT / 'integration/contracts-version.json').read_text())['dev']
    if digest.lower() != lock['wheel_sha256'] or hashlib.sha256(node_source).hexdigest() != lock['node_sha256']:
        raise ValueError('DEV artifact does not match the tracked exact wheel/Node lock.')
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node is required to bootstrap the canonical DEV allocator.')
    # Execute the verified implementation itself; no bootstrap path validator is
    # duplicated here and no temporary source file is created before allocation.
    program = node_source.decode('utf-8') + '''
const bootstrapRoot=realpathSync(process.argv[2]);
const bootstrapContext=getArtifactContext({context:process.env.NETCIRCUIT_ARTIFACTS_CONTEXT?undefined:{owner:`git:${bootstrapRoot}`,roots:[bootstrapRoot]}});
const bootstrapSession=getArtifactDirectory('',{context:bootstrapContext});
console.log(JSON.stringify({session:bootstrapSession,context:bootstrapContext}));
'''
    result = subprocess.run([node, '--input-type=module', '-', str(repository_root)], input=program,
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Canonical DEV allocator bootstrap failed: ' + result.stderr.strip())
    allocated = json.loads(result.stdout)
    session = Path(allocated['session'])
    os.environ['NETCIRCUIT_ARTIFACTS_SESSION'] = str(session)
    os.environ['NETCIRCUIT_ARTIFACTS_CONTEXT'] = json.dumps(allocated['context'])
    runtime = session / 'dev-bootstrap'
    runtime.mkdir(exist_ok=True)
    archive = runtime / 'netcircuit_artifact_paths-1.0.0a1-py3-none-any.whl'
    archive.write_bytes(payload)
    log = runtime / 'install.log'
    with log.open('wb') as output:
        completed = subprocess.run([sys.executable, '-m', 'pip', 'install', '--force-reinstall', '--no-deps',
            '--cache-dir', str(runtime / 'pip-cache'), str(archive)], stdout=output, stderr=subprocess.STDOUT)
    if completed.returncode:
        raise RuntimeError('DEV wheel install failed: ' + log.read_text(errors='replace')[-16000:])
    materialize_allocator(cache_root)
    if os.environ.get('GITHUB_ENV'):
        with Path(os.environ['GITHUB_ENV']).open('a', encoding='utf-8') as output:
            output.write(f'NETCIRCUIT_ARTIFACTS_SESSION={session}\n')
            output.write(f'NETCIRCUIT_ARTIFACTS_CONTEXT={json.dumps(allocated["context"])}\n')
    print(f'Independent DEV allocator {DEV_VERSION} installed and verified; canonical cache materialized.')
    return allocated


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wheel')
    parser.add_argument('--sha256')
    parser.add_argument('--url')
    parser.add_argument('--manifest')
    parser.add_argument('--repository-root', type=Path, default=ROOT)
    parser.add_argument('--cache-root', type=Path)
    args = parser.parse_args()
    bootstrap(wheel=args.wheel, digest=args.sha256, url=args.url, manifest=args.manifest,
              repository_root=args.repository_root, cache_root=args.cache_root)
