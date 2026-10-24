"""Export Remote route authority against the selected installed Contracts artifact."""
import argparse
from importlib.resources import files
import json
from pathlib import Path
import sys
from contracts.codegen.openapi import operation_bindings
try:
    from scripts.contract_exports import external_output, checked_destination
    from scripts.contracts_artifact import installed_provenance
except ModuleNotFoundError:
    from contract_exports import external_output, checked_destination
    from contracts_artifact import installed_provenance


def export(output=None, *, operations=None, check=False):
    sys.dont_write_bytecode = True
    from app.main import create_app
    document = create_app(schema_only=True).openapi()
    installed_provenance()
    if output is None:
        if not check:
            raise ValueError('Export requires an explicit external --output path.')
        output = Path(str(files('contracts').joinpath('api/openapi.json')))
    artifacts = {Path(output): json.dumps(document, indent=2, sort_keys=True) + '\n'}
    if operations is not None:
        artifacts[Path(operations)] = operation_bindings(document)
    destinations = {path: path if check else checked_destination(external_output(path.parent), path.name)
                    for path in artifacts}
    for path, value in artifacts.items():
        if check:
            if not path.is_file() or path.read_text(encoding='utf-8') != value:
                raise ValueError(f'Final artifact OpenAPI differs from Remote registrations: {path}')
        else:
            destination = destinations[path]
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(value, encoding='utf-8', newline='\n')
    return document


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--operations', type=Path)
    parser.add_argument('--check', action='store_true')
    arguments = parser.parse_args()
    export(arguments.output, operations=arguments.operations, check=arguments.check)
