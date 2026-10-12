from dataclasses import asdict, dataclass, field
from typing import Any

@dataclass(frozen=True)
class BreadboardCapability:
    id: str
    model: str = "generic-full-size"

@dataclass(frozen=True)
class StationCapabilities:
    station_id: str
    mode: str
    available: bool
    schema_version: str = "1.0"
    breadboards: tuple[BreadboardCapability, ...] = field(default_factory=tuple)
    instruments: dict[str, Any] = field(default_factory=dict)
    virtual_digital: bool = False
    virtual_analog: bool = False
    physical_digital: bool = False
    physical_analog_routing: bool = False
    physical_execution_slots: int = 0
    topology_scan_supported: bool = False
    safety_gate_supported: bool = False
    guarded_run_supported: bool = False
    component_resolution_modes: tuple[str, ...] = ()
    logic_analyzer_channels: int = 0
    oscilloscope_channels: int = 0
    generator_channels: int = 0
    routing_resources: tuple[dict, ...] = ()
    hardware_rpc_version: str = "2.0"
    fpga_protocol_version: str = "UNAVAILABLE"
    firmware_version: str = "UNAVAILABLE"
    hardware_profile_version: str = "UNAVAILABLE"

    @property
    def protocol_versions(self):
        return {"hardware_rpc": self.hardware_rpc_version, "fpga": self.fpga_protocol_version}

    def to_dict(self):
        result = asdict(self)
        for key in ("breadboards", "routing_resources", "component_resolution_modes"):
            result[key] = list(result[key])
        return result
