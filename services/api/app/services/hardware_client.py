"""Application RPC gateway. Imports wire bindings only, never physical station drivers."""
import json
import re
from time import monotonic

import grpc
from google.protobuf.empty_pb2 import Empty
from google.protobuf.wrappers_pb2 import BytesValue, UInt32Value
from contracts.boundary.models import PhysicalPreviewResult
from contracts.validation import validate
from contracts.capture_codec import decode_digital

_PREVIEW_RPC = '/cirnet.hardware.internal.v1.SimulatorPreview'
_PREVIEW_VERSION = 1

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
        try: return getattr(self._connect(),method)(request,timeout=max(self.timeout,15) if method=='StartExecution' else self.timeout)
        except grpc.RpcError as error:
            raise GatewayError("TIMEOUT" if error.code()==grpc.StatusCode.DEADLINE_EXCEEDED else "HARDWARE_UNAVAILABLE") from None

    def preview(self, graph):
        """Return None only when the connected Hardware lacks the private RPC."""
        deadline = monotonic() + self.timeout
        self._connect()
        # The private messages use no fields for Describe's request, then tag 1
        # for the version uint32 and each of the two JSON byte payloads.
        describe = self._channel.unary_unary(f'{_PREVIEW_RPC}/Describe',
            request_serializer=Empty.SerializeToString, response_deserializer=UInt32Value.FromString)
        try:
            version = describe(Empty(), timeout=max(0, deadline - monotonic())).value
        except grpc.RpcError as error:
            if error.code() == grpc.StatusCode.UNIMPLEMENTED:
                return None
            code = 'TIMEOUT' if error.code() == grpc.StatusCode.DEADLINE_EXCEEDED else 'HARDWARE_UNAVAILABLE'
            raise GatewayError(code) from None
        if version != _PREVIEW_VERSION:
            raise GatewayError('PROTOCOL_MISMATCH')

        try:
            request = BytesValue(value=json.dumps(graph, allow_nan=False).encode())
        except (TypeError, ValueError):
            raise GatewayError('INVALID_CONFIGURATION') from None
        preview = self._channel.unary_unary(f'{_PREVIEW_RPC}/Preview',
            request_serializer=BytesValue.SerializeToString, response_deserializer=BytesValue.FromString)
        try:
            response = preview(request, timeout=max(0, deadline - monotonic()))
        except grpc.RpcError as error:
            code = {
                grpc.StatusCode.DEADLINE_EXCEEDED: 'TIMEOUT',
                grpc.StatusCode.UNIMPLEMENTED: 'PROTOCOL_MISMATCH',
            }.get(error.code(), 'HARDWARE_UNAVAILABLE')
            raise GatewayError(code) from None

        try:
            body = json.loads(response.value)
            if isinstance(body, dict):
                if body.keys() == {'accepted', 'preview'} and body['accepted'] is True:
                    return PhysicalPreviewResult.model_validate(body['preview']).model_dump(exclude_unset=True)
                if body.keys() == {'accepted', 'code'} and body['accepted'] is False:
                    code = body['code']
                    if isinstance(code, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', code):
                        raise GatewayError(code)
        except (ValueError, RecursionError):
            raise GatewayError('PROTOCOL_MISMATCH') from None
        raise GatewayError('PROTOCOL_MISMATCH')

    def capabilities(self,station_id):
        from google.protobuf.json_format import MessageToDict
        self._connect()
        result=self._invoke("GetCapabilities",self.pb.Target(station_id=station_id))
        value=MessageToDict(result,preserving_proto_field_name=True,always_print_fields_with_no_presence=True)
        generator=value.get('instrument_capabilities',{}).get('generator',{})
        if generator.get('supported_waveforms')==[]: generator.pop('supported_waveforms')
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
        try:
            result = json.loads(reply.result_json)
            if method == 'read_capture':
                if not isinstance(result, dict) or type(result.get('available')) is not bool or 'samples' in result:
                    raise ValueError()
                if result['available']:
                    data = decode_digital(reply.capture_payload)
                    if (type(result.get('duration_ns')) is not int or type(result.get('sample_count')) is not int
                            or result['duration_ns'] != data['duration_ns'] or result['sample_count'] != len(data['samples'])):
                        raise ValueError()
                    result.update(data)
                else:
                    if reply.capture_payload: raise ValueError()
                    result['samples'] = []
            elif reply.capture_payload:
                raise ValueError()
            return result
        except (ValueError,TypeError): raise GatewayError("PROTOCOL_MISMATCH") from None

    def close(self):
        if self._channel: self._channel.close()
        self._channel=self._stub=None
