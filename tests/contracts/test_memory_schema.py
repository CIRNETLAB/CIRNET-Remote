from tests.support.release_inputs import contract_resource
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, ValidationError

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = Draft202012Validator(json.loads((contract_resource('memory/memory-image.schema.json')).read_text()))


def test_local_memory_image_contract_accepts_explicit_byte_boundaries():
    VALIDATOR.validate({'version': '1.0', 'word_bits': 8, 'depth': 2, 'data': [0, 255]})
    VALIDATOR.validate({'version': '1.0', 'word_bits': 8, 'depth': 256, 'data': [0] * 256})


@pytest.mark.parametrize('patch', [{'version': '2.0'}, {'word_bits': 16}, {'depth': 0}, {'depth': 257}, {'data': [256]}, {'data': [-1]}, {'data': [1.5]}, {'data': [True]}, {'physical_address': 1}])
def test_local_memory_image_contract_rejects_unsupported_formats(patch):
    with pytest.raises(ValidationError):
        VALIDATOR.validate({'version': '1.0', 'word_bits': 8, 'depth': 1, 'data': [0], **patch})
