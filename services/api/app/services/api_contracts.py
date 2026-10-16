"""Public HTTP projection and documentation shared by route registrations."""
from contracts.boundary.models import ErrorEnvelope

ERROR_RESPONSES = {status: {'model': ErrorEnvelope, 'description': description} for status, description in {
    400: 'Malformed request', 401: 'Authentication required', 403: 'Access denied',
    404: 'Resource not found', 409: 'State or operation conflict', 412: 'Revision precondition failed',
    422: 'Contract or configuration validation failed', 429: 'Admission limit exceeded',
    500: 'Unexpected service failure', 503: 'Required service unavailable', 504: 'Gateway timeout',
}.items()}


def public_capabilities(capabilities):
    """Select only canonical browser capability fields, retaining driver data privately."""
    from contracts.registry import load_schema, validate_contract
    schema = load_schema('https://netcircuit.local/contracts/public/api/1.0/schema.json#/$defs/PublicStationCapabilities')
    value = {name: capabilities[name] for name in schema['properties'] if name in capabilities}
    return validate_contract('PublicStationCapabilities', value, profile='transport')


def public_station(descriptor):
    return {**descriptor, 'capabilities': public_capabilities(descriptor['capabilities'])}


def install_openapi(application):
    """Export registered operations with canonical schemas and profile constraints.

    Pydantic's preservation unions permit integral JSON floats in Python. The
    original schema remains the authority for the documented numeric shape.
    """
    def canonical_openapi():
        if application.openapi_schema is not None:
            return application.openapi_schema
        from fastapi.openapi.utils import get_openapi
        from contracts.registry import entries, schema_bundle
        from contracts.semantic_profiles import profile_schema
        document = get_openapi(title=application.title, version=application.version,
                               description=application.description, routes=application.routes)
        definitions = schema_bundle(public_only=True, ref_prefix='#/components/schemas/')['$defs']
        manifest = {entry['id']: entry for entry in entries() if entry['kind']=='schema' and entry['visibility']=='public'}
        for name, definition in definitions.items():
            entry=manifest[name]
            definition=profile_schema(name,definition,entry['validator_profile'])
            if isinstance(definition,dict):
                definition['x-netcircuit-contract']={'uri':entry['uri']+('#'+entry['pointer'] if entry['pointer'] else ''),
                                                     'version':entry['version'],'profile':entry['validator_profile']}
            document.setdefault('components',{}).setdefault('schemas',{})[name]=definition
        document['components']['securitySchemes']={
            'ServerSession':{'type':'apiKey','in':'cookie','name':'netcircuit_session'},
            'CsrfToken':{'type':'apiKey','in':'header','name':'X-CSRF-Token'}}
        for path,methods in document['paths'].items():
            for method,operation in methods.items():
                if method not in {'get','post','put','patch','delete','head','options'}: continue
                if method in {'get','head','options'}:
                    operation['security']=[] if path in {'/api/health','/api/auth/session'} else [{'ServerSession':[]}]
                else:
                    operation['security']=[{'ServerSession':[],'CsrfToken':[]}]
                    operation.setdefault('parameters',[]).append({'name':'Origin','in':'header','required':True,
                        'description':'Exact configured HTTP origin. Browser fetch supplies this header; wildcard credentials are forbidden.',
                        'schema':{'type':'string'}})
        application.openapi_schema=document
        return document
    application.openapi=canonical_openapi


GRAPH_REQUEST = {'requestBody': {'required': True, 'content': {'application/json': {
    'schema': {'$ref': '#/components/schemas/CircuitGraph'}}}}}
