"""New shaped-package mechanics agree across Python and the browser solver."""
from copy import deepcopy
import json
import math
from pathlib import Path

import pytest

from contracts.design_validation import validate_design_graph
from contracts.flexible_mounting import MM_TO_WORLD, resolve_flexible_geometry
from contracts.physical_mounting import get_physical_part, package_lead_collision_radius_mm
from contracts.registry import validate_contract

ROOT = Path(__file__).resolve().parents[2]


def test_sealed_shape_contract_and_conservative_section_envelopes():
    for kind, expected in [('GENERIC_DIODE', .3), ('GENERIC_LED', math.hypot(.5, .5)/2), ('GENERIC_BJT', math.hypot(.44, .42)/2), ('SN74HC08N', math.hypot(1.4, .28)/2)]:
        package = get_physical_part(kind)['package']
        assert validate_contract('PackageShapeV1', package['shape']) == package['shape']
        assert package_lead_collision_radius_mm(package) == pytest.approx(expected)


def test_sealed_package_browser_python_parity_includes_round_square_and_nondefault_spans():
    corpus = json.loads((ROOT / 'contracts/design-models/fixtures/sealed-package-parity.json').read_text())
    assert len(corpus['cases']) == 24
    for case in corpus['cases']:
        graph = case['graph']
        validate_design_graph(graph)
        board, module = graph['modules']
        part = get_physical_part(module['type'], module['mount'])
        geometry = resolve_flexible_geometry(module, part, board)
        for expected, lead in zip(case['expectedGeometry'], geometry['leads']):
            assert lead['path']['length']/MM_TO_WORLD == pytest.approx(expected['lengthMm'], abs=1e-10), case['id']
            assert [radius/MM_TO_WORLD for radius in lead['path']['bendRadii']] == pytest.approx(expected['bendRadiiMm'], abs=1e-10), case['id']
            assert len(lead['points']) == len(expected['points'])
            for actual, point in zip(lead['points'], expected['points']):
                assert actual == pytest.approx(tuple(point[axis] for axis in ('x', 'y', 'z')), abs=1e-12), case['id']
        invalid = deepcopy(graph)
        invalid['modules'][1]['mount']['bodyPose']['position']['y'] -= 1
        with pytest.raises(ValueError):
            validate_design_graph(invalid)


def test_square_corner_collision_is_not_treated_as_a_round_half_width():
    from contracts.flexible_mounting import lead_hits_body
    package = get_physical_part('GENERIC_LED')['package']
    path = [(0, 0, 0), (0, 1, 0)]
    # A .31 mm separation clears a .5 mm round wire; it intersects the
    # conservative .5 x .5 mm square envelope at a corner orientation.
    body = {'center': (1.31, .5, 0), 'half': (1, .1, .1), 'axes': ((1, 0, 0), (0, 1, 0), (0, 0, 1))}
    assert not lead_hits_body(path, body, package['leadDiameterMm']/2)
    assert lead_hits_body(path, body, package_lead_collision_radius_mm(package))
