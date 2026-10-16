from app.main import create_app


def test_cookie_csrf_and_origin_policy_are_declared_for_all_mutations():
    document=create_app(schema_only=True).openapi()
    security=document['components']['securitySchemes']
    assert security['ServerSession']=={'type':'apiKey','in':'cookie','name':'netcircuit_session'}
    assert security['CsrfToken']=={'type':'apiKey','in':'header','name':'X-CSRF-Token'}
    for path,operations in document['paths'].items():
        for method,operation in operations.items():
            if method.upper() not in {'GET','POST','PUT','PATCH','DELETE'}: continue
            if method=='get' and path in {'/api/health','/api/auth/session'}:
                assert operation.get('security',[])==[]
            else: assert operation['security'][0]['ServerSession']==[]
            if method!='get':
                assert operation['security'][0]['CsrfToken']==[]
                origin=next(parameter for parameter in operation['parameters'] if parameter['in']=='header' and parameter['name']=='Origin')
                assert origin['required'] and origin['schema']['type']=='string'
