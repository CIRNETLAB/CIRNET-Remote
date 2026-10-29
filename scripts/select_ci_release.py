"""Bind CI bootstrap and consumer dependencies to the committed system lock."""
import sys
sys.dont_write_bytecode = True

import argparse
from pathlib import Path
try:
    from scripts.system_release_manifest import ci_environment, load_manifest
except ModuleNotFoundError:
    from system_release_manifest import ci_environment, load_manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--github-env', required=True, type=Path)
    arguments = parser.parse_args(argv)
    environment = ci_environment(load_manifest(arguments.manifest))
    with arguments.github_env.open('a', encoding='utf-8') as output:
        for key, value in sorted(environment.items()):
            output.write(key + '=' + value + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
