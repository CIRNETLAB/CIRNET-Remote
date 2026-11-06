use super::*;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::time::Duration;
use std::{path::PathBuf, process::Stdio};
use tokio::io::{AsyncBufReadExt, BufReader};

#[tokio::test]
async fn hardware_target_rejects_non_loopback_and_uri_injection() {
    for target in [
        "example.net:50051",
        "0.0.0.0:50051",
        "[::]:50051",
        "127.0.0.1:50051/foo",
        "http://localhost:50051",
    ] {
        let error = HardwareClient::new(target)
            .err()
            .expect("invalid target must fail");
        assert_eq!(error.code, "INVALID_CONFIGURATION", "{target}");
    }
    for target in ["127.0.0.1:50051", "[::1]:50051", "localhost:50051"] {
        assert!(HardwareClient::new(target).is_ok(), "{target}");
    }
}

#[tokio::test]
#[ignore = "requires pinned Stage 3 R2 Hardware and Stage 1 C++ worker"]
async fn exact_r2_routes_preview_and_absent_physical_hardware() {
    let artifact = |name, expected| {
        let path = PathBuf::from(std::env::var_os(name).expect("select pinned artifact"));
        assert!(path.is_absolute());
        assert_eq!(
            format!("{:x}", Sha256::digest(std::fs::read(&path).unwrap())),
            expected
        );
        path
    };
    let hardware = artifact(
        "CIRNET_NATIVE_STAGE3_HARDWARE",
        "22d3d0a1c57aad0d2d01d512f3a890149566bc799228559b6943843cba1e85e6",
    );
    artifact(
        "CIRNET_SIM_CPP_WORKER",
        "c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf",
    );
    let contracts = PathBuf::from(std::env::var_os("CIRNET_CONTRACTS_ROOT").unwrap());
    let registry = cirnet_contracts_native::validation::Registry::load(&contracts).unwrap();
    let mut child = tokio::process::Command::new(hardware)
        .args(["--listen", "127.0.0.1:0", "--exit-on-stdin-eof"])
        .env("CIRNET_SIMULATION_WORKERS", "1")
        .env("CIRNET_HARDWARE_START_RENDEZVOUS", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
    let ready = tokio::time::timeout(Duration::from_secs(15), lines.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let address = ready.strip_prefix("CIRNET_HARDWARE_READY=").unwrap();
    let client = HardwareClient::new(address).unwrap();
    let physical = client.capabilities("physical-station-01").await.unwrap();
    assert_eq!(physical.hardware_rpc_version, "2.0");
    assert_eq!(physical.physical_execution_slots, 0);
    let graph = json!({
        "schema_version":"1.1", "circuit_id":"powered-preview",
        "modules":[{"id":"PS","type":"DC_SUPPLY"},{"id":"U","type":"SN74HC08N"}],
        "connections":[{"source":"PS.PLUS","destination":"U.14"},{"source":"PS.MINUS","destination":"U.7"},
                       {"source":"PS.PLUS","destination":"U.1"},{"source":"PS.PLUS","destination":"U.2"}],
    });
    let first = crate::preview::physical_preview(
        &registry,
        &client,
        &graph,
        crate::preview::GraphVersion::V1,
    )
    .await
    .unwrap();
    let second = crate::preview::physical_preview(
        &registry,
        &client,
        &graph,
        crate::preview::GraphVersion::V2,
    )
    .await
    .unwrap();
    assert_eq!(first, second);
    assert_eq!(first["device_states"]["U"]["state"], "POWERED");
    assert_eq!(first["pin_values"]["U.3"], 1);
    assert_eq!(first["pin_values"]["U.6"], "X");
    assert_eq!(first["provenance"], "simulation_preview");
    let unavailable = client
        .call(HardwareCall::StopExecution(pb::Target {
            station_id: "physical-station-01".into(),
            experiment_id: "unavailable-proof".into(),
        }))
        .await
        .unwrap_err();
    assert_eq!(unavailable.code, "HARDWARE_UNAVAILABLE");
    assert_virtual_run_and_stop(&client).await;
    drop(child.stdin.take());
    assert!(
        tokio::time::timeout(Duration::from_secs(8), child.wait())
            .await
            .unwrap()
            .unwrap()
            .success()
    );
}

use http::{Request as HttpRequest, Response as HttpResponse};
use prost::Message;
use std::{
    convert::Infallible,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    task::{Context, Poll},
};
use tokio::net::TcpListener;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::{
    Code, Request, Response, Status,
    body::Body,
    codegen::{BoxFuture, Service},
    server::{Grpc as ServerGrpc, NamedService, UnaryService},
    transport::Server,
};
use tonic_prost::ProstCodec;

struct Fixed<T> {
    reply: Option<Result<T, Status>>,
    delay: Duration,
}

impl<M, T: Send + 'static> UnaryService<M> for Fixed<T> {
    type Response = T;
    type Future = BoxFuture<Response<T>, Status>;

    fn call(&mut self, _request: Request<M>) -> Self::Future {
        let reply = self.reply.take().unwrap();
        let delay = self.delay;
        Box::pin(async move {
            tokio::time::sleep(delay).await;
            reply.map(Response::new)
        })
    }
}

#[derive(Clone, PartialEq, Message)]
struct Empty {}

#[derive(Clone, PartialEq, Message)]
struct Version {
    #[prost(uint32, tag = "1")]
    version: u32,
}

#[derive(Clone, PartialEq, Message)]
struct Payload {
    #[prost(bytes = "vec", tag = "1")]
    json: Vec<u8>,
}

#[derive(Clone)]
struct PreviewPeer {
    describe: Result<Version, Code>,
    preview: Result<Payload, Code>,
    delay: Duration,
    calls: Arc<AtomicUsize>,
}

impl NamedService for PreviewPeer {
    const NAME: &'static str = "cirnet.hardware.internal.v1.SimulatorPreview";
}

impl Service<HttpRequest<Body>> for PreviewPeer {
    type Response = HttpResponse<Body>;
    type Error = Infallible;
    type Future = BoxFuture<Self::Response, Self::Error>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, request: HttpRequest<Body>) -> Self::Future {
        self.calls.fetch_add(1, Ordering::Relaxed);
        let peer = self.clone();
        Box::pin(async move {
            if request.uri().path().ends_with("/Describe") {
                let reply: Fixed<Version> = Fixed {
                    reply: Some(peer.describe.map_err(|code| Status::new(code, "private"))),
                    delay: peer.delay,
                };
                let mut grpc: ServerGrpc<ProstCodec<Version, Empty>> =
                    ServerGrpc::new(ProstCodec::default());
                Ok(grpc.unary(reply, request).await)
            } else {
                let reply: Fixed<Payload> = Fixed {
                    reply: Some(peer.preview.map_err(|code| Status::new(code, "private"))),
                    delay: peer.delay,
                };
                let mut grpc: ServerGrpc<ProstCodec<Payload, Payload>> =
                    ServerGrpc::new(ProstCodec::default());
                Ok(grpc.unary(reply, request).await)
            }
        })
    }
}

