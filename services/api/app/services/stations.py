from copy import deepcopy
from contracts.validation import validate
from app.services.hardware_client import GatewayError

class StationService:
    def __init__(self,gateway,manager):
        self.gateway,self.manager=gateway,manager
        self.targets={"virtual-station-01":"simulation","physical-station-01":"hardware"}

    def capabilities(self,station_id):
        if station_id not in self.targets: raise KeyError("STATION_NOT_FOUND")
        try: value=validate("StationCapabilities",self.gateway.capabilities(station_id))
        except GatewayError:
            value={"schema_version":"1.0","station_id":station_id,"mode":self.targets[station_id],
                "available":False,"virtual_digital":False,"virtual_analog":False,"physical_digital":False,
                "physical_analog_routing":False,"physical_execution_slots":0,"topology_scan_supported":False,
                "safety_gate_supported":False,"guarded_run_supported":False,"component_resolution_modes":[],
                "logic_analyzer_channels":0,"oscilloscope_channels":0,"generator_channels":0,"routing_resources":[],
                "hardware_rpc_version":"2.0","fpga_protocol_version":"UNAVAILABLE","firmware_version":"UNAVAILABLE",
                "hardware_profile_version":"UNAVAILABLE"}
        if any(l["quarantined"] for l in self.manager.repo.leases() if l["station_id"]==station_id):
            value=deepcopy(value); value["available"]=False
        # Public capability summary excludes physical node-to-resource mappings.
        value=deepcopy(value)
        for resource in value['routing_resources']: resource['node_ids']=[]
        return value

    def descriptor(self,station_id):
        caps=self.capabilities(station_id)
        busy=any(l["station_id"]==station_id for l in self.manager.repo.leases())
        return {"station_id":station_id,"mode":caps["mode"],
                "state":"unavailable" if not caps["available"] else "busy" if busy else "ready","capabilities":caps}

    def list(self):
        return [self.descriptor(station_id) for station_id in self.targets]
