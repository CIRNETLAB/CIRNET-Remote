"""Remote API and the selected published runtime import boundary."""
import importlib
import importlib.util
import sys

# Current source can host the pinned original release during the name migration.
# The two names must share module/class identity for worker pickle and RPC paths.
if importlib.util.find_spec('cirnet_sim') is None and importlib.util.find_spec('netcircuit_sim') is not None:
    _legacy = importlib.import_module('netcircuit_sim')
    sys.modules['cirnet_sim'] = _legacy
    for _module in ('logic', 'waveform', 'nets', 'circuit', 'analog', 'engine', 'backends', 'dispatch'):
        sys.modules['cirnet_sim.' + _module] = importlib.import_module('netcircuit_sim.' + _module)