async fn preview_peer(peer: PreviewPeer) -> (HardwareClient, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = HardwareClient::new(&listener.local_addr().unwrap().to_string()).unwrap();
    let task = tokio::spawn(async move {
        Server::builder()
            .add_service(peer)
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await
            .unwrap()
    });
    (client, task)
}

#[tokio::test]
async fn preview_negotiation_only_allows_absent_describe_fallback() {
    for (version, result, expected, count) in [
        (
            Err(Code::Unimplemented),
            Ok(Payload { json: vec![] }),
            None,
            1,
        ),
        (
            Ok(Version { version: 2 }),
            Ok(Payload { json: vec![] }),
            Some("PROTOCOL_MISMATCH"),
            1,
        ),
        (
            Ok(Version { version: 1 }),
            Err(Code::Unimplemented),
            Some("PROTOCOL_MISMATCH"),
            2,
        ),
        (
            Ok(Version { version: 1 }),
            Ok(Payload {
                json: b"{\"accepted\":false,\"code\":\"INVALID_CIRCUIT\"}".to_vec(),
            }),
            Some("INVALID_CIRCUIT"),
            2,
        ),
        (
            Ok(Version { version: 1 }),
            Ok(Payload {
                json: b"{\"accepted\":false,\"code\":\"private details\"}".to_vec(),
            }),
            Some("PROTOCOL_MISMATCH"),
            2,
        ),
        (
            Ok(Version { version: 1 }),
            Ok(Payload {
                json: b"{\"accepted\":true,\"preview\":[]}".to_vec(),
            }),
            Some("PROTOCOL_MISMATCH"),
            2,
        ),
    ] {
        let calls = Arc::new(AtomicUsize::new(0));
        let (client, server) = preview_peer(PreviewPeer {
            describe: version,
            preview: result,
            delay: Duration::ZERO,
            calls: calls.clone(),
        })
        .await;
        let actual = client.preview(&json!({})).await;
        if let Some(expected) = expected {
            assert_eq!(actual.unwrap_err().code, expected);
        } else {
            assert_eq!(actual.unwrap(), None);
        }
        assert_eq!(calls.load(Ordering::Relaxed), count);
        server.abort();
    }
}

