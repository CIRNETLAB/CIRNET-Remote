use super::*;
use crate::auth;
use crate::events::EventLimits;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::{collections::HashMap, path::PathBuf, sync::Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async,
    tungstenite::{Error as ClientError, Message as ClientMessage, client::IntoClientRequest},
};

type Client = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Default)]
struct Recorder(Mutex<Vec<(ControlIdentity, DisconnectCause)>>);

impl ControlCallbacks for Recorder {
    fn disconnect_control(
        &self,
        identity: ControlIdentity,
        cause: DisconnectCause,
    ) -> ControlFuture {
        self.0.lock().unwrap().push((identity, cause));
        Box::pin(async { Ok(()) })
    }
}

struct Lane {
    url: String,
    tokens: Value,
    identity: ControlIdentity,
    hub: EventHub,
    recorder: Arc<Recorder>,
    server: tokio::task::JoinHandle<()>,
}

impl Drop for Lane {
    fn drop(&mut self) {
        self.server.abort();
    }
}

impl Lane {
    async fn start(message_limit: usize, handshake: Duration) -> Self {
        let fixture = PathBuf::from(
            std::env::var_os("CIRNET_REMOTE_WS_FIXTURE_DIR")
                .expect("select the owned, Python-migrated WebSocket auth fixture"),
        );
        let owner = PathBuf::from(std::env::var_os("CIRNET_ARTIFACTS_SESSION").unwrap())
            .canonicalize()
            .unwrap();
        assert!(fixture.canonicalize().unwrap().starts_with(owner));
        let tokens: Value =
            serde_json::from_slice(&std::fs::read(fixture.join("fixture.json")).unwrap()).unwrap();
        let database_url = format!(
            "sqlite:///{}",
            fixture
                .join("websocket.sqlite")
                .to_str()
                .unwrap()
                .replace('\\', "/")
        );
        let config = Arc::new(
            Config::from_vars(&HashMap::from([
                ("CIRNET_DATABASE_URL".into(), database_url.clone()),
                ("CIRNET_TRUSTED_ORIGINS".into(), "http://testserver".into()),
            ]))
            .unwrap(),
        );
        let registry = Arc::new(
            Registry::load(std::path::Path::new(
                &std::env::var_os("CIRNET_CONTRACTS_ROOT").unwrap(),
            ))
            .unwrap(),
        );
        let db = Db::open_readonly(&database_url).await.unwrap();
        let alice = auth::current(&db, tokens["stage4_alice"]["token"].as_str(), &config)
            .await
            .unwrap()
            .unwrap();
        let identity = ControlIdentity {
            owner: alice.owner_id.unwrap(),
            session_id: alice.session_id,
            client_id: "tab".into(),
        };
        let hub = EventHub::new(EventLimits::default()).unwrap();
        let recorder = Arc::new(Recorder::default());
        let limits = SocketLimits {
            message_limit,
            handshake,
            ..SocketLimits::from_config(&config)
        };
        let state =
            WebSocketState::new(config, db, registry, hub.clone(), limits, recorder.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}/ws/events", listener.local_addr().unwrap());
        let server =
            tokio::spawn(async move { axum::serve(listener, router(state)).await.unwrap() });
        Self {
            url,
            tokens,
            identity,
            hub,
            recorder,
            server,
        }
    }

    fn cookie(&self, name: &str) -> String {
        format!(
            "cirnet_session={}",
            self.tokens[name]["token"].as_str().unwrap()
        )
    }

    async fn connect(&self, origin: &str, cookie: Option<&str>) -> Result<Client, ClientError> {
        let mut req = self.url.as_str().into_client_request().unwrap();
        req.headers_mut().insert("origin", origin.parse().unwrap());
        if let Some(cookie) = cookie {
            req.headers_mut().insert("cookie", cookie.parse().unwrap());
        }
        connect_async(req).await.map(|(socket, _)| socket)
    }
}

