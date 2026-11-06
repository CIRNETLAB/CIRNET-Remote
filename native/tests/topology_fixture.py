"""Probe exact Python r8 topology corner cases with stable input."""
import json
import sys
from app.services.topology_resolver import TopologyResolver
from app.services.verification import TopologyVerificationService


def graph(prefix, identities, connections):
    components = [
        {
            "component_id": f"{prefix}_{i:02d}", "kind": "OBSERVED_PHYSICAL_COMPONENT",
            "identity": identity, "package": "DIP14", "node_ids": [f"{prefix}_{i:02d}_{pin}" for pin in (2, 1, 3)],
            "pins": [{"pin_id": str(pin), "node_id": f"{prefix}_{i:02d}_{pin}"} for pin in (2, 1, 3)],
        }
        for i, identity in enumerate(identities)
    ]
    return {
        "schema_version": "1.0", "scan_id": prefix, "ambiguities": [],
        "components": components,
        "nodes": [{"node_id": node} for component in components for node in component["node_ids"]],
        "connections": [{"node_ids": [f"{prefix}_{index:02d}_{pin}" for index, pin in pair], "confidence": 0.4}
                        for pair in connections],
    }


def run_case(name, identities, reference_connections, observed_connections):
    reference = graph("reference", identities, reference_connections)
    observed = graph("observed", identities, observed_connections)
    assignment = {
        "reference_topology_graph": reference,
        "lab_endpoints": [{"endpoint_id": "monitor", "role": "OUTPUT_SENSE", "reference_node_id": "reference_00_1"}],
    }
    resolved = TopologyResolver().resolve(assignment, observed)
    verified = TopologyVerificationService().verify(assignment, observed, resolved)
    return {"name": name, "assignment": assignment, "observed": observed, "resolution": resolved, "verification": verified}


cases = [run_case("multiple-shorts", ["AND", "OR"], [], [[(0, 1), (0, 2)], [(1, 1), (1, 2)]])]
if len(sys.argv) > 1 and sys.argv[1] == "all":
    cases.append(run_case("mapping-budget", ["AND"] * 5, [], []))
    cases.append(run_case("search-step-budget", ["AND"] * 10, [[(8, 1), (9, 1)]], [[(8, 1), (8, 2)]]))
print(json.dumps(cases, ensure_ascii=False, separators=(",", ":")))