#[tokio::test]
async fn preview_uses_one_deadline_for_describe_and_execution() {
    let calls = Arc::new(AtomicUsize::new(0));
    let (client, server) = preview_peer(PreviewPeer {
        describe: Ok(Version { version: 1 }),
        preview: Ok(Payload {
            json: b"{\"accepted\":true,\"preview\":{}}".to_vec(),
        }),
        delay: Duration::from_secs(2),
        calls: calls.clone(),
    })
    .await;
    let error = client.preview(&json!({})).await.unwrap_err();
    assert_eq!(error.code, "TIMEOUT");
    assert_eq!(calls.load(Ordering::Relaxed), 2);
    server.abort();
}

#[derive(Clone)]
struct CapabilitiesPeer<const LEGACY: bool> {
    reply: Result<pb::StationCapabilities, Code>,
    calls: Arc<AtomicUsize>,
}

impl<const LEGACY: bool> NamedService for CapabilitiesPeer<LEGACY> {
    const NAME: &'static str = if LEGACY {
        pb::LEGACY_SERVICE
    } else {
        pb::CANONICAL_SERVICE
    };
}

impl<const LEGACY: bool> Service<HttpRequest<Body>> for CapabilitiesPeer<LEGACY> {
    type Response = HttpResponse<Body>;
    type Error = Infallible;
    type Future = BoxFuture<Self::Response, Self::Error>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, request: HttpRequest<Body>) -> Self::Future {
        self.calls.fetch_add(1, Ordering::Relaxed);
        let reply = Fixed {
            reply: Some(
                self.reply
                    .clone()
                    .map_err(|code| Status::new(code, "private")),
            ),
            delay: Duration::ZERO,
        };
        Box::pin(async move {
            let mut grpc: ServerGrpc<ProstCodec<pb::StationCapabilities, pb::Target>> =
                ServerGrpc::new(ProstCodec::default());
            Ok(grpc.unary(reply, request).await)
        })
    }
}

#[tokio::test]
async fn canonical_routing_falls_back_only_for_unimplemented() {
    for (canonical_error, legacy_calls) in [(Code::Unimplemented, 1), (Code::Unavailable, 0)] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let client = HardwareClient::new(&listener.local_addr().unwrap().to_string()).unwrap();
        let canonical_calls = Arc::new(AtomicUsize::new(0));
        let legacy_count = Arc::new(AtomicUsize::new(0));
        let canonical = CapabilitiesPeer::<false> {
            reply: Err(canonical_error),
            calls: canonical_calls.clone(),
        };
        let legacy = CapabilitiesPeer::<true> {
            reply: Ok(pb::StationCapabilities {
                station_id: "virtual-station-01".into(),
                hardware_rpc_version: "2.0".into(),
                ..Default::default()
            }),
            calls: legacy_count.clone(),
        };
        let task = tokio::spawn(async move {
            Server::builder()
                .add_service(canonical)
                .add_service(legacy)
                .serve_with_incoming(TcpListenerStream::new(listener))
                .await
                .unwrap()
        });
        let actual = client.capabilities("virtual-station-01").await;
        if legacy_calls == 1 {
            assert_eq!(actual.unwrap().station_id, "virtual-station-01");
        } else {
            assert_eq!(actual.unwrap_err().code, "HARDWARE_UNAVAILABLE");
        }
        assert_eq!(canonical_calls.load(Ordering::Relaxed), 1);
        assert_eq!(legacy_count.load(Ordering::Relaxed), legacy_calls);
        task.abort();
    }
}

