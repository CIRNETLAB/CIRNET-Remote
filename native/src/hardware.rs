use crate::stop_probe::{RpcTrace, StopProbe, StopSource};
use cirnet_contracts_native::{capture, wire_json};
use hyper_util::rt::TokioIo;
use prost::Message;
use serde_json::Value;
use std::{
    error::Error,
    fmt,
    net::{Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};
use tokio::{
    net::TcpStream,
    time::{Instant, timeout_at},
};
use tonic::{
    Code, Request, Status,
    client::Grpc,
    transport::{Channel, Endpoint},
};
use tonic_prost::ProstCodec;

pub use cirnet_contracts_native::hardware_v2 as pb;

mod canonical {
    tonic::include_proto!("cirnet.hardware.v2");
}

mod legacy {
    tonic::include_proto!("netcircuit.hardware.v2");
}

const CONTROL_TIMEOUT: Duration = Duration::from_secs(3);
const START_TIMEOUT: Duration = Duration::from_secs(15);
const PREVIEW_VERSION: u32 = 1;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GatewayError {
    pub code: String,
}

impl GatewayError {
    pub fn new(code: impl Into<String>) -> Self {
        Self { code: code.into() }
    }

    fn rpc(status: Status) -> Self {
        let mut source = status.source();
        while let Some(error) = source {
            if error.is::<tonic::TimeoutExpired>() {
                return Self::new("TIMEOUT");
            }
            source = error.source();
        }
        Self::new(if status.code() == Code::DeadlineExceeded {
            "TIMEOUT"
        } else {
            "HARDWARE_UNAVAILABLE"
        })
    }
}

impl fmt::Display for GatewayError {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        out.write_str(&self.code)
    }
}

impl Error for GatewayError {}

#[derive(Clone)]
pub struct HardwareClient {
    channel: Channel,
    stop_probe: Option<Arc<StopProbe>>,
}

#[derive(Clone)]
pub enum HardwareCall {
    EnterSafeState(pb::Target),
    ScanTopology(pb::Target),
    ReadRuntimeSafety(pb::Target),
    PrepareExecution(pb::PrepareExecutionRequest),
    ApplyRouting(pb::Target),
    GuardedPowerUp(pb::Target),
    ConfigureInstrument(pb::ConfigureInstrumentRequest),
    ConfigureVirtualCircuit(pb::ConfigureVirtualRequest),
    ArmCapture(pb::ArmCaptureRequest),
    StartExecution(pb::Target),
    StopExecution(pb::Target),
    ReadCapture(pb::Target),
    Reset(pb::Target),
}

#[derive(Debug)]
pub struct ControlReply {
    pub state: String,
    pub result: Value,
    pub capture_payload: Vec<u8>,
}

macro_rules! call_operation {
    ($client:ident, $operation:expr, $deadline:expr, $trace:expr) => {
        match $operation {
            HardwareCall::EnterSafeState(body) => {
                $client.enter_safe_state(request(body, $deadline)?).await
            }
            HardwareCall::ScanTopology(body) => {
                $client.scan_topology(request(body, $deadline)?).await
            }
            HardwareCall::ReadRuntimeSafety(body) => {
                $client.read_runtime_safety(request(body, $deadline)?).await
            }
            HardwareCall::PrepareExecution(body) => {
                $client.prepare_execution(request(body, $deadline)?).await
            }
            HardwareCall::ApplyRouting(body) => {
                $client.apply_routing(request(body, $deadline)?).await
            }
            HardwareCall::GuardedPowerUp(body) => {
                $client.guarded_power_up(request(body, $deadline)?).await
            }
            HardwareCall::ConfigureInstrument(body) => {
                $client
                    .configure_instrument(request(body, $deadline)?)
                    .await
            }
            HardwareCall::ConfigureVirtualCircuit(body) => {
                $client
                    .configure_virtual_circuit(request(body, $deadline)?)
                    .await
            }
            HardwareCall::ArmCapture(body) => $client.arm_capture(request(body, $deadline)?).await,
            HardwareCall::StartExecution(body) => {
                $client
                    .start_execution(probed_request(body, $deadline, $trace)?)
                    .await
            }
            HardwareCall::StopExecution(body) => {
                $client
                    .stop_execution(probed_request(body, $deadline, $trace)?)
                    .await
            }
            HardwareCall::ReadCapture(body) => {
                $client.read_capture(request(body, $deadline)?).await
            }
            HardwareCall::Reset(body) => $client.reset(request(body, $deadline)?).await,
        }
    };
}

