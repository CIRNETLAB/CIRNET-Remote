"""Synthetic protected instrument driver for Remote integration; no physical evidence."""
from copy import deepcopy


class ProtectedTestDriver:
    """Electrical test double; no production hardware claim."""
    def __init__(self, safety='SAFE', unknown=False, fail=None):
        self.calls=[]
        self.safety=safety
        self.unknown=unknown
        self.fail=fail
    def get_capabilities(self):
        return {'available':True,'physical_digital':True,'physical_execution_slots':1,
                'topology_scan_supported':True,'safety_gate_supported':True,
                'guarded_run_supported':True,'hardware_profile_version':'test-protection',
                'instrument_capabilities':{
                    'logic_analyzer':{'channels':1,'runtime_reconfiguration_supported':False},
                    'oscilloscope':{'channels':0,'runtime_reconfiguration_supported':False},
                    'generator':{'channels':0,'runtime_reconfiguration_supported':False}},
                'routing_resources':[{'resource_id':'drive-1','roles':['INPUT_SOURCE'],'node_ids':['N1']}],
                'breadboards':[{'id':'only-board','model':'test-board'}]}
    def enter_safe_state(self):
        self.calls.append('safe')
        return {'accepted':True,'hardware_applied':True}
    def scan_topology(self):
        self.calls.append('scan')
        return {'schema_version':'1.0','scan_id':'s1','nodes':[{'node_id':'N1'}],
                'connections':[], 'ambiguities':[],
                'components':[{'component_id':'U1','kind':'OPAQUE_PHYSICAL_COMPONENT','identity':'UNKNOWN','node_ids':['N1']}] if self.unknown else []}
    def read_runtime_safety(self):
        self.calls.append('safety')
        return {'schema_version':'1.0','status':self.safety,'issues':[]}
    def prepare_execution(self, value):
        self.calls.append('prepare')
        return {'accepted':True}
    def apply_routing(self, value):
        self.calls.append('routing')
        if self.fail=='routing': raise OSError('private transport details')
        return {'accepted':True}
    def guarded_power_up(self, value):
        self.calls.append('power')
        return {'accepted':True}
    def arm_capture(self, value):
        self.calls.append('arm')
        return {'accepted':True}
    def start_execution(self):
        self.calls.append('start')
        return {'accepted':True}
    def stop_execution(self):
        self.calls.append('stop')
        return {'accepted':True}
    def read_capture(self):
        return {'available':True,'samples':[]}


def generator_configuration(**values):
    return {'channel': 1, 'waveform': 'SINE', 'frequency_hz': 1000,
            'amplitude_vpp': 1, 'offset_v': 0, 'enabled': True, **values}


class GeneratorTestDriver(ProtectedTestDriver):
    """Synthetic profile limits and safe acknowledgements, with no hardware claim."""
    def __init__(self, *, runtime=False):
        super().__init__()
        self.runtime = runtime
        self.configurations = []
        self.prepared_plan = None
        self.generator_path = True
        self.profile_version = 'test-protection'
        self.capability_overrides = {}

    def get_capabilities(self):
        value = super().get_capabilities()
        value['physical_analog_routing'] = False
        value['hardware_profile_version'] = self.profile_version
        if self.generator_path:
            value['routing_resources'][0]['roles'].append('GENERATOR')
        value['instrument_capabilities'] = {
            'logic_analyzer': {'channels': 1, 'runtime_reconfiguration_supported': False},
            'oscilloscope': {'channels': 0, 'runtime_reconfiguration_supported': False},
            'generator': {'channels': 2, 'runtime_reconfiguration_supported': self.runtime,
                          'supported_waveforms': ['SINE', 'SQUARE'], 'frequency_min_hz': 100,
                          'frequency_max_hz': 10000, 'amplitude_max_vpp': 3,
                          'offset_min_v': -1, 'offset_max_v': 1},
        }
        value.update(self.capability_overrides)
        return value

    def prepare_execution(self, value):
        self.prepared_plan = deepcopy(value)
        return super().prepare_execution(value)

    def configure_generator(self, value):
        self.calls.append('generator')
        self.configurations.append(deepcopy(value))
        return {'accepted': True}

