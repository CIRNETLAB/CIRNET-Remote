import pytest
from jsonschema import ValidationError
from contracts.registry import validate_contract


def test_saved_document_reference_requires_paired_document_identity_revision():
    value={'schema_version':'1.0','experiment_id':'e','snapshot_id':'e','source':'SAVED_DOCUMENT','execution_mode':'simulation','circuit_id':'original-graph','graph_schema_version':'1.1'}
    with pytest.raises(ValidationError): validate_contract('ExperimentDocumentReference',value)
    assert validate_contract('ExperimentDocumentReference',{**value,'document_id':'d','revision':1})['revision']==1


def test_inline_or_assignment_reference_cannot_claim_saved_document_authority():
    value={'schema_version':'1.0','experiment_id':'e','snapshot_id':'e','source':'INLINE_GRAPH','execution_mode':'simulation','circuit_id':'original-graph','graph_schema_version':'1.1','document_id':'not-saved','revision':1}
    with pytest.raises(ValidationError): validate_contract('ExperimentDocumentReference',value)
    assignment={**value,'source':'ASSIGNMENT_CONTEXT','execution_mode':'hardware'}
    assignment.pop('document_id'); assignment.pop('revision')
    with pytest.raises(ValidationError): validate_contract('ExperimentDocumentReference',assignment)
    assignment['graph_schema_version']=None
    assert validate_contract('ExperimentDocumentReference',assignment)['graph_schema_version'] is None


def test_experiment_saved_revision_is_paired_and_cannot_override_graph():
    base={'station_id':'virtual-station-01','circuit_document_id':'server-document'}
    with pytest.raises(ValidationError): validate_contract('ExperimentCreate',base)
    saved={**base,'circuit_revision':1}
    assert validate_contract('ExperimentCreate',saved)==saved
    with pytest.raises(ValidationError): validate_contract('ExperimentCreate',{**saved,'circuit_graph':{'schema_version':'1.1','circuit_id':'override','modules':[],'connections':[]}})
