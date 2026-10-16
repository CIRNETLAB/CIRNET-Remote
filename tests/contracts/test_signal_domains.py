"""Explicit domain metadata never invents a model for an imported component."""
import json
import importlib
from pathlib import Path
import pytest
from jsonschema import ValidationError

ROOT=Path(__file__).resolve().parents[2]


def test_signal_domain_contract_is_versioned_separately_from_legacy_graphs():
    path=ROOT/'contracts/design-models/signal-domains.schema.json'
    assert path.exists(), 'Versioned signal-domain boundary is missing.'
    schema=json.loads(path.read_text(encoding='utf-8'))
    assert schema['$defs']['SignalDomain']['enum']==['DIGITAL','ANALOG','POWER','GROUND','CLOCK','MIXED']
    assert schema['$defs']['SignalDomainNamespace']['additionalProperties'] is False


def test_canonical_catalog_ports_have_explicit_domains():
    editor=json.loads((ROOT/'device-library/editor/components.json').read_text(encoding='utf-8'))
    physical=json.loads((ROOT/'device-library/parts/physical-parts.json').read_text(encoding='utf-8'))
    domains={'DIGITAL','ANALOG','POWER','GROUND','CLOCK','MIXED'}
    for component in editor['components']:
        assert all(port.get('domain') in domains for port in component['ports']),component['type']
    for part in physical['parts']:
        assert all(pin.get('domain') in domains for pin in part['package']['pins']),part['editorType']


def test_python_and_browser_receive_the_same_domain_catalog():
    python=ROOT/'contracts/design-models/signal-port-catalog.json'
    browser=ROOT/'apps/web/src/data/signalPortCatalog.json'
    assert python.exists() and browser.exists(),'The shared port-domain projection is missing.'
    assert json.loads(python.read_text(encoding='utf-8'))==json.loads(browser.read_text(encoding='utf-8'))


def domain_boundary():
    assert (ROOT/'contracts/signal_domains.py').exists(),'Shared signal-domain rules are missing.'
    return importlib.import_module('contracts.signal_domains')


def graph(*modules):
    return {'schema_version':'1.1','circuit_id':'domains','modules':list(modules),'connections':[]}


def test_clock_is_digital_compatible_but_mixed_is_not_a_wildcard():
    domains=domain_boundary()
    assert domains.domains_compatible('CLOCK','DIGITAL')
    assert domains.domains_compatible('DIGITAL','CLOCK')
    assert not domains.domains_compatible('ANALOG','DIGITAL')
    assert not domains.domains_compatible('MIXED','DIGITAL')
    assert not domains.domains_compatible(None,'DIGITAL')


def test_unknown_import_annotation_does_not_grant_a_model_or_default_to_digital():
    domains=domain_boundary()
    value=graph({'id':'U','type':'NO_MODEL'})
    before=json.loads(json.dumps(value))
    assert domains.classify_graph(value)['kind']=='UNKNOWN'
    value['modules'][0]['signal_domains']={'version':'1.0','ports':{'OUT':'DIGITAL'}}
    result=domains.classify_graph(value)
    assert result['kind']=='UNKNOWN' and result['unsupported_components']==['U']
    del value['modules'][0]['signal_domains']
    assert value==before


def test_classification_distinguishes_bounded_dc_from_unavailable_analog_and_mixed():
    domains=domain_boundary()
    assert domains.classify_graph(graph({'id':'C','type':'CLOCK'}))['kind']=='DIGITAL'
    assert domains.classify_graph(graph({'id':'P','type':'DC_SUPPLY'},{'id':'R','type':'RESISTOR_AXIAL'}))['kind']=='DC_DIGITAL'
    assert domains.classify_graph(graph({'id':'C','type':'CAPACITOR_CERAMIC'}))['kind']=='ANALOG'
    assert domains.classify_graph(graph({'id':'C','type':'CAPACITOR_CERAMIC'},{'id':'D','type':'DIGITAL_SWITCH'}))['kind']=='MIXED'
    unavailable=domains.classify_graph(graph({'id':'G','type':'SN7400N'}))
    assert unavailable['kind']=='DIGITAL' and unavailable['unsupported_components']==['G']


def test_namespace_cannot_relabel_known_ports_and_future_versions_remain_storable():
    domains=domain_boundary()
    value=graph({'id':'C','type':'CLOCK','signal_domains':{'version':'1.0','ports':{'OUT':'ANALOG'}}})
    with pytest.raises(ValidationError) as failure:domains.validate_signal_domains('CircuitGraph',value)
    assert failure.value.issues[0]['code']=='SIGNAL_DOMAIN_CONFLICT'
    value['modules'][0]['signal_domains']={'version':'2.0','custom-preserved':True}
    domains.validate_signal_domains('CircuitGraph',value)
    with pytest.raises(ValidationError) as failure:domains.classify_graph(value)
    assert failure.value.issues[0]['code']=='UNSUPPORTED_SIGNAL_DOMAIN_VERSION'


def test_shared_domain_corpus_matches_python_classification_and_error_paths():
    from contracts.registry import validate_contract
    domains=domain_boundary()
    corpus=json.loads((ROOT/'contracts/fixtures/signal-domains-conformance.json').read_text(encoding='utf-8'))
    for case in corpus['compatibility']:
        assert domains.domains_compatible(case['source'],case['destination'])==case['compatible']
    for case in corpus['classification']:
        value=graph(*case['modules']);before=json.loads(json.dumps(value))
        assert domains.classify_graph(value)=={'schema_version':'1.0',**{key:case[key] for key in ('kind','domains','unsupported_components')}},case['name']
        assert value==before
    for case in corpus['invalid_namespaces']:
        with pytest.raises(ValidationError) as failure:
            validate_contract('CircuitGraph',graph({'id':'C','type':case['type'],'signal_domains':case['namespace']}))
        assert failure.value.issues[0]['code']==case['code']
        assert failure.value.issues[0]['path']==case['path']
