"""Conservative public wire anchors, not a general JSON Schema subtype prover."""
from copy import deepcopy
import json

from .registry import MAP_SCHEMAS,ARRAY_SCHEMAS,SINGLE_SCHEMAS

METHODS=frozenset(('get','post','put','patch','delete','head','options','trace'))
ANNOTATIONS=frozenset(('$comment','title','description','examples'))
OPENAPI_31_DIALECT='https://spec.openapis.org/oas/3.1/dialect/base'


class CompatibilityError(ValueError):
    pass


def _object(value,where):
    if not isinstance(value,dict):raise CompatibilityError('Unsupported compatibility shape: '+where)
    return value


def _keys(value,allowed,where):
    if set(value)-set(allowed):raise CompatibilityError('Unsupported compatibility fields: '+where)


def _schema(value):
    if isinstance(value,bool):return value
    value=_object(value,'JSON Schema')
    result={name:deepcopy(child) for name,child in value.items() if name not in ANNOTATIONS}
    # Schema positions only: a property/default named description is real data.
    for key in MAP_SCHEMAS:
        if key in value:result[key]={name:_schema(child) for name,child in _object(value[key],key).items()}
    for key in ARRAY_SCHEMAS:
        if key in value:
            if not isinstance(value[key],list):raise CompatibilityError('Unsupported schema array: '+key)
            result[key]=[_schema(child) for child in value[key]]
    for key in SINGLE_SCHEMAS:
        if key in value:result[key]=_schema(value[key])
    return result


def _content(value):
    result={}
    for media_type,media in _object(value,'content').items():
        media=_object(media,'media type');_keys(media,('schema','example','examples'),'media type')
        if 'schema' not in media:raise CompatibilityError('Missing media schema: '+media_type)
        result[media_type]={'schema':_schema(media['schema'])}
    return result


def _parameter(value,*,header=False):
    value=_object(value,'parameter')
    _keys(value,('name','in','required','schema','description','deprecated','style','explode','allowReserved','allowEmptyValue','example','examples','content'),'parameter')
    result={name:deepcopy(child) for name,child in value.items() if name not in ('description','example','examples')}
    if not header and (not isinstance(value.get('name'),str) or value.get('in') not in ('path','query','header','cookie')):
        raise CompatibilityError('Unsupported parameter identity')
    if 'schema' in value:result['schema']=_schema(value['schema'])
    elif 'content' not in value:raise CompatibilityError('Missing parameter schema')
    if 'content' in value:result['content']=_content(value['content'])
    result['required']=value.get('required',False)
    return result


def _security(value):
    if not isinstance(value,list):raise CompatibilityError('Unsupported security requirements')
    for requirement in value:
        for name,scopes in _object(requirement,'security requirement').items():
            if not isinstance(name,str) or not name or not isinstance(scopes,list) or any(not isinstance(scope,str) for scope in scopes):
                raise CompatibilityError('Unsupported security requirement')
    return deepcopy(value)


def snapshot(openapi,layout):
    """Capture current shapes without ownership prose, timestamps or runtime IO."""
    openapi=_object(openapi,'OpenAPI');operations={}
    global_security=_security(openapi.get('security',[]))
    dialect=openapi.get('jsonSchemaDialect',OPENAPI_31_DIALECT)
    if not isinstance(dialect,str) or not dialect:raise CompatibilityError('Unsupported JSON Schema dialect')
    for path,item in _object(openapi.get('paths'),'paths').items():
        item=_object(item,'path item');_keys(item,METHODS,'path item')
        for method,operation in item.items():
            operation=_object(operation,'operation')
            _keys(operation,('operationId','parameters','requestBody','responses','security','summary','description','tags','deprecated','externalDocs'),'operation')
            identity=operation.get('operationId')
            if not isinstance(identity,str) or not identity or identity in operations:raise CompatibilityError('Missing or duplicate operation identity')
            parameters=operation.get('parameters',[])
            if not isinstance(parameters,list):raise CompatibilityError('Unsupported operation parameters')
            value={'path':path,'method':method,'parameters':sorted((_parameter(parameter) for parameter in parameters),key=lambda child:(child['in'],child['name'])),
                   'security':_security(operation.get('security',global_security)),'responses':{}}
            if 'deprecated' in operation:value['deprecated']=operation['deprecated']
            if 'requestBody' in operation:
                body=_object(operation['requestBody'],'request body');_keys(body,('required','content','description'),'request body')
                value['request']={'required':body.get('required',False),'content':_content(body.get('content',{}))}
            for status,response in _object(operation.get('responses'),'responses').items():
                response=_object(response,'response');_keys(response,('description','content','headers'),'response')
                value['responses'][status]={'content':_content(response.get('content',{})),
                    'headers':{name:_parameter(header,header=True) for name,header in _object(response.get('headers',{}),'response headers').items()}}
            operations[identity]=value
    components=_object(openapi.get('components'),'components')
    schemes={name:{key:deepcopy(value) for key,value in _object(scheme,'security scheme').items() if key!='description'}
             for name,scheme in _object(components.get('securitySchemes',{}),'security schemes').items()}
    return {'schema_version':'1.0','status':'supported-unpublished-not-a-release',
            'api':{'openapi':openapi.get('openapi'),'json_schema_dialect':dialect,'global_security':global_security,'operations':operations,
                   'schemas':{name:_schema(value) for name,value in _object(components.get('schemas'),'components schemas').items()},
                   'security_schemes':schemes},'ncap':deepcopy(_object(layout,'NCAP layout'))}


def _same(first,second):
    # JSON booleans and integers are distinct even though Python True == 1.
    return json.dumps(first,sort_keys=True,separators=(',',':'),allow_nan=False)==json.dumps(second,sort_keys=True,separators=(',',':'),allow_nan=False)


def check_compatibility(openapi,layout,baseline):
    """Preserve every supported anchor. Add new versions alongside old ones."""
    if not isinstance(baseline,dict) or baseline.get('schema_version')!='1.0' or baseline.get('status')!='supported-unpublished-not-a-release':
        raise CompatibilityError('Unsupported public compatibility baseline')
    current=snapshot(openapi,layout);old=_object(baseline.get('api'),'baseline API');issues=[]
    if current['api']['openapi']!=old.get('openapi'):issues.append('OpenAPI dialect changed')
    # The initial unpublished anchor omitted these root fields. Their absent
    # values are exactly the OpenAPI 3.1 defaults, not a wildcard for changes.
    if not _same(current['api']['global_security'],old.get('global_security',[])):issues.append('Global security changed')
    if current['api']['json_schema_dialect']!=old.get('json_schema_dialect',OPENAPI_31_DIALECT):issues.append('JSON Schema dialect changed')
    for section in ('operations','schemas','security_schemes'):
        previous=_object(old.get(section),'baseline '+section)
        if section in ('operations','schemas') and not previous:raise CompatibilityError('Empty compatibility anchors: '+section)
        for name,wire in previous.items():
            if name not in current['api'][section]:issues.append('Removed '+section+': '+name)
            elif not _same(wire,current['api'][section][name]):issues.append('Changed '+section+': '+name)
    previous=_object(baseline.get('ncap'),'baseline NCAP')
    if not {'prefix','digital_v1','sampled_v2','max_header_bytes'}<=set(previous):raise CompatibilityError('Incomplete NCAP compatibility anchors')
    for name,wire in previous.items():
        if name not in current['ncap'] or not _same(wire,current['ncap'][name]):issues.append('Changed NCAP layout: '+name)
    if issues:raise CompatibilityError('Supported public wire changed; retain the old version and add an explicit version/migration:\n'+'\n'.join(issues[:20]))
