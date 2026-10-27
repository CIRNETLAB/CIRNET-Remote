"""Install only an explicitly selected, identity/digest-verified Simulator wheel."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlparse

try:
    from scripts.simulator_artifact import selected_wheel_details, verify_wheel, verify_selected_install
    from scripts.artifact_download import download_artifact
    from scripts.artifact_paths import artifact_directory
except ModuleNotFoundError:
    from simulator_artifact import selected_wheel_details, verify_wheel, verify_selected_install
    from artifact_download import download_artifact
    from artifact_paths import artifact_directory


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--manifest')
    source.add_argument('--wheel')
    source.add_argument('--url')
    parser.add_argument('--sha256')
    parser.add_argument('--filename')
    args = parser.parse_args(argv)
    # CLI selection is complete and authoritative. Inherited CI URL/hash/name
    # values must never replace a local manifest or complete a partial selector.
    if args.manifest is not None:
        if not args.manifest or args.sha256 is not None or args.filename is not None:
            parser.error('--manifest must name a manifest and cannot be combined with --sha256 or --filename.')
    elif args.wheel is not None or args.url is not None:
        if not (args.wheel or args.url) or not args.sha256:
            parser.error('Explicit --wheel or --url requires an explicit --sha256.')
        if args.wheel and args.filename is not None:
            parser.error('--filename applies only to --url.')
    else:
        if args.sha256 is not None or args.filename is not None:
            parser.error('--sha256 and --filename require an explicit --wheel or --url selector.')
        args.url = os.environ.get('NETCIRCUIT_SIMULATOR_WHEEL_URL')
        args.sha256 = os.environ.get('NETCIRCUIT_SIMULATOR_WHEEL_SHA256')
        args.filename = os.environ.get('NETCIRCUIT_SIMULATOR_WHEEL_FILENAME')
    if args.url and not args.wheel:
        if urlparse(args.url).scheme != 'https' or not args.sha256:
            parser.error('Artifact download requires an explicit HTTPS URL and SHA256.')
        name = args.filename or Path(urlparse(args.url).path).name
        if Path(name).name != name or '/' in name or '\\' in name or not name.endswith('.whl'):
            parser.error('Artifact URL must identify an exact wheel filename.')
        destination = artifact_directory('simulator-download') / name
        destination.write_bytes(download_artifact(args.url, args.sha256))
        args.wheel = str(destination)
    if bool(args.wheel) != bool(args.sha256):
        parser.error('--wheel and --sha256 must be supplied together.')
    if args.wheel:
        wheel, digest = verify_wheel(args.wheel, args.sha256), args.sha256.lower()
    else:
        wheel, digest = selected_wheel_details(args.manifest)
    cache = str(artifact_directory('pip-cache'))
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--cache-dir', cache, str(wheel)], check=True)
    # The selected digest remains authoritative even for a same-version candidate.
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--force-reinstall', '--no-deps',
        '--cache-dir', cache, str(wheel)], check=True)
    verify_selected_install(wheel, digest, python=sys.executable)
    manifest = artifact_directory('simulator-download') / 'artifacts.json'
    manifest.write_text(json.dumps({'schemaVersion': 1, 'python': {'path': str(wheel), 'sha256': digest}}), encoding='utf-8')
    if os.environ.get('GITHUB_ENV'):
        with Path(os.environ['GITHUB_ENV']).open('a', encoding='utf-8') as output:
            output.write(f'NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST={manifest}\n')
    print(f'Installed netcircuit-simulator==0.2.0 from selected SHA256 {digest}; manifest: {manifest}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
