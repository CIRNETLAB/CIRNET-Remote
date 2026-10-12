from copy import deepcopy
from jsonschema import ValidationError
from contracts.validation import validate
from hardware_service.models import BreadboardCapability, StationCapabilities
from hardware_service.station.base import HardwareStation, HardwareError, StationState as S, serialized

class VirtualHardwareStation(HardwareStation):
    """Virtual lifecycle; R5 supplies actual digital execution."""
    def __init__(self, station_id):
        super().__init__(station_id)
        self._circuit = None
        self._inputs = {}
        self._capture = None

    def get_capabilities(self):
        return StationCapabilities(self.station_id, "simulation", True,
            breadboards=(BreadboardCapability("BB0"), BreadboardCapability("BB1")),
            hardware_profile_version="virtual-1.0", firmware_version="virtual-lifecycle",
            instruments={"logic_analyzer":{"available":False,"channels":0,"status":"NOT_IMPLEMENTED"},
                         "generator":{"available":False,"channels":0,"status":"NOT_IMPLEMENTED"},
                         "oscilloscope":{"available":False,"channels":0,"status":"NOT_IMPLEMENTED"}})

    @serialized
    def validate_configuration(self, configuration):
        valid = isinstance(configuration, dict)
        return {"valid":valid,"code":"OK" if valid else "INVALID_CONFIGURATION"}

    @serialized
    def apply_circuit(self, circuit):
        self._require_state(S.IDLE, S.SAFE_STATE, S.READY)
        if not isinstance(circuit, dict) or circuit.get("schema_version") != "1.0" or not isinstance(circuit.get("modules"),list) or not isinstance(circuit.get("connections"),list):
            raise HardwareError("UNEXECUTABLE")
        self._circuit = deepcopy(circuit)
        self._plan = self._capture = None
        self._state = S.READY
        return self._reply()

    @serialized
    def set_input(self, input_id, value):
        if type(value) is not int or value not in (0,1):
            return {"accepted":False,"code":"INVALID_LOGIC_LEVEL"}
        self._inputs[input_id] = value
        return self._reply(input_id=input_id,value=value)

    @serialized
    def prepare_execution(self, plan, decision):
        self._require_state(S.READY)
        if self._circuit is None:
            raise HardwareError("INVALID_STATE")
        try:
            plan=validate("InstrumentationExecutionPlan",plan)
            decision=validate("ExecutionDecision",decision)
        except ValidationError:
            raise HardwareError("UNEXECUTABLE") from None
        if plan["station_id"] != self.station_id or not decision["decision"].startswith("RUN_"):
            raise HardwareError("UNEXECUTABLE")
        self._plan=plan
        self._experiment_id=plan["experiment_id"]
        return self._reply()

    @serialized
    def apply_routing(self):
        if self._plan is None: raise HardwareError("INVALID_STATE")
        return self._reply(hardware_applied=False,mode="simulation")

    @serialized
    def guarded_power_up(self):
        if self._plan is None: raise HardwareError("INVALID_STATE")
        return self._reply(hardware_applied=False,mode="simulation")

    @serialized
    def configure_clock(self, configuration):
        if self._plan is None: raise HardwareError("INVALID_STATE")
        self._plan["clock_config"]=validate("ClockConfiguration",configuration)
        return self._reply()

    def configure_generator(self, configuration):
        return {"accepted":False,"code":"NOT_IMPLEMENTED","feature":"generator"}

    @serialized
    def configure_trigger(self, configuration):
        if self._plan is None: raise HardwareError("INVALID_STATE")
        self._plan["capture_config"]["trigger"]=deepcopy(configuration)
        return self._reply()

    @serialized
    def arm_capture(self, configuration):
        self._require_state(S.READY)
        if self._plan is None: raise HardwareError("INVALID_STATE")
        self._plan["capture_config"]=validate("CaptureConfiguration",configuration)
        self._state=S.ARMED
        return self._reply()

    @serialized
    def start_execution(self):
        self._require_state(S.ARMED)
        return {"accepted":False,"code":"NOT_IMPLEMENTED","state":self.state}

    @serialized
    def read_capture(self):
        return deepcopy(self._capture) if self._capture else {"available":False,"code":"NOT_IMPLEMENTED","samples":[]}

    @serialized
    def enter_safe_state(self):
        self._plan=None
        self._experiment_id=None
        self._state=S.SAFE_STATE
        return self._reply(hardware_applied=False,mode="simulation")

    def stop_execution(self):
        return self.enter_safe_state()

    @serialized
    def reset(self):
        self._circuit=self._capture=None
        self._inputs.clear()
        return self.enter_safe_state()
