"""Export route-authoritative OpenAPI without creating a database or hardware client."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]


def operation_bindings(document):
    """Generate typed operation metadata from registered OpenAPI operations.

    DTO shapes stay in the schema generator. This adapter only handles operation
    references and parameter primitives, and rejects anonymous body DTOs.
    """
    canonical={name for name,schema in document['components']['schemas'].items()
               if isinstance(schema,dict) and 'x-netcircuit-contract' in schema}

    def contract(schema):
        reference=schema.get('$ref','')
        prefix='#/components/schemas/'
        if not reference.startswith(prefix):
            raise ValueError(f'Operation DTO must use a named canonical schema: {schema}')
        name=reference[len(prefix):]
        for suffix in ('-Input','-Output'):
            if name.endswith(suffix): name=name[:-len(suffix)]
        if name not in canonical:
            raise ValueError(f'Operation references a noncanonical DTO: {name}')
        return name

    def type_name(schema):
        if '$ref' in schema: return 'DTO.'+contract(schema)
        if 'enum' in schema: return ' | '.join(json.dumps(value) for value in schema['enum'])
        if 'const' in schema: return json.dumps(schema['const'])
        for composition in ('anyOf','oneOf'):
            if composition in schema: return ' | '.join(type_name(value) for value in schema[composition])
        kind=schema.get('type')
        if kind=='array': return 'Array<'+type_name(schema['items'])+'>'
        if kind=='string' and schema.get('format')=='binary': return 'ArrayBuffer'
        if kind in ('string','boolean','null'): return kind
        if kind in ('integer','number'): return 'number'
        raise ValueError(f'Unsupported anonymous operation schema: {schema}')

    def parameter_type(parameters,location):
        fields=[json.dumps(parameter['name'])+('' if parameter.get('required') else '?')+': '+type_name(parameter['schema'])
                for parameter in parameters if parameter['in']==location]
        return '{ '+'; '.join(fields)+' }' if fields else 'Record<string, never>'

    records={}
    declarations=[]
    for path,methods in sorted(document['paths'].items()):
        if not path.startswith('/api/'): continue
        for method,operation in sorted(methods.items()):
            if method not in ('get','post','put','patch','delete','head','options'): continue
            name=operation['operationId']
            if name in records: raise ValueError(f'Duplicate OpenAPI operation id {name}')
            body=operation.get('requestBody',{})
            if body:
                content=body.get('content',{})
                if set(content)!={'application/json'}:
                    raise ValueError(f'Unsupported request media for {name}: {list(content)}')
                request_schema=content['application/json']['schema']
                request_contract=contract(request_schema)
                request_type='DTO.'+request_contract
            else:
                request_contract=None; request_type='undefined'
            successes={status:response for status,response in operation['responses'].items() if status.startswith('2')}
            if not successes: raise ValueError(f'No success response for {name}')
            success_types=[]; media=[]; response_contracts=[]; arrays=[]; binary=False
            for status,response in successes.items():
                content=response.get('content',{})
                if not content:
                    if status not in ('204','205'): raise ValueError(f'Undocumented success response for {name}')
                    success_types.append('undefined'); response_contracts.append(None); arrays.append(False)
                for media_type,description in content.items():
                    schema=description['schema']; media.append(media_type)
                    success_types.append(type_name(schema))
                    is_binary=schema.get('format')=='binary'
                    binary=binary or is_binary
                    array=schema.get('type')=='array'
                    response_contracts.append(None if is_binary else contract(schema['items'] if array else schema))
                    arrays.append(array)
            if len(set(response_contracts))!=1 or len(set(arrays))!=1:
                raise ValueError(f'Operation {name} has incompatible success DTOs; use explicit operation variants')
            parameters=[*methods.get('parameters',[]),*operation.get('parameters',[])]
            errors=[]
            response_bindings={}
            for status,response in operation['responses'].items():
                bindings={}
                for media_type,description in response.get('content',{}).items():
                    schema=description['schema']
                    array=schema.get('type')=='array'
                    is_binary=schema.get('format')=='binary'
                    bindings[media_type]={'contract':None if is_binary else contract(schema['items'] if array else schema),
                                          'array':array,'binary':is_binary}
                response_bindings[status]=bindings
            for status,response in operation['responses'].items():
                if status.startswith('2'): continue
                errors.extend(type_name(value['schema']) for value in response.get('content',{}).values())
            if not errors: raise ValueError(f'Operation {name} has no documented error DTO')
            declarations.append(json.dumps(name)+': { request: '+request_type+'; response: '+' | '.join(dict.fromkeys(success_types))
                +'; path: '+parameter_type(parameters,'path')+'; query: '+parameter_type(parameters,'query')
                +'; headers: '+parameter_type(parameters,'header')+'; error: '+' | '.join(dict.fromkeys(errors))+' }')
            records[name]={'method':method.upper(),'path':path,'requestContract':request_contract,
                           'requestBodyRequired':body.get('required',False),'responseContract':response_contracts[0],
                           'responseArray':arrays[0],'responseMedia':list(dict.fromkeys(media)),
                           'successStatuses':[int(status) for status in successes],'binary':binary,
                           'responses':response_bindings}
    return '// Generated by scripts/export_openapi.py from FastAPI registrations; edit routes/canonical schemas.\n'+\
           "import type * as DTO from './dto'\nexport interface ApiOperations {\n"+\
           '\n'.join('  '+declaration for declaration in declarations)+'\n}\n'+\
           'export const apiOperations = '+json.dumps(records,indent=2)+' as const\n'+\
           'export type OperationName = keyof ApiOperations\n'


def export(output, *, operations=None, models=None, check=False):
    # Staged model imports must not become nondeterministic generated artifacts.
    sys.dont_write_bytecode=True
    sys.path.insert(0,str(ROOT))
    if models is not None:
        import contracts.boundary
        spec=importlib.util.spec_from_file_location('contracts.boundary.models',models)
        module=importlib.util.module_from_spec(spec)
        sys.modules[spec.name]=module
        spec.loader.exec_module(module)
    sys.path.insert(0,str(ROOT/'services/api'))
    from app.main import create_app
    document=create_app(schema_only=True).openapi()
    artifacts={Path(output):json.dumps(document,indent=2,sort_keys=True)+'\n'}
    if operations is not None: artifacts[Path(operations)]=operation_bindings(document)
    for path,value in artifacts.items():
        if check:
            if not path.exists() or path.read_text(encoding='utf-8')!=value:
                raise SystemExit(f'Stale OpenAPI artifact: {path}')
        else:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(value,encoding='utf-8',newline='\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'contracts/api/openapi.json')
    parser.add_argument('--operations',type=Path,default=ROOT/'apps/web/src/contracts/generated/operations.ts')
    parser.add_argument('--models',type=Path)
    parser.add_argument('--check',action='store_true')
    arguments=parser.parse_args()
    export(arguments.output,operations=arguments.operations,models=arguments.models,check=arguments.check)
