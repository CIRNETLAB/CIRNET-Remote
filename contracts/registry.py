"""Manifest-backed JSON Schema 2020-12 registry. Never fetch schema over a network.

The manifest assigns absolute document identities without editing historical
relative IDs. Shape validation is independent from named semantic profiles.
"""
from copy import deepcopy
from functools import lru_cache
import json
from math import isfinite
from pathlib import Path
from urllib.parse import urldefrag, urljoin

from jsonschema import Draft202012Validator, ValidationError, validators
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).resolve().parent
DIALECT = 'https://json-schema.org/draft/2020-12/schema'
# Explicit vocabulary is a toolchain guard, not a second schema interpreter.
KEYWORDS = frozenset('''$schema $id $ref $defs $anchor $dynamicRef $dynamicAnchor
    $comment title description default examples deprecated readOnly writeOnly
    type enum const multipleOf maximum exclusiveMaximum minimum exclusiveMinimum
    maxLength minLength pattern format contentEncoding contentMediaType contentSchema
    items prefixItems contains minContains maxContains maxItems minItems uniqueItems
    properties patternProperties additionalProperties required propertyNames
    minProperties maxProperties dependentRequired dependentSchemas unevaluatedProperties
    unevaluatedItems allOf anyOf oneOf not if then else'''.split())
MAP_SCHEMAS = ('$defs', 'properties', 'patternProperties', 'dependentSchemas')
ARRAY_SCHEMAS = ('allOf', 'anyOf', 'oneOf', 'prefixItems')
SINGLE_SCHEMAS = ('items', 'contains', 'additionalProperties', 'propertyNames', 'not',
                  'if', 'then', 'else', 'unevaluatedProperties', 'unevaluatedItems', 'contentSchema')


@lru_cache
def entries():
    return json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['contracts']


@lru_cache
def _documents():
    documents = {}
    for entry in entries():
        if entry['kind'] != 'schema' or entry['uri'] in documents:
            continue
        path = ROOT.parent / entry['path']
        value = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(value, dict):
            value['$id'] = entry['uri']
        documents[entry['uri']] = value
    return documents


def load_schema(uri):
    """Return a detached canonical document or fragment by its absolute URI."""
    document, pointer = urldefrag(uri)
    value = deepcopy(_documents()[document])
    if pointer:
        for part in pointer.removeprefix('/').split('/'):
            value = value[part.replace('~1', '/').replace('~0', '~')]
    return value


@lru_cache
def offline_registry(profile='structural'):
    result = Registry()
    for uri, original in _documents().items():
        value = deepcopy(original)
        if profile != 'structural':
            from contracts.semantic_profiles import profile_schema
            value = profile_schema('', value, profile)
        result = result.with_resource(uri, Resource.from_contents(value, default_specification=DRAFT202012))
    return result


def _number(checker, value):
    # Do not convert arbitrary precision legacy integer fields to float.
    return type(value) is int or type(value) is float and isfinite(value)


_validator = validators.extend(Draft202012Validator,
    type_checker=Draft202012Validator.TYPE_CHECKER.redefine('number', _number))


def structural_validator(schema, *, profile='structural'):
    return _validator(schema, registry=offline_registry(profile))


def check_schema(schema, *, base_uri='https://netcircuit.local/check.schema.json'):
    """Fail generation on unsupported vocabulary or any unresolved offline ref."""
    Draft202012Validator.check_schema(schema)
    resources = offline_registry().with_resource(base_uri, Resource.from_contents(
        {'$schema': DIALECT, **schema} if isinstance(schema, dict) else schema,
        default_specification=DRAFT202012))

    def visit(node, base):
        if isinstance(node, bool):
            return
        unknown = set(node) - KEYWORDS
        if unknown:
            raise ValueError(f'Unsupported schema keyword: {sorted(unknown)}')
        base = urljoin(base, node.get('$id', ''))
        for key in ('$ref', '$dynamicRef'):
            if key in node:
                try:
                    resources.resolver(base).lookup(node[key])
                except Exception as exc:
                    raise ValueError(f'Unresolved offline reference {node[key]} from {base}') from exc
        for key in MAP_SCHEMAS:
            for child in node.get(key, {}).values():
                visit(child, base)
        for key in ARRAY_SCHEMAS:
            for child in node.get(key, []):
                visit(child, base)
        for key in SINGLE_SCHEMAS:
            if key in node:
                visit(node[key], base)
    visit(schema, base_uri)


