"""Verify normal Remote imports resolve to the selected Simulator wheel."""
import json
from importlib import import_module
try:
    from scripts.simulator_artifact import installed_provenance, installed_artifact
except ModuleNotFoundError:
    from simulator_artifact import installed_provenance, installed_artifact


def main():
    namespace = 'cirnet_sim' if installed_artifact().metadata['Name'] == 'cirnet-simulator' else 'netcircuit_sim'
    for module in ('analog', 'backends', 'circuit', 'dispatch', 'engine', 'logic', 'nets', 'waveform'):
        import_module(namespace + '.' + module)
    print(json.dumps(installed_provenance(), sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
