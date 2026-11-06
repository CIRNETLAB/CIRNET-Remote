use super::*;
use axum::serve;
use futures_util::{SinkExt, StreamExt};
use http::{Request as HttpRequest, Response as HttpResponse};
use prost::Message;
use std::{
    convert::Infallible,
    sync::atomic::{AtomicUsize, Ordering},
    task::{Context, Poll},
};
use tokio::net::TcpListener;
use tokio_stream::wrappers::TcpListenerStream;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Message as ClientMessage, client::IntoClientRequest},
};
use tonic::{
    Request, Response, Status,
    body::Body,
    codegen::{BoxFuture, Service},
    server::{Grpc, NamedService, UnaryService},
    transport::Server,
};
use tonic_prost::ProstCodec;

#[derive(Default)]
struct FaultGate {
    start: Notify,
    late_start: Notify,
    cleanup: Notify,
    failed_cleanup: Notify,
    stops: AtomicUsize,
    capture_calls: AtomicUsize,
    targets: std::sync::Mutex<Vec<String>>,
}

#[derive(Clone)]
struct FaultPeer {
    gates: Arc<FaultGate>,
    capabilities: pb::StationCapabilities,
}

impl NamedService for FaultPeer {
    const NAME: &'static str = pb::CANONICAL_SERVICE;
}

impl Service<HttpRequest<Body>> for FaultPeer {
    type Response = HttpResponse<Body>;
    type Error = Infallible;
    type Future = BoxFuture<Self::Response, Self::Error>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, request: HttpRequest<Body>) -> Self::Future {
        let method = request.uri().path().rsplit('/').next().unwrap().to_owned();
        let peer = self.clone();
        Box::pin(async move {
            if method == "GetCapabilities" {
                return Ok(Grpc::new(ProstCodec::default())
                    .unary(Capabilities(peer.capabilities), request)
                    .await);
            }
            let wrapped = matches!(
                method.as_str(),
                "ConfigureVirtualCircuit" | "PrepareExecution" | "ArmCapture"
            );
            let handler = FixtureCall {
                gates: peer.gates,
                method,
            };
            if wrapped {
                let mut grpc: Grpc<ProstCodec<pb::OperationReply, TargetEnvelope>> =
                    Grpc::new(ProstCodec::default());
                Ok(grpc.unary(handler, request).await)
            } else {
                let mut grpc: Grpc<ProstCodec<pb::OperationReply, pb::Target>> =
                    Grpc::new(ProstCodec::default());
                Ok(grpc.unary(handler, request).await)
            }
        })
    }
}

struct Capabilities(pb::StationCapabilities);

impl UnaryService<pb::Target> for Capabilities {
    type Response = pb::StationCapabilities;
    type Future = BoxFuture<Response<Self::Response>, Status>;

    fn call(&mut self, request: Request<pb::Target>) -> Self::Future {
        let caps = self.0.clone();
        Box::pin(async move {
            assert_eq!(request.into_inner().station_id, caps.station_id);
            Ok(Response::new(caps))
        })
    }
}

#[derive(Clone, PartialEq, Message)]
struct TargetEnvelope {
    #[prost(message, optional, tag = "1")]
    target: Option<pb::Target>,
}

struct FixtureCall {
    gates: Arc<FaultGate>,
    method: String,
}

impl UnaryService<TargetEnvelope> for FixtureCall {
    type Response = pb::OperationReply;
    type Future = BoxFuture<Response<Self::Response>, Status>;

    fn call(&mut self, request: Request<TargetEnvelope>) -> Self::Future {
        self.reply(request.into_inner().target.unwrap())
    }
}

impl UnaryService<pb::Target> for FixtureCall {
    type Response = pb::OperationReply;
    type Future = BoxFuture<Response<Self::Response>, Status>;

    fn call(&mut self, request: Request<pb::Target>) -> Self::Future {
        self.reply(request.into_inner())
    }
}

impl FixtureCall {
    fn reply(&self, target: pb::Target) -> BoxFuture<Response<pb::OperationReply>, Status> {
        let gate = self.gates.clone();
        let method = self.method.clone();
        Box::pin(async move {
            assert_eq!(target.station_id, "virtual-station-01");
            assert!(!target.experiment_id.is_empty());
            let (accepted, code) = match method.as_str() {
                "StartExecution" => {
                    gate.targets.lock().unwrap().push(target.experiment_id);
                    gate.start.notify_one();
                    gate.late_start.notified().await;
                    (true, pb::ErrorCode::Ok)
                }
                "StopExecution" => {
                    gate.targets.lock().unwrap().push(target.experiment_id);
                    if gate.stops.fetch_add(1, Ordering::AcqRel) == 0 {
                        (true, pb::ErrorCode::Ok)
                    } else {
                        gate.cleanup.notify_one();
                        gate.failed_cleanup.notified().await;
                        (false, pb::ErrorCode::DriverError)
                    }
                }
                "ReadCapture" => {
                    gate.capture_calls.fetch_add(1, Ordering::AcqRel);
                    (false, pb::ErrorCode::InvalidState)
                }
                _ => (true, pb::ErrorCode::Ok),
            };
            Ok(Response::new(pb::OperationReply {
                accepted,
                code: code as i32,
                state: "SAFE_STATE".into(),
                result_json: serde_json::to_vec(&json!({
                    "accepted":accepted, "code":code.as_str_name(), "hardware_applied":false,
                }))
                .unwrap(),
                capture_payload: vec![],
            }))
        })
    }
}

