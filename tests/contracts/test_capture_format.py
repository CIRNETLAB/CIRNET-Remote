"""Public NCAP format authority and shared binary corpus, independent of hardware."""
import json
import hashlib
from pathlib import Path
import pytest

from contracts import capture_codec
from contracts.registry import validate_contract
from jsonschema import ValidationError

ROOT=Path(__file__).resolve().parents[2]
CORPUS=ROOT/'contracts/fixtures/capture/conformance.json'


def test_capture_layout_is_a_single_checked_source_for_python_and_browser():
    path=ROOT/'contracts/capture/layout.json'
    assert path.is_file(), 'The versioned NCAP layout authority is missing.'
    from contracts.capture_layout import CAPTURE_LAYOUT
    from contracts.boundary.capture_layout import CAPTURE_LAYOUT as GENERATED_LAYOUT
    assert CAPTURE_LAYOUT==json.loads(path.read_text(encoding='utf-8'))
    assert GENERATED_LAYOUT==CAPTURE_LAYOUT
    assert capture_codec.HEADER.size==9
    assert capture_codec.EVENT.size==11


def test_digital_and_sampled_codecs_share_committed_valid_and_malformed_corpus():
    path=ROOT/'contracts/fixtures/capture/conformance.json'
    assert path.is_file(), 'Python and browser need the same committed NCAP golden corpus.'
    corpus=json.loads(path.read_text(encoding='utf-8'))
    assert {case['version'] for case in corpus['cases']}=={1,2}
    assert any(not case['valid'] for case in corpus['cases'])


def test_versioned_sampled_decoder_exists_without_enabling_a_runtime_producer():
    assert hasattr(capture_codec,'decode_sampled'), 'INT16/UINT16/FLOAT32 need a versioned decoder.'


@pytest.mark.parametrize('case',json.loads(CORPUS.read_text(encoding='utf-8'))['cases'],ids=lambda case:case['id'])
def test_shared_ncap_golden(case):
    payload=bytes.fromhex(case['payload_hex'])
    if 'expected_issue' in case:
        with pytest.raises(ValidationError) as caught:validate_contract('AnalogCaptureDescriptor',case['descriptor'],profile='transport')
        assert {key:caught.value.issues[0][key] for key in case['expected_issue']}==case['expected_issue']
    if not case['valid']:
        with pytest.raises(ValueError,match='CAPTURE_CORRUPT'):
            if case['version']==1:capture_codec.decode_digital(payload)
            else:capture_codec.decode_sampled(payload,case['descriptor'])
        return
    if case['version']==1:
        assert hashlib.sha256(payload).hexdigest()==case['metadata']['sha256']
        actual=capture_codec.decode_digital(payload)
        assert actual==case['expected']
        if case.get('canonical_encoding'):assert capture_codec.encode_digital(actual['samples'],actual['duration_ns'])==payload
    else:
        actual=capture_codec.decode_sampled(payload,case['descriptor'])
        assert actual['samples']==case['expected']['samples']
        channels=actual['descriptor']['header']['channels']
        assert [v*channels[i%len(channels)]['scale']+channels[i%len(channels)]['offset'] for i,v in enumerate(actual['samples'])]==case['expected']['physical_values']
        for index,expected in enumerate(case['expected']['times_ns']):
            numerator,denominator=capture_codec.sampled_frame_time(actual,index)
            assert (str(numerator),str(denominator))==(expected['numerator'],expected['denominator'])
        if case.get('canonical_encoding'):assert capture_codec.encode_sampled(actual['descriptor']['header'],actual['samples'])==payload
