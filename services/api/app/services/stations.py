from copy import deepcopy
from contracts.validation import validate
from app.services.hardware_client import GatewayError

class StationService:
    def __init__(self,gateway,manager):
        self.gateway,self.manager=gateway,manager
        self.targets={"virtual-station-01":"simulation","physical-station-01":"hardware"}

    def _observe(self,station_id):
        if station_id not in self.targets: raise KeyError("STATION_NOT_FOUND")
        try: value=validate("StationCapabilities",self.gateway.capabilities(station_id))
        except GatewayError:
            value={"schema_version":"1.0","station_id":station_id,"mode":self.targets[station_id],
                "available":False,"virtual_digital":False,"virtual_analog":False,"physical_digital":False,
                "physical_analog_routing":False,"physical_execution_slots":0,"topology_scan_supported":False,
                "safety_gate_supported":False,"guarded_run_supported":False,"component_resolution_modes":[],
                'instrument_capabilities':{name:{'channels':0,'runtime_reconfiguration_supported':False} for name in ('logic_analyzer','oscilloscope','generator')},'routing_resources':[],
                "hardware_rpc_version":"2.0","fpga_protocol_version":"UNAVAILABLE","firmware_version":"UNAVAILABLE",
                "hardware_profile_version":"UNAVAILABLE"}
        return value

    def _public_capabilities(self,station_id,value,leases):
        # Public capability summary excludes physical node-to-resource mappings.
        value=deepcopy(value)
        if any(l["quarantined"] for l in leases if l["station_id"]==station_id):
            value["available"]=False
        for resource in value['routing_resources']: resource['node_ids']=[]
        return value

    def capabilities(self,station_id):
        value=self._observe(station_id)
        return self._public_capabilities(station_id,value,self.manager.repo.leases())

    def _descriptor(self,station_id,value,leases):
        caps=self._public_capabilities(station_id,value,leases)
        busy=any(l["station_id"]==station_id for l in leases)
        return {"station_id":station_id,"mode":caps["mode"],
                "state":"unavailable" if not caps["available"] else "busy" if busy else "ready","capabilities":caps}

    def descriptor(self,station_id):
        value=self._observe(station_id)
        return self._descriptor(station_id,value,self.manager.repo.leases())

    def list(self):
        observations=[(station_id,self._observe(station_id)) for station_id in self.targets]
        leases=self.manager.repo.leases()
        return [self._descriptor(station_id,value,leases) for station_id,value in observations]
