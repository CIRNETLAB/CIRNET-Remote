"""Verify Remote imports resolve to the selected independent Hardware wheel."""
import json
try:
    from scripts.hardware_artifact import installed_provenance
except ModuleNotFoundError:
    from hardware_artifact import installed_provenance


def main():
    from hardware_service import fpga_transport, models, rpc, server
    from hardware_service.station import base, physical, virtual
    print(json.dumps(installed_provenance(), sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