async fn assert_virtual_run_and_stop(client: &HardwareClient) {
    let target = pb::Target {
        station_id: "virtual-station-01".into(),
        experiment_id: "remote-rust-preview-audit".into(),
    };
    let graph = json!({
        "schema_version":"1.0", "circuit_id":"native-rpc-led",
        "modules":[{"id":"X","type":"DIGITAL_SWITCH","properties":{"state":true}},{"id":"L","type":"LED"}],
        "connections":[{"source":"X.OUT","destination":"L.IN"}],
    });
    let capture = pb::CaptureConfiguration {
        signals: vec!["output".into()],
        duration_ns: 20,
        ..Default::default()
    };
    let plan = pb::InstrumentationExecutionPlan {
        schema_version: "1.0".into(),
        station_id: target.station_id.clone(),
        experiment_id: target.experiment_id.clone(),
        power_policy: Some(pb::PowerPolicy {
            profile_id: "virtual-1.0".into(),
            guarded: true,
        }),
        endpoint_bindings: vec![pb::EndpointBinding {
            endpoint_id: "output".into(),
            node_id: "L.IN".into(),
            role: "LOGIC_ANALYZER".into(),
        }],
        instrument_allocations: vec![pb::InstrumentAllocation {
            endpoint_id: "output".into(),
            instrument: "LOGIC_ANALYZER".into(),
            channel: 1,
        }],
        runtime_safety_policy: Some(pb::RuntimeSafetyPolicy {
            profile_id: "virtual-1.0".into(),
            watchdog_required: true,
        }),
        capture_config: Some(capture.clone()),
        ..Default::default()
    };
    for operation in [
        HardwareCall::EnterSafeState(target.clone()),
        HardwareCall::ConfigureVirtualCircuit(pb::ConfigureVirtualRequest {
            target: Some(target.clone()),
            design_graph_json: serde_json::to_vec(&graph).unwrap(),
        }),
        HardwareCall::PrepareExecution(pb::PrepareExecutionRequest {
            target: Some(target.clone()),
            plan: Some(plan),
            decision: Some(pb::ExecutionDecision {
                schema_version: "1.0".into(),
                decision: "RUN_NORMAL".into(),
                reasons: vec![],
            }),
        }),
        HardwareCall::ApplyRouting(target.clone()),
        HardwareCall::GuardedPowerUp(target.clone()),
        HardwareCall::ArmCapture(pb::ArmCaptureRequest {
            target: Some(target.clone()),
            configuration: Some(capture),
        }),
    ] {
        assert!(
            client
                .call(operation)
                .await
                .unwrap()
                .capture_payload
                .is_empty()
        );
    }
    let run = client
        .call(HardwareCall::StartExecution(target.clone()))
        .await
        .unwrap();
    assert_eq!(run.state, "RUNNING");
    let capture = client
        .call(HardwareCall::ReadCapture(target.clone()))
        .await
        .unwrap();
    assert_eq!(capture.state, "CAPTURING");
    assert_eq!(capture.result["sample_count"], 1);
    assert!(capture.result.get("samples").is_none());
    let expected = json!([{"signal":"output","time_ns":0,"value":1}]);
    assert_eq!(
        capture.capture_payload,
        cirnet_contracts_native::capture::encode_digital(&expected, &json!(20)).unwrap()
    );
    let stop = client
        .call(HardwareCall::StopExecution(target.clone()))
        .await
        .unwrap();
    assert_eq!(stop.state, "SAFE_STATE");
    assert_eq!(stop.result["hardware_applied"], false);
    assert!(stop.capture_payload.is_empty());
    let late = client
        .call(HardwareCall::ReadCapture(target))
        .await
        .unwrap();
    assert_eq!(late.result["available"], false);
    assert!(late.capture_payload.is_empty());
}
