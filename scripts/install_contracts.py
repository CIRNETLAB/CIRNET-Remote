"""Install only an explicitly selected, identity/digest-verified Contracts wheel."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse
try:
    from scripts.contracts_artifact import selected_wheel_details, verify_wheel, verify_selected_install
    from scripts.artifact_download import download_artifact
except ModuleNotFoundError:
    from contracts_artifact import selected_wheel_details, verify_wheel, verify_selected_install
    from artifact_download import download_artifact


def artifact_directory(*args, **kwargs):
    # DEV bootstrap must be usable before the allocator distribution exists.
    try:
        from scripts.artifact_paths import artifact_directory as allocate
    except ModuleNotFoundError:
        from artifact_paths import artifact_directory as allocate
    return allocate(*args, **kwargs)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--manifest')
    source.add_argument('--wheel')
    source.add_argument('--url')
    parser.add_argument('--sha256')
    parser.add_argument('--npm-url', default=os.environ.get('NETCIRCUIT_CONTRACTS_NPM_URL'))
    parser.add_argument('--npm-sha256', default=os.environ.get('NETCIRCUIT_CONTRACTS_NPM_SHA256'))
    parser.add_argument('--filename')
    parser.add_argument('--npm-filename', default=os.environ.get('NETCIRCUIT_CONTRACTS_NPM_FILENAME'))
    parser.add_argument('--dev-only', action='store_true', help='Bootstrap only independent DEV tooling; no runtime Contracts dependency.')
    parser.add_argument('--with-dev', action='store_true')
    parser.add_argument('--dev-wheel')
    parser.add_argument('--dev-sha256')
    parser.add_argument('--dev-url')
    args = parser.parse_args(argv)
    if args.dev_only or args.with_dev:
        try:
            from scripts.bootstrap_contract_tools import bootstrap
        except ModuleNotFoundError:
            from bootstrap_contract_tools import bootstrap
        bootstrap(wheel=args.dev_wheel, digest=args.dev_sha256, url=args.dev_url, manifest=args.manifest)
        if args.dev_only:
            return 0
    if args.manifest is not None:
        if not args.manifest or args.sha256 is not None or args.filename is not None:
            parser.error('--manifest cannot be combined with --sha256 or --filename.')
    elif args.wheel is not None or args.url is not None:
        if not (args.wheel or args.url) or not args.sha256:
            parser.error('Explicit --wheel or --url requires an explicit --sha256.')
        if args.wheel and args.filename is not None:
            parser.error('--filename applies only to --url.')
    else:
        if args.sha256 is not None or args.filename is not None:
            parser.error('--sha256 and --filename require --wheel or --url.')
        args.url = os.environ.get('NETCIRCUIT_CONTRACTS_WHEEL_URL')
        args.sha256 = os.environ.get('NETCIRCUIT_CONTRACTS_WHEEL_SHA256')
        args.filename = os.environ.get('NETCIRCUIT_CONTRACTS_WHEEL_FILENAME')
    if args.url and not args.wheel:
        if urlparse(args.url).scheme != 'https' or not args.sha256:
            parser.error('Artifact download requires an explicit HTTPS URL and SHA256.')
        directory = artifact_directory('contracts-download')
        name = args.filename or Path(urlparse(args.url).path).name
        if Path(name).name != name or '/' in name or '\\' in name or not name.endswith('.whl'):
            parser.error('Artifact URL must identify an exact wheel filename.')
        args.wheel = str(directory / name)
        Path(args.wheel).write_bytes(download_artifact(args.url, args.sha256))
    if bool(args.wheel) != bool(args.sha256):
        parser.error('--wheel and --sha256 must be supplied together.')
    if args.wheel:
        wheel, digest = verify_wheel(args.wheel, args.sha256), args.sha256.lower()
    else:
        wheel, digest = selected_wheel_details(args.manifest)
    cache = str(artifact_directory('pip-cache'))
    temporary = str(artifact_directory('contracts-install-temp'))
    environment = {**os.environ, 'TMP': temporary, 'TEMP': temporary, 'TMPDIR': temporary, 'PIP_CACHE_DIR': cache}
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--cache-dir', cache, str(wheel) + '[rpc]'], check=True, env=environment)
    # Pip otherwise skips an explicitly selected candidate with the same public
    # version. Resolve dependencies first, then replace only this distribution.
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--force-reinstall', '--no-deps',
                    '--cache-dir', cache, str(wheel)], check=True, env=environment)
    verify_selected_install(wheel, digest, python=sys.executable)
    # Consumer metadata may still pin the previous Contracts version here.
    # CI and release gates run global pip check after all consumers are updated.
    # The same verified wheel is available to later installed-package checks.
    if args.wheel:
        manifest = artifact_directory('contracts-download') / 'artifacts.json'
        manifest_value = {'schemaVersion': 1, 'python': {'path': str(wheel), 'sha256': args.sha256}}
        if args.npm_url:
            if urlparse(args.npm_url).scheme != 'https' or not args.npm_sha256:
                parser.error('npm download requires an explicit HTTPS URL and SHA256.')
            npm_name = args.npm_filename or Path(urlparse(args.npm_url).path).name
            if Path(npm_name).name != npm_name or '/' in npm_name or '\\' in npm_name or not npm_name.endswith('.tgz'):
                parser.error('npm URL must identify an exact tarball filename.')
            contents = download_artifact(args.npm_url, args.npm_sha256)
            if hashlib.sha256(contents).hexdigest() != args.npm_sha256.lower():
                raise ValueError('npm artifact SHA256 does not match the selected manifest.')
            npm_path = manifest.parent / npm_name
            npm_path.write_bytes(contents)
            manifest_value['npm'] = {'path': str(npm_path), 'sha256': args.npm_sha256}
        manifest.write_text(json.dumps(manifest_value), encoding='utf-8')
        if os.environ.get('GITHUB_ENV'):
            with Path(os.environ['GITHUB_ENV']).open('a', encoding='utf-8') as output:
                output.write(f'NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST={manifest}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
