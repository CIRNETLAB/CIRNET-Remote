"""Generate Python boundary models from the manifest's canonical JSON Schemas.

datamodel-code-generator owns shape generation. The AST adapter only preserves
JSON numeric integers (including historical values beyond float range), attaches
canonical validation identities, and removes environment-dependent headers.
"""
import argparse
import ast
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]


def bundle():
    """Use the shared schema-aware relocation without interpreting literal data."""
    from contracts.registry import check_manifest, entries, schema_bundle
    check_manifest()
    source = schema_bundle(public_only=False)
    source['title'] = 'ContractBoundaries'
    for name, definition in source['$defs'].items():
        if isinstance(definition, bool):
            raise ValueError(f'Cannot generate Python DTO {name} from a named boolean schema; '
                             'use an object/value boundary schema or a runtime-only contract entry. '
                             'Nested boolean schemas remain supported by runtime validation.')
        definition['title'] = name
    profiles = {entry['id']: entry.get('validator_profile', 'structural')
                for entry in entries() if entry['kind'] == 'schema'}
    return source, profiles


class BoundaryAdapter(ast.NodeTransformer):
    def __init__(self, profiles):
        self.profiles = profiles

    def visit_AnnAssign(self, node):
        class NumericAdapter(ast.NodeTransformer):
            def visit_Name(self, annotation):
                if annotation.id in ('int', 'float', 'StrictInt', 'StrictFloat'):
                    strict = annotation.id.startswith('Strict')
                    return ast.BinOp(left=ast.Name(id='StrictInt' if strict else 'int', ctx=ast.Load()),
                                     op=ast.BitOr(), right=ast.Name(id='StrictFloat' if strict else 'float', ctx=ast.Load()))
                return annotation

            def visit_Subscript(self, annotation):
                if isinstance(annotation.value, ast.Name) and annotation.value.id == 'Literal':
                    constants = annotation.slice.elts if isinstance(annotation.slice, ast.Tuple) else [annotation.slice]
                    literals = tuple(ast.literal_eval(value) for value in constants)
                    if any(type(value) is int for value in literals):
                        return ast.parse(f'Annotated[{ast.unparse(annotation)} | StrictFloat, WrapValidator(preserve_json_literal({literals!r}))]', mode='eval').body
                return self.generic_visit(annotation)
        node.annotation = NumericAdapter().visit(node.annotation)
        return node

    def visit_ClassDef(self, node):
        self.generic_visit(node)
        for base in node.bases:
            if isinstance(base, ast.Subscript) and isinstance(base.value, ast.Name) and base.value.id == 'RootModel':
                base.value.id = 'ContractRootBoundary'
        if node.name in self.profiles:
            node.body.insert(0, ast.AnnAssign(target=ast.Name(id='__contract_id__', ctx=ast.Store()),
                annotation=ast.Subscript(value=ast.Name(id='ClassVar', ctx=ast.Load()), slice=ast.Name(id='str', ctx=ast.Load()), ctx=ast.Load()),
                value=ast.Constant(value=node.name), simple=1))
            node.body.insert(1, ast.AnnAssign(target=ast.Name(id='__validation_profile__', ctx=ast.Store()),
                annotation=ast.Subscript(value=ast.Name(id='ClassVar', ctx=ast.Load()), slice=ast.Name(id='str', ctx=ast.Load()), ctx=ast.Load()),
                value=ast.Constant(value=self.profiles[node.name]), simple=1))
        return node


def generate(output):
    source, profiles = bundle()
    names = set(profiles)
    staging_root = ROOT / '.build' / 'python-contracts'
    staging_root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix='generate-', dir=staging_root) as directory:
        directory = Path(directory)
        schema_path = directory / 'contracts.json'
        generated_path = directory / 'models.py'
        schema_path.write_text(json.dumps(source, indent=2) + '\n', encoding='utf-8')
        command = [sys.executable, '-m', 'datamodel_code_generator', '--input', str(schema_path),
                   '--input-file-type', 'jsonschema', '--output', str(generated_path),
                   '--output-model-type', 'pydantic_v2.BaseModel', '--target-python-version', '3.11',
                   '--base-class', 'contracts.boundary.base.ContractBoundary', '--disable-timestamp',
                   '--use-union-operator', '--use-standard-collections', '--use-title-as-name',
                   '--field-constraints', '--enum-field-as-literal', 'all', '--strict-refs',
                   '--no-allow-remote-refs', '--ignore-pyproject', '--formatters', 'builtin',
                   '--strict-types', 'str', 'int', 'float', 'bool']
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        tree = ast.parse(generated_path.read_text(encoding='utf-8'))
        found = {node.name for node in tree.body if isinstance(node, ast.ClassDef)}
        if names - found:
            raise RuntimeError(f'Codegen did not produce canonical models: {sorted(names-found)}')
        tree.body = [node for node in tree.body if not isinstance(node, ast.ClassDef) or node.name != 'ContractBoundaries']
        tree = BoundaryAdapter(profiles).visit(tree)
        # ClassVar/StrictInt can be introduced by the two narrow AST adaptations.
        insert_at = next((index for index, node in enumerate(tree.body) if not isinstance(node, (ast.Import, ast.ImportFrom))), len(tree.body))
        tree.body[insert_at:insert_at] = [ast.ImportFrom(module='contracts.boundary.base', names=[ast.alias(name='ContractRootBoundary'), ast.alias(name='preserve_json_literal')], level=0),
                                        ast.ImportFrom(module='typing', names=[ast.alias(name='Annotated'), ast.alias(name='ClassVar')], level=0),
                                        ast.ImportFrom(module='pydantic', names=[ast.alias(name='StrictInt'), ast.alias(name='StrictFloat'), ast.alias(name='WrapValidator')], level=0)]
        ast.fix_missing_locations(tree)
        text = '# Generated by scripts/generate_python_contracts.py; edit canonical schemas.\n' + ast.unparse(tree) + '\n'
        compile(text, '<canonical-boundaries>', 'exec')
        output = Path(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    sys.path.insert(0, str(ROOT))
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'contracts/boundary/models.py')
    generate(parser.parse_args().output)
