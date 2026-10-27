"""Verify normal Remote imports resolve to the selected Simulator wheel."""
import json
try:
    from scripts.simulator_artifact import installed_provenance
except ModuleNotFoundError:
    from simulator_artifact import installed_provenance


def main():
    from netcircuit_sim import analog, backends, circuit, dispatch, engine, logic, nets, waveform
    print(json.dumps(installed_provenance(), sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
