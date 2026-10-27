"""Check the selected source release and installed logical Contracts authority."""
import argparse
from importlib.resources import files
import json
from jsonschema import Draft202012Validator, ValidationError

try:
    from scripts.fpga_artifact import source_product
    from scripts.contracts_artifact import installed_provenance
except ModuleNotFoundError:
    from fpga_artifact import source_product
    from contracts_artifact import installed_provenance


def check(root=None, manifest=None):
    product = source_product(root, manifest)
    provenance = installed_provenance()
    if provenance['version'] != '1.0.1': raise ValueError('FPGA consumer requires installed Contracts 1.0.1.')
    resources = files('contracts')
    schema = json.loads(resources.joinpath('fpga-protocol/control.schema.json').read_text(encoding='utf-8'))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    validator.validate({'protocol_version': '1.0-scaffold', 'sequence': 1, 'operation': 'SAFE_STATE'})
    example = json.loads(resources.joinpath('physical-lab/examples/v1-target-capabilities.json').read_text(encoding='utf-8'))
    if example['fpga_protocol_version'] != '2.0-scaffold' or example['available'] is not False:
        raise ValueError('B12 target example identity changed; review compatibility explicitly.')
    try: validator.validate({'protocol_version': example['fpga_protocol_version'], 'sequence': 1, 'operation': 'SAFE_STATE'})
    except ValidationError: pass
    else: raise ValueError('Illustrative 2.0-scaffold target became an executable logical protocol.')
    return {'version': product['identity']['version'], 'contractsVersion': provenance['version'],
        'logicalProtocolVersion': '1.0-scaffold', 'registerMapVersion': '1.0-reserved',
        'physicalAvailable': False, 'selectedSha256': product['sha256'],
        'sourceFingerprint': product['identity']['sourceFingerprint'], 'root': str(product['root']),
        'b12': 'illustrative-target-rejected'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root'); parser.add_argument('--manifest')
    args = parser.parse_args(argv)
    print(json.dumps(check(args.root, args.manifest), sort_keys=True))
    return 0


if __name__ == '__main__': raise SystemExit(main())
