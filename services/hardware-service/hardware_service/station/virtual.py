from copy import deepcopy
from concurrent.futures import ProcessPoolExecutor, TimeoutError
from multiprocessing import get_context
from threading import RLock
from jsonschema import ValidationError
from contracts.runtime_config import simulation_worker_count
from contracts.validation import validate
from contracts.instrument_validation import validate_plan_instruments
from hardware_service.models import BreadboardCapability, StationCapabilities
from hardware_service.station.base import HardwareStation, HardwareError, StationState as S, serialized
from netcircuit_sim.engine import SimulationError, run_plan
from netcircuit_sim.dispatch import SimulationDispatcher

_pool=None
_pool_lock=RLock()

def simulation_pool():
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool=ProcessPoolExecutor(max_workers=simulation_worker_count(),mp_context=get_context('spawn'))
        return _pool

def close_simulation_pool():
    global _pool
    with _pool_lock:
        if _pool:
            try:
                _pool.shutdown(wait=True,cancel_futures=True)
            finally:
                _pool=None

class VirtualHardwareStation(HardwareStation):
    """Independent digital session backed by bounded process-worker execution."""
    def __init__(self, station_id):
        super().__init__(station_id)
        self._circuit = None
        self._inputs = {}
        self._capture = None
        self._virtual_plan=None
        self._generation=0
        self._future=None

    def get_capabilities(self):
        return StationCapabilities(self.station_id, "simulation", True,
            virtual_digital=True,
            breadboards=(BreadboardCapability("BB0"), BreadboardCapability("BB1")),
            hardware_profile_version="virtual-1.0", firmware_version="virtual-events-1.0",
            instrument_capabilities={"logic_analyzer":{"channels":4,"runtime_reconfiguration_supported":False,"status":"digital-events"},
                         "generator":{"channels":0,"runtime_reconfiguration_supported":False,"status":"NOT_IMPLEMENTED"},
                         "oscilloscope":{"channels":0,"runtime_reconfiguration_supported":False,"status":"NOT_IMPLEMENTED"}})

    @serialized
    def validate_configuration(self, configuration):
        valid = isinstance(configuration, dict)
        return {"valid":valid,"code":"OK" if valid else "INVALID_CONFIGURATION"}

    @serialized
    def apply_circuit(self, circuit):
        self._require_state(S.IDLE, S.SAFE_STATE, S.READY)
        self._circuit=self._virtual_plan=None
        if not isinstance(circuit, dict) or circuit.get("schema_version") not in ("1.0","1.1","1.2") or not isinstance(circuit.get("modules"),list) or not isinstance(circuit.get("connections"),list):
            raise HardwareError("UNEXECUTABLE")
        try: self._virtual_plan=SimulationDispatcher().compile(circuit)
        except SimulationError:
            self._circuit=self._virtual_plan=None
            raise HardwareError('UNEXECUTABLE') from None
        self._circuit = deepcopy(circuit)
        self._generation+=1
        self._inputs.clear()
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
        try:
            validate_plan_instruments(plan, self.get_capabilities().to_dict())
        except (ValueError, ValidationError):
            raise HardwareError("UNEXECUTABLE") from None
        aliases={b['endpoint_id']:b['node_id'] for b in plan['endpoint_bindings']}
        if any(port not in self._virtual_plan.directions for port in aliases.values()): raise HardwareError('UNEXECUTABLE')
        self._plan=plan
        self._aliases=aliases
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
        return {'accepted':False,'code':'NOT_IMPLEMENTED','feature':'clock'}

    def configure_generator(self, configuration):
        return {"accepted":False,"code":"NOT_IMPLEMENTED","feature":"generator"}

    @serialized
    def configure_trigger(self, configuration):
        return {'accepted':False,'code':'NOT_IMPLEMENTED','feature':'trigger'}

    @serialized
    def arm_capture(self, configuration):
        self._require_state(S.READY)
        if self._plan is None: raise HardwareError("INVALID_STATE")
        if 'trigger' in configuration: raise HardwareError('NOT_IMPLEMENTED')
        self._plan["capture_config"]=validate("CaptureConfiguration",configuration)
        self._state=S.ARMED
        return self._reply()

    def start_execution(self,*,experiment_id=None):
        with self._lock:
            if experiment_id is not None and self._experiment_id!=experiment_id:
                raise HardwareError('RESOURCE_CONFLICT')
            self._require_state(S.ARMED)
            self._state=S.RUNNING
            generation=self._generation
            aliases=self._aliases
            config=deepcopy(self._plan['capture_config'])
            config['signals']=[aliases.get(s,s) for s in config['signals']]
            vectors=[{'time_ns':v['time_ns'],'inputs':{aliases.get(s,s):x for s,x in v['inputs'].items()}} for v in self._plan['test_vectors']]
            clock=deepcopy(self._plan['clock_config'])
            if clock: clock['signal']=aliases.get(clock['signal'],clock['signal'])
            # Creation/submission and shutdown share a lock; close cannot shut
            # down the returned executor between lookup and task submission.
            with _pool_lock:
                self._future=simulation_pool().submit(run_plan,self._virtual_plan,config,vectors,clock,deepcopy(self._inputs))
            future=self._future
        try: capture=future.result(timeout=10)
        except TimeoutError:
            future.cancel()
            with self._lock:
                if generation!=self._generation: raise HardwareError('INVALID_STATE') from None
                self._state=S.FAULT
            raise HardwareError('TIMEOUT') from None
        except SimulationError:
            with self._lock:
                if generation!=self._generation: raise HardwareError('INVALID_STATE') from None
                self._state=S.FAULT
            raise HardwareError('UNEXECUTABLE') from None
        except Exception:
            with self._lock:
                if generation!=self._generation: raise HardwareError('INVALID_STATE') from None
                self._state=S.FAULT
            raise HardwareError('DRIVER_ERROR') from None
        with self._lock:
            if generation!=self._generation: raise HardwareError('INVALID_STATE')
            reverse={port:endpoint for endpoint,port in aliases.items()}
            for sample in capture['samples']: sample['signal']=reverse.get(sample['signal'],sample['signal'])
            self._capture=capture
            self._future=None
            return self._reply()

    @serialized
    def read_capture(self):
        if self._capture and self._state==S.RUNNING: self._state=S.CAPTURING
        return deepcopy(self._capture) if self._capture else {"available":False,"code":"NOT_IMPLEMENTED","samples":[]}

    @serialized
    def enter_safe_state(self):
        self._generation+=1
        if self._future: self._future.cancel()
        self._future=None
        self._plan=None
        self._experiment_id=None
        self._state=S.SAFE_STATE
        return self._reply(hardware_applied=False,mode="simulation")

    def stop_execution(self):
        return self.enter_safe_state()

    @serialized
    def reset(self):
        self._circuit=self._capture=None
        self._virtual_plan=None
        self._inputs.clear()
        return self.enter_safe_state()
