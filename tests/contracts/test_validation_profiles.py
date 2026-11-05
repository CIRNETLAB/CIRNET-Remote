"""Check the reviewed corpus through the installed Contracts distribution."""
from copy import deepcopy
from hashlib import sha256
import json

import pytest
from jsonschema import ValidationError

from contracts.validation import validate
from tests.support.release_inputs import contract_resource


# Reviewed 0.1.2 JSON resources. Normalize only Windows checkout line endings.
REVIEWED_RESOURCE_SHA256 = {
    "circuit-schema/circuit.schema.json": "3746adb7e97e91bd6523974ae9540b46aaae70022b2961acc803a0997462b04c",
    "circuit-schema/module.schema.json": "104dd3e561277af85cb952a6b8af68951fe0b72f5ae3575af6938d3869bbbddc",
    "circuit-schema/connection.schema.json": "aa7195a892faf5b46dddfaba3ed8562d6477229c043afec03d94c8c82e2bf4cf",
    "fixtures/conformance.json": "b0c4a03ec2fca33455f624707cb43779d9c964cbeeff0c2bc92fe68dbaf9b5d0",
}


def test_installed_corpus_resources_match_reviewed_sha256():
    for resource, expected in REVIEWED_RESOURCE_SHA256.items():
        data = contract_resource(resource).read_bytes().replace(b"\r\n", b"\n")
        assert sha256(data).hexdigest() == expected, f"{resource} differs from reviewed Contracts 0.1.2 bytes"


def test_shared_fixture_corpus_covers_structural_and_semantic_boundaries():
    corpus = json.loads((contract_resource('fixtures/conformance.json')).read_text(encoding="utf-8"))
    assert corpus["version"] == "1.0"
    assert len(corpus["cases"]) >= 25
    for case in corpus["cases"]:
        value = deepcopy(case["value"])
        if case["valid"]:
            result = validate(case["contract"], value, profile=case["profile"])
            assert result == value, case["id"]
            if isinstance(value, dict):
                assert result is not value
        else:
            with pytest.raises(ValidationError) as failure:
                validate(case["contract"], value, profile=case["profile"])
            issue = failure.value.issues[0]
            assert issue["profile"] == case["profile"], case["id"]
            if "issue" in case:
                assert issue["code"] == case["issue"]["code"], case["id"]
                assert issue["path"] == case["issue"]["path"], case["id"]
