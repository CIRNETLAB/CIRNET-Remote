"""Capture bytes remain outside SQL JSON; storage keys never expose filesystem paths."""
from hashlib import sha256
from pathlib import Path
import re
import tempfile
from typing import Protocol

from contracts.capture_codec import decode_digital, HEADER, MAX_HEADER, MAX_EVENTS, EVENT


class CaptureStore(Protocol):
    def put(self, metadata:dict, payload:bytes) -> None: ...
    def get(self, metadata:dict) -> bytes: ...
    def delete(self, metadata:dict) -> bool: ...


class FilesystemCaptureStore:
    def __init__(self, directory):
        self.directory=Path(directory).resolve()

    def _path(self, metadata):
        key=metadata['capture_id']
        if not re.fullmatch(r'[0-9a-f]{32}',key): raise ValueError('INVALID_CAPTURE_KEY')
        path=self.directory/(key+'.ncap')
        if path.resolve().parent!=self.directory: raise ValueError('INVALID_CAPTURE_KEY')
        return path

    def put(self, metadata, payload):
        path=self._path(metadata)
        self.directory.mkdir(parents=True,exist_ok=True)
        temporary=None
        try:
            with tempfile.NamedTemporaryFile(dir=self.directory,prefix='.capture-',delete=False) as handle:
                temporary=Path(handle.name); handle.write(payload)
            temporary.replace(path)
        finally:
            if temporary and temporary.exists(): temporary.unlink()

    def get(self, metadata):
        path=self._path(metadata)
        if not metadata['available'] or not path.is_file(): raise ValueError('CAPTURE_UNAVAILABLE')
        # Bound reading even if a file was replaced/corrupted externally.
        with path.open('rb') as handle:
            payload=handle.read(HEADER.size+MAX_HEADER+MAX_EVENTS*EVENT.size+1)
        if len(payload)!=metadata['payload_byte_count'] or sha256(payload).hexdigest()!=metadata['sha256']:
            raise ValueError('CAPTURE_CORRUPT')
        decoded=decode_digital(payload)
        signals=sorted({sample['signal'] for sample in decoded['samples']})
        if (len(decoded['samples'])!=metadata['sample_count'] or decoded['duration_ns']!=metadata['duration_ns']
                or len(signals)!=metadata['channel_count'] or signals!=metadata.get('signals',signals)):
            raise ValueError('CAPTURE_CORRUPT')
        return payload

    def delete(self, metadata):
        path=self._path(metadata)
        try: path.unlink(); return True
        except FileNotFoundError: return False
