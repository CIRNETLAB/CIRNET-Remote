"""Extract only an explicit digest-verified FPGA source release into owned output."""
import argparse
import json
import os
try:
    from scripts.environment import getenv, export_environment, append_environment
except ModuleNotFoundError:
    from environment import getenv, export_environment, append_environment

from pathlib import Path
from urllib.parse import urlparse

try:
    from scripts.artifact_download import download_artifact
    from scripts import fpga_artifact
except ModuleNotFoundError:
    from artifact_download import download_artifact
    import fpga_artifact


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument('--manifest'); source.add_argument('--archive'); source.add_argument('--url')
    parser.add_argument('--sha256'); parser.add_argument('--filename'); parser.add_argument('--github-env', type=Path)
    args = parser.parse_args(argv)
    if args.manifest is not None:
        if not args.manifest or args.sha256 is not None or args.filename is not None:
            parser.error('--manifest requires a path and cannot be combined with --sha256 or --filename.')
        archive, digest = fpga_artifact.selected_source_details(args.manifest)
    else:
        explicit = args.archive is not None or args.url is not None
        if explicit:
            if not (args.archive or args.url) or not args.sha256: parser.error('An explicit --archive/--url requires explicit --sha256.')
            if args.archive is not None and args.filename is not None: parser.error('--filename applies only to --url.')
        elif args.sha256 is not None or args.filename is not None:
            parser.error('--sha256/--filename require an explicit --archive/--url.')
        elif getenv('CIRNET_FPGA_ARTIFACT_MANIFEST'):
            archive, digest = fpga_artifact.selected_source_details()
        else:
            args.url = getenv('CIRNET_FPGA_ARTIFACT_URL')
            args.sha256 = getenv('CIRNET_FPGA_ARTIFACT_SHA256')
            args.filename = getenv('CIRNET_FPGA_ARTIFACT_FILENAME')
        if args.url is not None:
            if urlparse(args.url).scheme != 'https' or not args.sha256: parser.error('Select an explicit HTTPS URL and SHA256.')
            name = args.filename or Path(urlparse(args.url).path).name
            if name not in ('cirnet-fpga-scaffold-0.1.1.tar.gz', 'netcircuit-fpga-scaffold-0.1.1.tar.gz'): parser.error('Select the exact versioned FPGA source filename.')
            archive = fpga_artifact.artifact_directory('fpga-download') / name
            archive.write_bytes(download_artifact(args.url, args.sha256)); digest = args.sha256
        elif args.archive is not None:
            archive, digest = Path(args.archive), args.sha256
        elif not getenv('CIRNET_FPGA_ARTIFACT_MANIFEST'):
            parser.error('Select an explicit FPGA source manifest/archive/URL; no retained-source fallback is allowed.')
    product = fpga_artifact.extract_product(archive, digest)
    selected = product.parent / (product.name + '-manifest.json')
    selected.write_text(json.dumps({'schemaVersion': 1, 'source': {'path': str(archive), 'sha256': digest}}), encoding='utf-8')
    github_env = args.github_env or (Path(os.environ['GITHUB_ENV']) if os.environ.get('GITHUB_ENV') else None)
    if github_env:
        append_environment({'CIRNET_FPGA_ROOT': str(product), 'CIRNET_FPGA_ARTIFACT_MANIFEST': str(selected)}, github_env)
    print(json.dumps({'fpgaRoot': str(product), 'manifest': str(selected), 'sha256': digest}))
    return 0


if __name__ == '__main__': raise SystemExit(main())
