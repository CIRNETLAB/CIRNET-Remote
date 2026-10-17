"""Explicit design domains; annotations never grant an execution capability.

The catalog is a generated projection of the component library. There is no
domain inference from names, colors, geometry or an unknown component's pins.
"""
from functools import lru_cache
import json
from pathlib import Path
from jsonschema import ValidationError


@lru_cache(maxsize=1)
def signal_catalog():
    source=Path(__file__).with_name('design-models')/'signal-port-catalog.json'
    return {item['type']:item for item in json.loads(source.read_text(encoding='utf-8'))['components']}


def _fail(code,path,message,profile):
    pointer=''.join('/'+str(part).replace('~','~0').replace('/','~1') for part in path)
    error=ValidationError(message,path=path)
    error.issues=[{'code':code,'path':pointer,'severity':'error','profile':profile,'message':message}]
    raise error


def _namespace(module,path,profile,*,execution=False):
    if 'signal_domains' not in module:return
    namespace=module['signal_domains']; location=[*path,'signal_domains']
    if not isinstance(namespace,dict) or not isinstance(namespace.get('version'),str):
        _fail('INVALID_SIGNAL_DOMAINS',location,'Signal domains require an explicit namespace version.',profile)
    if namespace['version']!='1.0':
        if execution:_fail('UNSUPPORTED_SIGNAL_DOMAIN_VERSION',[*location,'version'],'The signal-domain namespace version has no execution adapter.',profile)
        return  # Preserve unknown future metadata; it cannot be executed.
    from .registry import validate_contract
    try:validate_contract('SignalDomainNamespace',namespace,profile=profile)
    except ValidationError as error:
        prefix=''.join('/'+str(part).replace('~','~0').replace('/','~1') for part in location)
        for issue in error.issues:issue['path']=prefix+issue['path']
        raise
    descriptor=signal_catalog().get(module['type'])
    if descriptor is None:return
    ports={port['id']:port for port in descriptor['ports']}
    for port,domain in namespace['ports'].items():
        if port not in ports:
            _fail('UNKNOWN_SIGNAL_PORT',[*location,'ports',port],'The namespace references an unknown catalog port.',profile)
        if ports[port]['domain']!=domain:
            _fail('SIGNAL_DOMAIN_CONFLICT',[*location,'ports',port],'An instance annotation cannot relabel the canonical port domain.',profile)


def validate_signal_domains(name,value,profile='transport',*,_path=()):
    """Semantic hook for recognized namespaces, without altering legacy shapes."""
    if name=='CircuitGraph':
        for index,module in enumerate(value['modules']):_namespace(module,[*_path,'modules',index],profile)
    elif name=='CircuitModule':_namespace(value,list(_path),profile)
    elif name=='SimulationRequest':validate_signal_domains('CircuitGraph',value['graph'],profile,_path=(*_path,'graph'))


def domains_compatible(source,destination):
    """Direct compatibility only; MIXED and unknown are never wildcards."""
    if source is None or destination is None:return False
    return source==destination or {source,destination}=={'CLOCK','DIGITAL'}


def port_domain(module,port):
    descriptor=signal_catalog().get(module['type'])
    if descriptor:
        return next((item['domain'] for item in descriptor['ports'] if item['id']==port),None)
    namespace=module.get('signal_domains')
    return namespace.get('ports',{}).get(port) if isinstance(namespace,dict) and namespace.get('version')=='1.0' else None


def classify_graph(graph):
    """Classify selection separately from whether the selected engine exists."""
    from .registry import validate_contract
    validate_contract('AnySupportedCircuitGraph',graph,profile='structural')
    domains=set(); unsupported=[]; digital=False; dc=False; analog=False; mixed=False; unknown=False
    for index,module in enumerate(graph['modules']):
        _namespace(module,['modules',index],'transport',execution=True)
        descriptor=signal_catalog().get(module['type'])
        if descriptor is None:
            unknown=True;unsupported.append(module['id'])
            continue
        component_domains={port['domain'] for port in descriptor['ports']};domains.update(component_domains)
        execution=descriptor['execution']
        if execution=='VISUAL':continue
        if execution=='DIGITAL':digital=True
        elif execution=='DC_DIGITAL':dc=True
        else:
            unsupported.append(module['id'])
            mixed=mixed or 'MIXED' in component_domains
            analog=analog or 'ANALOG' in component_domains
            digital=digital or bool(component_domains & {'DIGITAL','CLOCK'})
    kind='UNKNOWN' if unknown else 'MIXED' if mixed or analog and digital else 'ANALOG' if analog else 'DC_DIGITAL' if dc else 'DIGITAL'
    return validate_contract('SimulationClassification',{'schema_version':'1.0','kind':kind,'domains':sorted(domains),'unsupported_components':sorted(unsupported)})


def validate_domain_connections(graph,profile='transport'):
    """Bounded DC parts use the existing explicit DC adapter; all other edges use direct domains."""
    modules={module['id']:module for module in graph['modules']}
    for index,edge in enumerate(graph['connections']):
        endpoints=[]
        for endpoint in (edge['source'],edge['destination']):
            pieces=endpoint.split('.')
            if len(pieces)!=2 or pieces[0] not in modules:continue
            module=modules[pieces[0]]
            if pieces[1].startswith('contact:'):continue  # Contact domain belongs to the connected net.
            endpoints.append((module,port_domain(module,pieces[1])))
        if len(endpoints)!=2:continue
        (source,source_domain),(destination,destination_domain)=endpoints
        if domains_compatible(source_domain,destination_domain):continue
        # This exception identifies existing modeled DC components, not arbitrary
        # caller metadata. The DC solver still checks rails, topology and limits.
        entries=[signal_catalog().get(module['type'],{}) for module in (source,destination)]
        if all(domain is not None and domain!='MIXED' for _,domain in endpoints) and any(entry.get('execution')=='DC_DIGITAL' for entry in entries):continue
        _fail('SIGNAL_DOMAIN_MISMATCH',['connections',index],'Connection domains require an explicit compatible adapter.',profile)