async fn next(client: &mut Client) -> ClientMessage {
    tokio::time::timeout(Duration::from_secs(3), client.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
}

async fn next_json(client: &mut Client) -> Value {
    match next(client).await {
        ClientMessage::Text(text) => serde_json::from_str(&text).unwrap(),
        message => panic!("expected text, got {message:?}"),
    }
}

async fn close_code(client: &mut Client) -> u16 {
    match next(client).await {
        ClientMessage::Close(Some(frame)) => frame.code.into(),
        message => panic!("expected close, got {message:?}"),
    }
}

async fn bind(client: &mut Client) {
    client
        .send(ClientMessage::Text(
            json!({"type":"client.hello","protocol_version":"1.0","control_client_id":"tab"})
                .to_string()
                .into(),
        ))
        .await
        .unwrap();
    client
        .send(ClientMessage::Text("echo barrier".into()))
        .await
        .unwrap();
    assert_eq!(
        next_json(client).await,
        json!({"type":"echo","payload":"echo barrier"})
    );
}

async fn wait_count(hub: &EventHub, expected: usize) {
    tokio::time::timeout(Duration::from_secs(3), async {
        while hub.metrics().subscriptions != expected {
            tokio::time::sleep(Duration::from_millis(3)).await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "requires the canonical owned Python-migrated WebSocket fixture"]
async fn real_websocket_checks_auth_wire_and_protocol_close_codes() {
    let lane = Lane::start(120, Duration::from_millis(250)).await;
    let alice = lane.cookie("stage4_alice");
    let revoked = format!(
        "cirnet_session={}",
        lane.tokens["revoked"].as_str().unwrap()
    );
    let canonical_empty = format!(
        "netcircuit_session={}; cirnet_session=",
        lane.tokens["stage4_alice"]["token"].as_str().unwrap()
    );
    for (origin, cookie) in [
        ("http://testserver.attacker", Some(alice.as_str())),
        ("http://testserver", None),
        ("http://testserver", Some(revoked.as_str())),
        ("http://testserver", Some(canonical_empty.as_str())),
    ] {
        let error = lane.connect(origin, cookie).await.unwrap_err();
        assert!(
            matches!(error, ClientError::Http(ref response) if response.status().as_u16() == 403)
        );
    }
    let mut client = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    let hello = next_json(&mut client).await;
    assert_eq!(hello["type"], "hello");
    assert_eq!(hello["sequence"], 0);
    assert_eq!(hello["capabilities"]["replay_commands"], false);
    client
        .send(ClientMessage::Text(
            r#"{"type":"client.hello","protocol_version":"9.0"}"#.into(),
        ))
        .await
        .unwrap();
    let failure = next_json(&mut client).await;
    assert_eq!(failure["type"], "protocol.error");
    assert_eq!(failure["code"], "UNSUPPORTED_VERSION");
    assert_eq!(failure["stream_id"], hello["stream_id"]);
    assert_eq!(failure["sequence"], 1);
    assert_eq!(close_code(&mut client).await, 1002);
    drop(client);

    let mut client = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    assert_eq!(next_json(&mut client).await["type"], "hello");
    client
        .send(ClientMessage::Binary(vec![1].into()))
        .await
        .unwrap();
    assert_eq!(close_code(&mut client).await, 1003);
    drop(client);

    let mut client = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    assert_eq!(next_json(&mut client).await["type"], "hello");
    assert_eq!(close_code(&mut client).await, 4408);
    drop(client);
    wait_count(&lane.hub, 0).await;
}

#[tokio::test]
#[ignore = "requires the canonical owned Python-migrated WebSocket fixture"]
async fn real_websocket_last_matching_control_and_revocation_call_cleanup() {
    let lane = Lane::start(120, Duration::from_secs(2)).await;
    let alice = lane.cookie("stage4_alice");
    let mut first = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    let mut second = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    assert_eq!(next_json(&mut first).await["type"], "hello");
    assert_eq!(next_json(&mut second).await["type"], "hello");
    bind(&mut first).await;
    bind(&mut second).await;
    first.close(None).await.unwrap();
    drop(first);
    wait_count(&lane.hub, 1).await;
    assert!(lane.hub.has_control(&lane.identity));
    assert!(lane.recorder.0.lock().unwrap().is_empty());

    lane.hub.revoke_session(&lane.identity.session_id);
    assert_eq!(close_code(&mut second).await, 4401);
    drop(second);
    wait_count(&lane.hub, 0).await;
    tokio::time::timeout(Duration::from_secs(3), async {
        while lane.recorder.0.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(3)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        *lane.recorder.0.lock().unwrap(),
        vec![(lane.identity.clone(), DisconnectCause::SessionExpired)]
    );
}

#[tokio::test]
#[ignore = "requires the canonical owned Python-migrated WebSocket fixture"]
async fn real_websocket_message_and_rate_limits() {
    let lane = Lane::start(120, Duration::from_secs(2)).await;
    let alice = lane.cookie("stage4_alice");
    let mut client = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    assert_eq!(next_json(&mut client).await["type"], "hello");
    client
        .send(ClientMessage::Text("a".repeat(1025).into()))
        .await
        .unwrap();
    assert_eq!(close_code(&mut client).await, 1009);
    drop(client);

    let mut client = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    assert_eq!(next_json(&mut client).await["type"], "hello");
    for payload in (0..120).map(|index| index.to_string()) {
        client
            .send(ClientMessage::Text(payload.clone().into()))
            .await
            .unwrap();
        assert_eq!(
            next_json(&mut client).await,
            json!({"type":"echo","payload":payload})
        );
    }
    client
        .send(ClientMessage::Text("three".into()))
        .await
        .unwrap();
    assert_eq!(close_code(&mut client).await, 4429);
}

#[tokio::test]
#[ignore = "requires the canonical owned Python-migrated WebSocket fixture"]
async fn real_websocket_rejects_oversized_and_malformed_wire_frames() {
    let lane = Lane::start(120, Duration::from_secs(2)).await;
    let alice = lane.cookie("stage4_alice");
    let mut client = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    assert_eq!(next_json(&mut client).await["type"], "hello");
    client
        .send(ClientMessage::Text("x".repeat(65_537).into()))
        .await
        .unwrap();
    assert_eq!(close_code(&mut client).await, 1009);
    drop(client);

    for (raw, expected) in [
        (&[0x81, 0x01, b'x'][..], 1002),
        (&[0x81, 0x81, 0x12, 0x34, 0x56, 0x78, 0xff ^ 0x12][..], 1007),
    ] {
        let mut client = lane
            .connect("http://testserver", Some(&alice))
            .await
            .unwrap();
        assert_eq!(next_json(&mut client).await["type"], "hello");
        tokio::io::AsyncWriteExt::write_all(client.get_mut(), raw)
            .await
            .unwrap();
        assert_eq!(close_code(&mut client).await, expected);
    }
    wait_count(&lane.hub, 0).await;
}
#[tokio::test]
#[ignore = "requires the canonical owned Python-migrated WebSocket fixture"]
async fn shutdown_closes_quiet_websockets_and_rejects_new_subscriptions() {
    let lane = Lane::start(120, Duration::from_secs(2)).await;
    let alice = lane.cookie("stage4_alice");
    let mut client = lane
        .connect("http://testserver", Some(&alice))
        .await
        .unwrap();
    assert_eq!(next_json(&mut client).await["type"], "hello");
    bind(&mut client).await;
    lane.hub.shutdown();
    lane.hub.shutdown();
    assert_eq!(close_code(&mut client).await, 1001);
    drop(client);
    wait_count(&lane.hub, 0).await;
    tokio::time::timeout(Duration::from_secs(3), async {
        while lane.recorder.0.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(3)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        *lane.recorder.0.lock().unwrap(),
        vec![(lane.identity.clone(), DisconnectCause::Disconnected)]
    );
    assert!(
        matches!(lane.connect("http://testserver", Some(&alice)).await, Err(ClientError::Http(response)) if response.status().as_u16() == 403)
    );
}