impl HardwareClient {
    /// Construct inside the Remote Tokio runtime. The connection is opened on demand.
    pub fn new(target: &str) -> Result<Self, GatewayError> {
        let invalid = || GatewayError::new("INVALID_CONFIGURATION");
        if let Ok(address) = target.parse::<SocketAddr>() {
            if !address.ip().is_loopback() || address.port() == 0 {
                return Err(invalid());
            }
            let endpoint =
                Endpoint::from_shared(format!("http://{address}")).map_err(|_| invalid())?;
            return Ok(Self {
                channel: endpoint.connect_lazy(),
                stop_probe: None,
            });
        }
        if let Some(port) = target
            .strip_prefix("localhost:")
            .and_then(|port| port.parse::<u16>().ok())
        {
            if port == 0 {
                return Err(invalid());
            }
            let addresses = [
                SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
                SocketAddr::from((Ipv6Addr::LOCALHOST, port)),
            ];
            let channel = Endpoint::from_static("http://localhost").connect_with_connector_lazy(
                tower::service_fn(move |_| async move {
                    TcpStream::connect(&addresses[..]).await.map(TokioIo::new)
                }),
            );
            return Ok(Self {
                channel,
                stop_probe: None,
            });
        }
        #[cfg(unix)]
        if let Some(path) = target.strip_prefix("unix:") {
            let path = std::path::PathBuf::from(path);
            if !path.is_absolute() {
                return Err(invalid());
            }
            let channel = Endpoint::from_static("http://localhost").connect_with_connector_lazy(
                tower::service_fn(move |_| {
                    let path = path.clone();
                    async move {
                        tokio::net::UnixStream::connect(path)
                            .await
                            .map(TokioIo::new)
                    }
                }),
            );
            return Ok(Self {
                channel,
                stop_probe: None,
            });
        }
        Err(invalid())
    }

    pub async fn capabilities(
        &self,
        station_id: &str,
    ) -> Result<pb::StationCapabilities, GatewayError> {
        let target = pb::Target {
            station_id: station_id.into(),
            experiment_id: String::new(),
        };
        let deadline = Instant::now() + CONTROL_TIMEOUT;
        let response = timeout_at(deadline, async {
            let mut client = canonical::hardware_service_client::HardwareServiceClient::new(
                self.channel.clone(),
            );
            match client
                .get_capabilities(request(target.clone(), deadline)?)
                .await
            {
                Err(error) if error.code() == Code::Unimplemented => {
                    let mut legacy = legacy::hardware_service_client::HardwareServiceClient::new(
                        self.channel.clone(),
                    );
                    legacy.get_capabilities(request(target, deadline)?).await
                }
                result => result,
            }
        })
        .await
        .map_err(|_| GatewayError::new("TIMEOUT"))?
        .map_err(GatewayError::rpc)?
        .into_inner();
        if response.hardware_rpc_version != "2.0" || response.station_id != station_id {
            return Err(GatewayError::new("PROTOCOL_MISMATCH"));
        }
        Ok(response)
    }

    #[doc(hidden)]
    pub fn with_stop_probe(mut self, probe: Option<Arc<StopProbe>>) -> Self {
        self.stop_probe = probe;
        self
    }

    pub(crate) fn stop_probe(&self) -> Option<&StopProbe> {
        self.stop_probe.as_deref()
    }

    pub async fn call(&self, operation: HardwareCall) -> Result<ControlReply, GatewayError> {
        self.call_probed(operation, StopSource::Sweep).await
    }

    pub(crate) async fn call_stop(
        &self,
        target: pb::Target,
        source: StopSource,
    ) -> Result<ControlReply, GatewayError> {
        self.call_probed(HardwareCall::StopExecution(target), source)
            .await
    }

    async fn call_probed(
        &self,
        operation: HardwareCall,
        source: StopSource,
    ) -> Result<ControlReply, GatewayError> {
        let mut trace = match (&self.stop_probe, &operation) {
            (Some(probe), HardwareCall::StartExecution(target)) => {
                Some(probe.start(&target.experiment_id).await?)
            }
            (Some(probe), HardwareCall::StopExecution(target)) => {
                Some(probe.stop(&target.experiment_id, source))
            }
            _ => None,
        };
        let read_capture = matches!(&operation, HardwareCall::ReadCapture(_));
        let deadline = Instant::now()
            + if matches!(&operation, HardwareCall::StartExecution(_)) {
                START_TIMEOUT
            } else {
                CONTROL_TIMEOUT
            };
        let reply = timeout_at(deadline, async {
            let mut client = canonical::hardware_service_client::HardwareServiceClient::new(
                self.channel.clone(),
            );
            match call_operation!(client, operation.clone(), deadline, &mut trace) {
                Err(error) if error.code() == Code::Unimplemented => {
                    let mut legacy = legacy::hardware_service_client::HardwareServiceClient::new(
                        self.channel.clone(),
                    );
                    call_operation!(legacy, operation, deadline, &mut trace)
                }
                result => result,
            }
        })
        .await;
        if let Some(trace) = trace {
            trace.returned(reply.as_ref().ok().and_then(|reply| reply.as_ref().ok()));
        }
        let reply = reply
            .map_err(|_| GatewayError::new("TIMEOUT"))?
            .map_err(GatewayError::rpc)?
            .into_inner();
        control_reply(reply, read_capture)
    }

