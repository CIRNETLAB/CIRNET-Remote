"""Verify the real wheel supplies normal checkout imports and offline resources."""
import json
try:
    from scripts.contracts_artifact import installed_provenance
except ModuleNotFoundError:
    from contracts_artifact import installed_provenance


def main():
    # Import representative modules before checking every loaded origin.
    from contracts import registry, physical_mounting, capture_codec, signal_domains
    from contracts.boundary import models
    from contracts.generated import rpc_v2_pb2, rpc_v2_pb2_grpc
    registry.check_manifest()
    print(json.dumps(installed_provenance(), sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
