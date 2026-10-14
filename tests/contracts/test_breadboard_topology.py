import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_breadboard_model_is_shared_with_frontend_and_has_declared_intrinsic_nodes():
    canonical = ROOT / 'contracts/design-models/breadboards.json'
    assert canonical.exists(), 'Explicit breadboard topology is missing'
    data = json.loads(canonical.read_text(encoding='utf-8'))
    assert data == json.loads((ROOT / 'apps/web/src/data/breadboardTopologies.json').read_text(encoding='utf-8'))
    from contracts.breadboard_topology import get_breadboard_topology, get_breadboard_contact
    for kind, count, nodes in [('BREADBOARD', 830, 130), ('BREADBOARD_630', 630, 126), ('BREADBOARD_100', 100, 2)]:
        board = get_breadboard_topology(kind)
        assert len(board['contacts']) == count
        assert len({c['contactId'] for c in board['contacts']}) == count
        assert len({c['nodeId'] for c in board['contacts']}) == nodes
    assert get_breadboard_contact('BREADBOARD', 'terminal:A:01')['nodeId'] == 'terminal:AE:01'
    assert get_breadboard_contact('BREADBOARD', 'rail:top-positive:50')['nodeId'] == 'rail:top-positive'
    assert get_breadboard_contact('BREADBOARD', 'terminal:A:64') is None
