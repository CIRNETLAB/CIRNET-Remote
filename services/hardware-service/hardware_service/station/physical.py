from dataclasses import fields
import time
from jsonschema import ValidationError
from contracts.validation import validate
from hardware_service.models import BreadboardCapability, StationCapabilities
from hardware_service.station.base import HardwareStation, HardwareError, HardwareUnavailableError, StationState as S, serialized

class PhysicalHardwareStation(HardwareStation):
    """Safety lifecycle boundary; driver/profile supplies electrical evidence."""
    def __init__(self, station_id, driver=None, *, clock=time.monotonic, scan_ttl=30):
        super().__init__(station_id)
        if scan_ttl <= 0:
            raise ValueError("scan_ttl must be positive")
        self._driver = driver
        self._clock = clock
        self._scan_ttl = scan_ttl
        self._scan_at = None
        self._topology = None
        self._decision = None
        self._state = S.IDLE if driver else S.OFFLINE

    def _require_driver(self):
        if self._driver is None:
            raise HardwareUnavailableError()
        return self._driver

    def _invalidate(self):
        self._plan = self._topology = self._scan_at = self._decision = None
        self._experiment_id = None

    def _fault(self):
        self._invalidate()
        self._state = S.FAULT
        if self._driver:
            try:
                self._driver.enter_safe_state()
            except Exception:
                pass  # Hardware watchdog/interlock must independently cut off.

    def _invoke(self, name, *args):
        driver = self._require_driver()
        try:
            method = getattr(driver, name, None)
            if not callable(method):
                raise HardwareError("NOT_IMPLEMENTED")
            result = method(*args)
            if not isinstance(result, dict):
                raise HardwareError("DRIVER_ERROR")
            if result.get("accepted") is False:
                raise HardwareError(result.get("code", "DRIVER_ERROR"))
            if name not in ("scan_topology", "read_runtime_safety", "read_capture") and result.get("accepted") is not True:
                raise HardwareError("DRIVER_ERROR")
            return result
        except HardwareError:
            self._fault()
            raise
        except Exception:
            self._fault()
            raise HardwareError("DRIVER_ERROR") from None

    @serialized
    def get_capabilities(self):
        if self._driver is None or not callable(getattr(self._driver, "get_capabilities", None)):
            return StationCapabilities(self.station_id, "hardware", False)
        try:
            profile = self._driver.get_capabilities()
            if isinstance(profile, StationCapabilities):
                profile = profile.to_dict()
            allowed = {field.name for field in fields(StationCapabilities)} - {"station_id", "mode"}
            values = {key: value for key, value in profile.items() if key in allowed}
            values.setdefault("available", False)
            values["breadboards"] = tuple(BreadboardCapability(**item) if isinstance(item, dict) else item for item in values.get("breadboards", ()))
            caps = StationCapabilities(self.station_id, "hardware", **values)
            validate("StationCapabilities", caps.to_dict())
            return caps
        except Exception:
            self._fault()
            return StationCapabilities(self.station_id, "hardware", False)

    @serialized
    def enter_safe_state(self):
        self._invalidate()
        if self._driver is None:
            self._state = S.OFFLINE
            return {"accepted": False, "code": "HARDWARE_UNAVAILABLE", "state": self.state, "hardware_applied": False}
        result = self._invoke("enter_safe_state")
        if result.get("hardware_applied") is not True:
            self._state = S.FAULT
            return {"accepted": False, "code": "DRIVER_ERROR", "state": self.state, "hardware_applied": False}
        self._state = S.SAFE_STATE
        return self._reply(hardware_applied=True)

    @serialized
    def scan_topology(self):
        self._require_driver()
        self._require_state(S.SAFE_STATE)
        caps = self.get_capabilities()
        if not caps.available or not caps.topology_scan_supported:
            raise HardwareError("UNEXECUTABLE")
        self._state = S.TOPOLOGY_SCAN
        try:
            self._topology = validate("DetectedTopologyGraph", self._invoke("scan_topology"))
        except ValidationError:
            self._fault()
            raise HardwareError("DRIVER_ERROR") from None
        self._scan_at = self._clock()
        return self._topology

    def _fresh_safe(self):
        if self._scan_at is None or self._clock() - self._scan_at > self._scan_ttl:
            self._fault()
            raise HardwareError("SAFETY_INDETERMINATE")
        try:
            result = validate("SafetyVerificationResult", self._invoke("read_runtime_safety"))
        except ValidationError:
            self._fault()
            raise HardwareError("DRIVER_ERROR") from None
        if result["status"] != "SAFE":
            self._fault()
            raise HardwareError("UNSAFE" if result["status"] == "UNSAFE" else "SAFETY_INDETERMINATE")
        return result

    @serialized
    def read_runtime_safety(self):
        self._require_driver()
        self._require_state(S.TOPOLOGY_SCAN, S.SAFETY_CHECK, S.ROUTE_PREPARE, S.READY, S.ARMED, S.RUNNING, S.CAPTURING)
        if self._state in (S.TOPOLOGY_SCAN, S.SAFETY_CHECK):
            self._state = S.SAFETY_CHECK
        # A safety report is evidence, not authorization. Unsafe observations remain observable.
        try:
            result = validate("SafetyVerificationResult", self._invoke("read_runtime_safety"))
        except ValidationError:
            self._fault()
            raise HardwareError("DRIVER_ERROR") from None
        if result["status"] != "SAFE" and self._state in (S.RUNNING, S.CAPTURING, S.READY, S.ARMED):
            self._fault()
        return result

    @serialized
    def prepare_execution(self, plan, decision):
        self._require_driver()
        self._require_state(S.SAFETY_CHECK)
        try:
            plan = validate("InstrumentationExecutionPlan", plan)
            decision = validate("ExecutionDecision", decision)
        except ValidationError:
            raise HardwareError("UNEXECUTABLE") from None
        self._fresh_safe()
        caps = self.get_capabilities()
        if not caps.available or not caps.physical_digital or not caps.safety_gate_supported or not caps.guarded_run_supported:
            raise HardwareError("UNEXECUTABLE")
        if plan["station_id"] != self.station_id or decision["decision"] not in ("RUN_NORMAL", "RUN_GUARDED"):
            raise HardwareError("UNEXECUTABLE")
        if any(c["kind"] == "OPAQUE_PHYSICAL_COMPONENT" for c in self._topology["components"]) and decision["decision"] != "RUN_GUARDED":
            raise HardwareError("UNEXECUTABLE")
        if plan["runtime_safety_policy"]["watchdog_required"] is not True or plan["power_policy"]["guarded"] is not True:
            raise HardwareError("UNEXECUTABLE")
        if plan["power_policy"]["profile_id"] != caps.hardware_profile_version or plan["runtime_safety_policy"]["profile_id"] != caps.hardware_profile_version:
            raise HardwareError("PROTOCOL_MISMATCH")
        bindings = {b["endpoint_id"]: b for b in plan["endpoint_bindings"]}
        nodes = {n["node_id"] for n in self._topology["nodes"]}
        resources = {r["resource_id"]: r for r in caps.routing_resources}
        if any(b["node_id"] not in nodes for b in bindings.values()):
            raise HardwareError("UNEXECUTABLE")
        if {r["endpoint_id"] for r in plan["routing_allocations"]} != set(bindings):
            raise HardwareError("UNEXECUTABLE")
        for allocation in plan["routing_allocations"]:
            resource = resources.get(allocation["resource_id"])
            binding = bindings[allocation["endpoint_id"]]
            if resource is None or binding["role"] not in resource["roles"] or binding["node_id"] not in resource["node_ids"]:
                raise HardwareError("UNEXECUTABLE")
        self._invoke("prepare_execution", plan)
        self._plan, self._decision = plan, decision
        self._experiment_id = plan["experiment_id"]
        self._state = S.ROUTE_PREPARE
        return self._reply()

    @serialized
    def apply_routing(self):
        self._require_driver()
        self._require_state(S.ROUTE_PREPARE)
        self._fresh_safe()
        self._invoke("apply_routing", self._plan)
        self._state = S.GUARDED_POWER_UP
        return self._reply()

    @serialized
    def guarded_power_up(self):
        self._require_driver()
        self._require_state(S.GUARDED_POWER_UP)
        self._fresh_safe()
        self._invoke("guarded_power_up", self._plan["power_policy"])
        self._state = S.READY
        return self._reply()

    @serialized
    def arm_capture(self, configuration):
        self._require_driver()
        self._require_state(S.READY)
        try:
            configuration = validate("CaptureConfiguration", configuration)
        except ValidationError:
            raise HardwareError("UNEXECUTABLE") from None
        self._invoke("arm_capture", configuration)
        self._state = S.ARMED
        return self._reply()

    @serialized
    def start_execution(self):
        self._require_driver()
        self._require_state(S.ARMED)
        self._fresh_safe()
        self._invoke("start_execution")
        self._state = S.RUNNING
        return self._reply()

    @serialized
    def stop_execution(self):
        if self._driver is None:
            return self.enter_safe_state()
        self._state = S.STOPPING
        try:
            self._invoke("stop_execution")
        finally:
            result = self.enter_safe_state()
        return result

    @serialized
    def reset(self):
        return self.stop_execution()

    @serialized
    def read_capture(self):
        self._require_driver()
        self._require_state(S.RUNNING, S.CAPTURING, S.VERIFYING)
        self._state = S.CAPTURING
        return self._invoke("read_capture")

    @serialized
    def configure_clock(self, configuration):
        self._require_state(S.ROUTE_PREPARE, S.READY)
        return self._invoke("configure_clock", validate("ClockConfiguration", configuration))

    @serialized
    def configure_generator(self, configuration):
        self._require_state(S.ROUTE_PREPARE, S.READY)
        if configuration.get("channel", 0) > self.get_capabilities().generator_channels:
            raise HardwareError("UNEXECUTABLE")
        return self._invoke("configure_generator", validate("GeneratorConfiguration", configuration))

    @serialized
    def configure_trigger(self, configuration):
        self._require_state(S.READY)
        return self._invoke("configure_trigger", configuration)
