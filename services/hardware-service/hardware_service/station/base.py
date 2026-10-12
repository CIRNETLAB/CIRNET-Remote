from abc import ABC, abstractmethod
from enum import StrEnum
from functools import wraps
from threading import RLock

class StationState(StrEnum):
    OFFLINE="OFFLINE"
    IDLE="IDLE"
    RESERVED="RESERVED"
    SAFE_STATE="SAFE_STATE"
    TOPOLOGY_SCAN="TOPOLOGY_SCAN"
    SAFETY_CHECK="SAFETY_CHECK"
    ROUTE_PREPARE="ROUTE_PREPARE"
    GUARDED_POWER_UP="GUARDED_POWER_UP"
    READY="READY"
    ARMED="ARMED"
    RUNNING="RUNNING"
    CAPTURING="CAPTURING"
    VERIFYING="VERIFYING"
    STOPPING="STOPPING"
    RELEASE="RELEASE"
    FAULT="FAULT"

class HardwareError(RuntimeError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)

class HardwareUnavailableError(HardwareError):
    def __init__(self, message=None):
        super().__init__("HARDWARE_UNAVAILABLE")

def serialized(method):
    @wraps(method)
    def call(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)
    return call

class HardwareStation(ABC):
    def __init__(self, station_id):
        self.station_id = station_id
        self._lock = RLock()
        self._state = StationState.IDLE
        self._plan = None
        self._experiment_id = None

    @property
    def state(self):
        return str(self._state)

    def _require_state(self, *states):
        if self._state not in states:
            raise HardwareError("INVALID_STATE")

    def _reply(self, **values):
        return {"accepted": True, "code": "OK", "state": self.state, **values}

    @abstractmethod
    def get_capabilities(self): ...
    @abstractmethod
    def enter_safe_state(self): ...
    @abstractmethod
    def prepare_execution(self, plan, decision): ...
    @abstractmethod
    def start_execution(self): ...
    @abstractmethod
    def stop_execution(self): ...
    @abstractmethod
    def read_capture(self): ...
    @abstractmethod
    def reset(self): ...

    def scan_topology(self): raise HardwareError("NOT_IMPLEMENTED")
    def read_runtime_safety(self): raise HardwareError("NOT_IMPLEMENTED")
    def apply_routing(self): raise HardwareError("NOT_IMPLEMENTED")
    def guarded_power_up(self): raise HardwareError("NOT_IMPLEMENTED")
    def arm_capture(self, configuration): raise HardwareError("NOT_IMPLEMENTED")
    def configure_clock(self, configuration): raise HardwareError("NOT_IMPLEMENTED")
    def configure_generator(self, configuration): raise HardwareError("NOT_IMPLEMENTED")
    def configure_trigger(self, configuration): raise HardwareError("NOT_IMPLEMENTED")
    def set_input(self, input_id, value): raise HardwareError("NOT_IMPLEMENTED")
    def apply_circuit(self, circuit): raise HardwareError("UNEXECUTABLE")

    def safe_state(self): return self.enter_safe_state()
    def run(self): return self.start_execution()
    def stop(self): return self.stop_execution()
