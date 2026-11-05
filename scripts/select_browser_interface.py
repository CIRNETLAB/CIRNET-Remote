"""Export the exact Interface candidate for branch and PR browser CI."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
from tempfile import TemporaryDirectory

from scripts.artifact_paths import artifact_directory
from scripts.environment import append_environment
from scripts.system_release_manifest import repository_urls

REPOSITORY = repository_urls('Interface')[0] + '.git'


def export_candidate(revision, directory, *, repository=REPOSITORY):
    if not isinstance(revision, str) or not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('The Interface candidate must identify an exact commit SHA.')

    environment = {**os.environ, 'GIT_TERMINAL_PROMPT': '0'}
    with TemporaryDirectory(prefix='fetch-', dir=directory) as temporary:
        scratch = Path(temporary)

        def git(*args):
            command = ['git', '-c', 'core.longpaths=true', '-C', str(scratch), *args]
            return subprocess.check_output(command, env=environment, text=True).strip()

        git('init', '--quiet')
        git('fetch', '--quiet', '--no-tags', '--no-recurse-submodules', '--depth=1', repository, revision)
        if git('rev-parse', 'FETCH_HEAD^{commit}') != revision:
            raise ValueError('The fetched Interface candidate differs from the selected commit.')
        tree = git('rev-parse', 'FETCH_HEAD^{tree}')
        archive = scratch / 'source.tar'
        git('archive', '--format=tar', f'--output={archive}', revision)
        product = directory / 'source'
        with tarfile.open(archive) as exported:
            members = exported.getmembers()
            if any(not member.isfile() and not member.isdir() for member in members):
                raise ValueError('The Interface candidate contains an alias or special file.')
            product.mkdir()
            exported.extractall(product, members=members, filter='data')

    return {'repository': repository, 'sourceRevision': revision, 'sourceTree': tree, 'path': str(product)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lock', type=Path, required=True)
    parser.add_argument('--github-env', type=Path, required=True)
    args = parser.parse_args(argv)
    lock = json.loads(args.lock.read_text(encoding='utf-8'))
    receipt = export_candidate(lock['sourceRevision'], artifact_directory('browser-interface-candidate'))
    append_environment({'CIRNET_INTERFACE_ROOT': receipt['path']}, args.github_env)
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
