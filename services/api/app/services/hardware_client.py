"""Application RPC gateway. Imports wire bindings only, never physical station drivers."""
import json
import grpc
from contracts.validation import validate

class GatewayError(RuntimeError):
    def __init__(self,code):
        self.code=code
        super().__init__(code)

class HardwareServiceClient:
    def __init__(self,target="127.0.0.1:50051",timeout=3):
        import ipaddress
        if not target.startswith("unix:"):
            host=target.rsplit(":",1)[0].strip("[]")
            if host!="localhost" and not ipaddress.ip_address(host).is_loopback:
                raise ValueError("Hardware service target must be local")
        self.target,self.timeout=target,timeout
        self._channel=None
        self._stub=None

    def _connect(self):
        if self._stub is None:
            try:
                from contracts.generated import rpc_v2_pb2 as pb
                from contracts.generated import rpc_v2_pb2_grpc as rpc
            except ImportError:
                raise GatewayError("HARDWARE_UNAVAILABLE") from None
            self.pb=pb
            self._channel=grpc.insecure_channel(self.target)
            self._stub=rpc.HardwareServiceStub(self._channel)
        return self._stub

    def _invoke(self,method,request):
        try: return getattr(self._connect(),method)(request,timeout=self.timeout)
        except grpc.RpcError as error:
            raise GatewayError("TIMEOUT" if error.code()==grpc.StatusCode.DEADLINE_EXCEEDED else "HARDWARE_UNAVAILABLE") from None

    def capabilities(self,station_id):
        from google.protobuf.json_format import MessageToDict
        self._connect()
        result=self._invoke("GetCapabilities",self.pb.Target(station_id=station_id))
        value=MessageToDict(result,preserving_proto_field_name=True,always_print_fields_with_no_presence=True)
        value=validate("StationCapabilities",value)
        if value["hardware_rpc_version"]!="2.0": raise GatewayError("PROTOCOL_MISMATCH")
        return value

    def call(self,station_id,experiment_id,method,**kwargs):
        from google.protobuf.json_format import ParseDict
        self._connect()
        target=self.pb.Target(station_id=station_id,experiment_id=experiment_id)
        mapping={"enter_safe_state":"EnterSafeState","scan_topology":"ScanTopology","read_runtime_safety":"ReadRuntimeSafety",
                 "apply_routing":"ApplyRouting","guarded_power_up":"GuardedPowerUp","start_execution":"StartExecution",
                 "stop_execution":"StopExecution","read_capture":"ReadCapture","reset":"Reset"}
        if method=="prepare_execution":
            request=self.pb.PrepareExecutionRequest(target=target,
                plan=ParseDict(validate("InstrumentationExecutionPlan",kwargs["plan"]),self.pb.InstrumentationExecutionPlan()),
                decision=ParseDict(validate("ExecutionDecision",kwargs["decision"]),self.pb.ExecutionDecision()))
            name="PrepareExecution"
        elif method=="apply_circuit":
            request=self.pb.ConfigureVirtualRequest(target=target,design_graph_json=json.dumps(kwargs["circuit_graph"],allow_nan=False).encode())
            name="ConfigureVirtualCircuit"
        elif method=="arm_capture":
            request=self.pb.ArmCaptureRequest(target=target,configuration=ParseDict(kwargs["configuration"],self.pb.CaptureConfiguration()))
            name="ArmCapture"
        elif method=="configure_instrument":
            request=self.pb.ConfigureInstrumentRequest(target=target,instrument=kwargs["instrument"])
            config_message=getattr(request,kwargs["instrument"])
            ParseDict(kwargs["configuration"],config_message)
            name="ConfigureInstrument"
        else:
            name=mapping[method]; request=target
        reply=self._invoke(name,request)
        if not reply.accepted: raise GatewayError(self.pb.ErrorCode.Name(reply.code))
        try: return json.loads(reply.result_json)
        except (ValueError,TypeError): raise GatewayError("PROTOCOL_MISMATCH") from None

    def close(self):
        if self._channel: self._channel.close()
        self._channel=self._stub=None