def check_manifest():
    required={'id','kind','path','uri','pointer','version','visibility','producer','consumers',
              'validator_profile','generated_artifacts','compatibility_policy'}
    uri_paths={}
    for entry in entries():
        if required-set(entry):
            raise ValueError(f'Manifest entry missing fields: {sorted(required-set(entry))}')
        if entry['kind'] not in {'schema','protobuf','binary','data'}:
            raise ValueError(f'Unknown contract kind: {entry["kind"]}')
        if entry['visibility'] not in {'public','internal'}:
            raise ValueError(f'Unknown contract visibility: {entry["visibility"]}')
        if not entry['producer'] or not entry['consumers'] or not entry['compatibility_policy'] or not entry['version']:
            raise ValueError(f'Incomplete contract ownership/version policy: {entry["id"]}')
        if entry['kind']=='schema':
            previous=uri_paths.setdefault(entry['uri'],entry['path'])
            if previous!=entry['path']:
                raise ValueError(f'Contract URI maps to different source paths: {entry["uri"]}')
    names = [entry['id'] for entry in entries()]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate contract identity')
    paths = {entry['path'] for entry in entries()}
    # New versioned families must not need a second allowlist edit to enter CI.
    # Compatibility snapshots, fixtures and generated projections are not sources.
    canonical={f'contracts/{path.relative_to(ROOT).as_posix()}' for path in ROOT.rglob('*.schema.json')
               if path.relative_to(ROOT).parts[0] not in {'compatibility','fixtures','generated','boundary'}}
    if canonical - paths:
        raise ValueError(f'Unmanifested schemas: {sorted(canonical - paths)}')
    for entry in entries():
        if not (ROOT.parent / entry['path']).is_file():
            raise ValueError(f'Missing manifest resource: {entry["path"]}')
        if entry['kind'] == 'schema':
            load_schema(entry['uri'] + ('#' + entry['pointer'] if entry['pointer'] else ''))
    for uri, schema in _documents().items():
        check_schema(schema, base_uri=uri)


def validate_contract(name, value, profile='structural'):
    entry = next((entry for entry in entries() if entry['id'] == name and entry['kind'] == 'schema'), None)
    if entry is None:
        raise ValueError(f'Unknown contract {name}')
    uri = entry['uri'] + ('#' + entry['pointer'] if entry['pointer'] else '')
    rule = {'$ref': uri}
    # Keep the complete registered document as the reference base. Assigning its
    # identity to an extracted $defs fragment would shadow sibling definitions.
    from contracts.semantic_profiles import validate_semantics, validation_issues
    try:
        structural_validator(rule, profile=profile).validate(value)
        validate_semantics(name, value, profile)
    except ValidationError as error:
        error.issues = validation_issues(error, profile)
        raise
    return deepcopy(value)


def schema_bundle(*, public_only=False, profile='structural', ref_prefix='#/$defs/'):
    """Relocate known schema identities into one offline generator input.

    Relocation changes references only; constraints stay with their source. A
    reference without a manifest identity fails instead of becoming an open DTO.
    """
    selected = [entry for entry in entries() if entry['kind'] == 'schema'
                and (not public_only or entry['visibility'] == 'public')]
    identities=[entry for entry in entries() if entry['kind']=='schema']

    def reference_target(uri):
        document,pointer=urldefrag(uri)
        matches=[entry for entry in identities if entry['uri']==document and (
            pointer==entry['pointer'] or pointer.startswith(entry['pointer']+'/'))]
        if not matches: raise ValueError(f'Unmanifested or private generator reference: {uri}')
        # Respect the closest identity, including an explicitly private child.
        entry=max(matches,key=lambda candidate:len(candidate['pointer']))
        if public_only and entry['visibility']!='public':
            raise ValueError(f'Unmanifested or private generator reference: {uri}')
        suffix=pointer[len(entry['pointer']):]
        if '/$defs/' in suffix:
            raise ValueError(f'Unmanifested nested definition in generator reference: {uri}')
        try: target=load_schema(uri)
        except (KeyError,IndexError,TypeError) as error:
            raise ValueError(f'Unresolved generator reference: {uri}') from error
        if not isinstance(target,(dict,bool)):
            raise ValueError(f'Generator reference must address a schema: {uri}')
        return ref_prefix+entry['id']+suffix

    def relocate(value, base):
        if isinstance(value, bool):
            return value
        base=urljoin(base,value.get('$id',''))
        result=deepcopy(value)
        for key in ('$id','$schema','$defs'):
            result.pop(key,None)
        if '$dynamicRef' in value:
            raise ValueError('Code generation does not support $dynamicRef relocation; runtime validation supports it')
        if '$ref' in value:
            uri=urljoin(base,value['$ref'])
            result['$ref']=reference_target(uri)
        # Traverse schema positions only. A property named $id or a default
        # value containing schema-like keys is ordinary data and stays intact.
        for key in MAP_SCHEMAS:
            if key!='$defs' and key in value:
                result[key]={name:relocate(child,base) for name,child in value[key].items()}
        for key in ARRAY_SCHEMAS:
            if key in value:
                result[key]=[relocate(child,base) for child in value[key]]
        for key in SINGLE_SCHEMAS:
            if key in value:
                result[key]=relocate(value[key],base)
        return result

    definitions = {}
    for entry in selected:
        value = load_schema(entry['uri'] + ('#' + entry['pointer'] if entry['pointer'] else ''))
        if isinstance(value,dict):
            value.pop('title', None)
        if profile != 'structural':
            from contracts.semantic_profiles import profile_schema
            value = profile_schema(entry['id'], value, profile)
        definitions[entry['id']] = relocate(value, entry['uri'])
    return {'$schema':DIALECT, '$id':'https://netcircuit.local/contracts/generated/' + profile,
            '$defs':definitions, 'type':'object',
            'properties':{name:{'$ref':ref_prefix+name} for name in definitions},
            'required':list(definitions), 'additionalProperties':False}
