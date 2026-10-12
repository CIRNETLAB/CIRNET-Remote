import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hardware_service.station.virtual import VirtualHardwareStation
import pytest


def test_virtual_station_reports_capabilities_and_safe_state():
    station=VirtualHardwareStation('virtual-station-01')
    caps=station.get_capabilities()
    assert caps.station_id=='virtual-station-01'
    assert caps.mode=='simulation'
    assert caps.available is True
    assert len(caps.breadboards)>=2
    assert station.safe_state()['state']=='SAFE_STATE'


def test_virtual_station_does_not_claim_execution_before_simulator_is_integrated():
    station=VirtualHardwareStation('virtual-station-01')
    graph={'schema_version':'1.0','circuit_id':'c1','modules':[],'connections':[]}
    assert station.apply_circuit(graph)['accepted'] is True
    with pytest.raises(RuntimeError) as caught:
        station.run()
    assert getattr(caught.value, 'code', None) == 'INVALID_STATE'
    assert station.read_capture()['available'] is False
    assert station.stop()['state']=='SAFE_STATE'


@pytest.mark.parametrize('value', [0.0, 1.0, '1', None, 2, True, False])
def test_virtual_station_rejects_invalid_integer_logic_levels(value):
    station = VirtualHardwareStation('virtual-station-01')
    assert station.set_input('SW1.OUT', value) == {
        'accepted': False, 'code': 'INVALID_LOGIC_LEVEL',
    }
