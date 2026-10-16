"""Resource-backed NCAP constants also work during fresh code-generation bootstrap."""
from importlib.resources import files
import json
import struct

CAPTURE_LAYOUT=json.loads(files('contracts').joinpath('capture/layout.json').read_text(encoding='utf-8'))
PREFIX=CAPTURE_LAYOUT['prefix']
DIGITAL_V1=CAPTURE_LAYOUT['digital_v1']
SAMPLED_V2=CAPTURE_LAYOUT['sampled_v2']
if struct.calcsize(PREFIX['struct_format'])!=PREFIX['byte_length'] or struct.calcsize(DIGITAL_V1['struct_format'])!=DIGITAL_V1['record_bytes']:
    raise RuntimeError('The NCAP layout authority has inconsistent struct sizes.')
for encoding in SAMPLED_V2['encodings'].values():
    if struct.calcsize(encoding['struct_format'])!=encoding['bytes_per_value']:
        raise RuntimeError('The NCAP sampled encoding size is inconsistent.')