#[tokio::test]
#[ignore = "requires the owned auth fixture and exact R2 capabilities; Stop faults injected over test-only gRPC"]
async fn last_control_disconnect_ignores_late_start_and_quarantines_failed_cleanup() {
    let mut lane = Lane::start().await;
    let real = lane
        .manager
        .0
        .hardware
        .capabilities("virtual-station-01")
        .await
        .unwrap();
    let gates = Arc::new(FaultGate::default());
    let fault = FaultPeer {
        gates: gates.clone(),
        capabilities: real,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let rpc = tokio::spawn(async move {
        Server::builder()
            .add_service(fault)
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    Arc::get_mut(&mut lane.manager.0).unwrap().hardware =
        HardwareClient::new(&address.to_string()).unwrap();
    let manager = &lane.manager;
    manager.initialize().await.unwrap();
    let context = &lane.context;
    let owner = owner(context).unwrap();

    let websocket = crate::websocket::router(crate::websocket::WebSocketState::new(
        manager.0.config.clone(),
        manager.0.auth_db.clone(),
        manager.0.registry.clone(),
        manager.0.events.clone(),
        crate::websocket::SocketLimits::from_config(&manager.0.config),
        Arc::new(manager.clone()),
    ));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("ws://{}/ws/events", listener.local_addr().unwrap());
    let ws = tokio::spawn(async move {
        serve(listener, websocket).await.unwrap();
    });
    let fixture = PathBuf::from(std::env::var_os("CIRNET_REMOTE_WS_FIXTURE_DIR").unwrap());
    let fixture: Value =
        serde_json::from_slice(&std::fs::read(fixture.join("fixture.json")).unwrap()).unwrap();
    let cookie = format!(
        "cirnet_session={}",
        fixture["stage4_alice"]["token"].as_str().unwrap()
    );
    let connect = || async {
        let mut request = address.as_str().into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", "http://testserver".parse().unwrap());
        request
            .headers_mut()
            .insert("cookie", cookie.parse().unwrap());
        let (mut client, _) = connect_async(request).await.unwrap();
        let hello = client.next().await.unwrap().unwrap().into_text().unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&hello).unwrap()["type"],
            "hello"
        );
        client
            .send(ClientMessage::Text(
                json!({"type":"client.hello","protocol_version":"1.0","control_client_id":"tab"})
                    .to_string()
                    .into(),
            ))
            .await
            .unwrap();
        client
            .send(ClientMessage::Text("ready".into()))
            .await
            .unwrap();
        let echo = client.next().await.unwrap().unwrap().into_text().unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&echo).unwrap(),
            json!({"type":"echo","payload":"ready"})
        );
        client
    };
    let mut first = timeout(Duration::from_secs(5), connect()).await.unwrap();
    let mut last = timeout(Duration::from_secs(5), connect()).await.unwrap();
    let record = manager
        .create(
            context,
            &json!({
                "station_id":"virtual-station-01",
                "circuit_graph":{
                    "schema_version":"1.0","circuit_id":"late-start",
                    "modules":[{"id":"X","type":"DIGITAL_SWITCH","properties":{"state":true}}],
                    "connections":[],
                },
            }),
            None,
            None,
            false,
        )
        .await
        .unwrap();
    let id = record["experiment_id"].as_str().unwrap();
    manager
        .run(context, id, Some("run"), Some("tab"), None)
        .await
        .unwrap();
    timeout(Duration::from_secs(5), gates.start.notified())
        .await
        .unwrap();

    first.close(None).await.unwrap();
    drop(first);
    timeout(Duration::from_secs(5), async {
        while manager.0.events.metrics().subscriptions != 1 {
            sleep(Duration::from_millis(2)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(gates.stops.load(Ordering::Acquire), 0);
    assert_eq!(manager.get(owner, id).await.unwrap()["state"], "RUNNING");

    last.close(None).await.unwrap();
    drop(last);
    timeout(Duration::from_secs(5), async {
        loop {
            if manager.0.state.lock().await.active[id]
                .stop_acknowledged
                .load(Ordering::Acquire)
            {
                break;
            }
            sleep(Duration::from_millis(2)).await;
        }
    })
    .await
    .unwrap();
    let stopping = manager.get(owner, id).await.unwrap();
    assert_eq!(stopping["state"], "STOPPING");
    assert_eq!(stopping["error_code"], "DISCONNECTED");
    assert!(manager.0.repo.lease(id).await.unwrap().is_some());
    assert_eq!(gates.stops.load(Ordering::Acquire), 1);

    gates.late_start.notify_one();
    timeout(Duration::from_secs(5), gates.cleanup.notified())
        .await
        .unwrap();
    assert!(manager.0.repo.lease(id).await.unwrap().is_some());
    assert_eq!(gates.capture_calls.load(Ordering::Acquire), 0);
    gates.failed_cleanup.notify_one();

    let final_record = timeout(Duration::from_secs(5), async {
        loop {
            let record = manager.get(owner, id).await.unwrap();
            if terminal(&record) {
                break record;
            }
            sleep(Duration::from_millis(2)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(final_record["state"], "FAULT");
    assert_eq!(final_record["error_code"], "SAFE_STATE_FAILED");
    assert_eq!(final_record["capture"], Value::Null);
    assert!(manager.0.repo.lease(id).await.unwrap().unwrap().quarantined);
    assert_eq!(gates.capture_calls.load(Ordering::Acquire), 0);
    assert_eq!(gates.targets.lock().unwrap().as_slice(), [id, id, id]);
    assert_eq!(
        manager
            .operation(owner, "run", Some(id), "run")
            .await
            .unwrap()["status"],
        "FAILED"
    );
    ws.abort();
    rpc.abort();
    lane.close().await;
}