    pub async fn preview(&self, graph: &Value) -> Result<Option<Value>, GatewayError> {
        let deadline = Instant::now() + CONTROL_TIMEOUT;
        timeout_at(deadline, async {
            let mut rpc = Grpc::new(self.channel.clone());
            let version: DescribeReply = match private_call(
                &mut rpc,
                DescribeRequest {},
                "/cirnet.hardware.internal.v1.SimulatorPreview/Describe",
                deadline,
            )
            .await
            {
                Err(error) if error.code() == Code::Unimplemented => return Ok(None),
                result => result.map_err(GatewayError::rpc)?,
            };
            if version.version != PREVIEW_VERSION {
                return Err(GatewayError::new("PROTOCOL_MISMATCH"));
            }
            let payload = PreviewPayload {
                json: serde_json::to_vec(graph)
                    .map_err(|_| GatewayError::new("INVALID_CONFIGURATION"))?,
            };
            let reply: PreviewPayload = private_call(
                &mut rpc,
                payload,
                "/cirnet.hardware.internal.v1.SimulatorPreview/Preview",
                deadline,
            )
            .await
            .map_err(|error| {
                if error.code() == Code::Unimplemented {
                    GatewayError::new("PROTOCOL_MISMATCH")
                } else {
                    GatewayError::rpc(error)
                }
            })?;
            preview_payload(&reply.json).map(Some)
        })
        .await
        .map_err(|_| GatewayError::new("TIMEOUT"))?
    }
}

fn request<T>(body: T, deadline: Instant) -> Result<Request<T>, Status> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return Err(Status::deadline_exceeded("Hardware RPC deadline"));
    }
    let mut request = Request::new(body);
    request.set_timeout(remaining);
    Ok(request)
}

fn probed_request<T>(
    body: T,
    deadline: Instant,
    trace: &mut Option<RpcTrace<'_>>,
) -> Result<Request<T>, Status> {
    let mut request = request(body, deadline)?;
    if let Some(trace) = trace {
        trace.before_send(&mut request)?;
    }
    Ok(request)
}

async fn private_call<T, R>(
    rpc: &mut Grpc<Channel>,
    body: T,
    path: &'static str,
    deadline: Instant,
) -> Result<R, Status>
where
    T: Message + Send + Sync + 'static,
    R: Message + Default + Send + Sync + 'static,
{
    rpc.ready()
        .await
        .map_err(|_| Status::unavailable("Hardware unavailable"))?;
    let path = http::uri::PathAndQuery::from_static(path);
    rpc.unary(request(body, deadline)?, path, ProstCodec::default())
        .await
        .map(tonic::Response::into_inner)
}

#[derive(Clone, PartialEq, Message)]
struct DescribeRequest {}

#[derive(Clone, PartialEq, Message)]
struct DescribeReply {
    #[prost(uint32, tag = "1")]
    version: u32,
}

#[derive(Clone, PartialEq, Message)]
struct PreviewPayload {
    #[prost(bytes = "vec", tag = "1")]
    json: Vec<u8>,
}

fn preview_payload(payload: &[u8]) -> Result<Value, GatewayError> {
    let invalid = || GatewayError::new("PROTOCOL_MISMATCH");
    let body = wire_json::parse(payload).map_err(|_| invalid())?;
    let mut object = match body {
        Value::Object(object) if object.len() == 2 => object,
        _ => return Err(invalid()),
    };
    match object.remove("accepted") {
        Some(Value::Bool(true)) => object
            .remove("preview")
            .filter(Value::is_object)
            .ok_or_else(invalid),
        Some(Value::Bool(false)) => match object.remove("code") {
            Some(Value::String(code)) if public_code(&code) => Err(GatewayError::new(code)),
            _ => Err(invalid()),
        },
        _ => Err(invalid()),
    }
}

fn public_code(code: &str) -> bool {
    let mut bytes = code.bytes();
    code.len() <= 64
        && bytes.next().is_some_and(|byte| byte.is_ascii_uppercase())
        && bytes.all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
}

fn control_reply(
    reply: pb::OperationReply,
    read_capture: bool,
) -> Result<ControlReply, GatewayError> {
    let invalid = || GatewayError::new("PROTOCOL_MISMATCH");
    if !reply.accepted {
        let code = pb::ErrorCode::try_from(reply.code).map_err(|_| invalid())?;
        return Err(GatewayError::new(code.as_str_name()));
    }
    let result = wire_json::parse(&reply.result_json).map_err(|_| invalid())?;
    if !result.is_object() {
        return Err(invalid());
    }
    if read_capture {
        if result.get("samples").is_some() {
            return Err(invalid());
        }
        match result.get("available").and_then(Value::as_bool) {
            Some(true) => {
                let decoded =
                    capture::decode_digital(&reply.capture_payload).map_err(|_| invalid())?;
                if result["duration_ns"].as_u64() != decoded["duration_ns"].as_u64()
                    || result["sample_count"].as_u64()
                        != decoded["samples"]
                            .as_array()
                            .map(|samples| samples.len() as u64)
                {
                    return Err(invalid());
                }
            }
            Some(false) if reply.capture_payload.is_empty() => {}
            _ => return Err(invalid()),
        }
    } else if !reply.capture_payload.is_empty() {
        return Err(invalid());
    }
    Ok(ControlReply {
        state: reply.state,
        result,
        capture_payload: reply.capture_payload,
    })
}

#[cfg(test)]
#[path = "../tests/preview_hardware.rs"]
mod tests;
