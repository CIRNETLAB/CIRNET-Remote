use crate::{
    auth::{self, SessionContext},
    config::Config,
    db::Db,
    error::ApiError,
    events::{ControlIdentity, EventHub, Subscription},
    http_api::json_complexity,
};
use axum::{
    Router,
    extract::{
        State,
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade},
    },
    response::{IntoResponse, Response},
    routing::get,
};
use cirnet_contracts_native::validation::Registry;
use http::{HeaderMap, StatusCode};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    future::Future,
    pin::Pin,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    task::JoinHandle,
    time::{Instant, sleep, timeout},
};
use tungstenite::Error as WireError;

const FRAME_BYTES: usize = 65_536;
const ECHO_BYTES: usize = 1_024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DisconnectCause {
    Disconnected,
    SessionExpired,
}

pub type ControlFuture = Pin<Box<dyn Future<Output = Result<(), ApiError>> + Send + 'static>>;

pub trait ControlCallbacks: Send + Sync + 'static {
    fn disconnect_control(
        &self,
        identity: ControlIdentity,
        cause: DisconnectCause,
    ) -> ControlFuture;
}

#[derive(Clone, Copy)]
pub struct SocketLimits {
    pub handshake: Duration,
    pub send: Duration,
    pub cleanup: Duration,
    pub message_limit: usize,
}

impl SocketLimits {
    pub fn from_config(config: &Config) -> Self {
        Self {
            handshake: Duration::from_secs_f64(config.websocket_handshake_seconds),
            send: Duration::from_secs_f64(config.websocket_send_seconds),
            cleanup: Duration::from_secs_f64(config.websocket_cleanup_seconds),
            message_limit: config.websocket_message_limit,
        }
    }
}

#[derive(Clone)]
pub struct WebSocketState {
    config: Arc<Config>,
    db: Db,
    registry: Arc<Registry>,
    hub: EventHub,
    limits: SocketLimits,
    control: Arc<dyn ControlCallbacks>,
}

impl WebSocketState {
    pub fn new(
        config: Arc<Config>,
        db: Db,
        registry: Arc<Registry>,
        hub: EventHub,
        limits: SocketLimits,
        control: Arc<dyn ControlCallbacks>,
    ) -> Self {
        Self {
            config,
            db,
            registry,
            hub,
            limits,
            control,
        }
    }

    async fn session_active(&self, context: &SessionContext) -> bool {
        let Ok(Some(row)) = self.db.session_by_id(&context.session_id).await else {
            return false;
        };
        let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else {
            return false;
        };
        auth::context_from_row(row, self.config.allow_guest, now.as_secs_f64())
            .is_some_and(|current| current.owner_id == context.owner_id)
    }
}

pub fn router(state: WebSocketState) -> Router {
    Router::new()
        .route("/ws/events", get(upgrade))
        .with_state(state)
}

async fn upgrade(
    State(state): State<WebSocketState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    let origin = headers.get("origin").and_then(|value| value.to_str().ok());
    let rejected = || StatusCode::FORBIDDEN.into_response();
    if auth::verify_origin(&state.config, origin).is_err() {
        return rejected();
    }
    let cookie = auth::session_cookie(&headers);
    let current = auth::current(&state.db, cookie.as_deref(), &state.config);
    let Ok(Ok(Some(context))) = timeout(state.limits.handshake, current).await else {
        return rejected();
    };
    let Some(owner) = context.owner_id.as_deref() else {
        return rejected();
    };
    let Ok(subscription) = state.hub.subscribe(owner, &context.session_id) else {
        return rejected();
    };

    upgrade
        .max_message_size(FRAME_BYTES)
        .max_frame_size(FRAME_BYTES)
        .on_upgrade(move |socket| serve(socket, state, context, subscription))
}

struct Connection {
    subscription: Option<Subscription>,
    control: Arc<dyn ControlCallbacks>,
    cause: DisconnectCause,
}

impl Connection {
    fn subscription(&mut self) -> &mut Subscription {
        self.subscription.as_mut().expect("attached WebSocket")
    }

    fn detach(&mut self) -> Option<JoinHandle<()>> {
        let identity = self.subscription.take()?.close()?;
        let control = self.control.clone();
        let cause = self.cause;
        Some(tokio::spawn(async move {
            // The manager remains responsible for cleanup and durable lease fencing.
            if let Err(error) = control.disconnect_control(identity, cause).await {
                crate::diagnostics::safety_log(format_args!(
                    "WebSocket control cleanup failed ({})",
                    error.code
                ));
            }
        }))
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        let _cleanup = self.detach();
    }
}

async fn serve(
    mut socket: WebSocket,
    state: WebSocketState,
    context: SessionContext,
    subscription: Subscription,
) {
    let mut connection = Connection {
        subscription: Some(subscription),
        control: state.control.clone(),
        cause: DisconnectCause::Disconnected,
    };
    if let Err(Some(code)) = relay(&mut socket, &state, &context, &mut connection).await {
        let _ = timeout(
            state.limits.send,
            socket.send(Message::Close(Some(CloseFrame {
                code,
                reason: "".into(),
            }))),
        )
        .await;
    }
    if let Some(cleanup) = connection.detach() {
        let _ = timeout(state.limits.cleanup, cleanup).await;
    }
}

type SocketResult<T> = Result<T, Option<u16>>;

async fn relay(
    socket: &mut WebSocket,
    state: &WebSocketState,
    context: &SessionContext,
    connection: &mut Connection,
) -> SocketResult<()> {
    if connection.subscription().closing() {
        return Err(Some(1001));
    }
    send_value(
        socket,
        state,
        "HelloEvent",
        connection.subscription().hello(),
    )
    .await?;
    let deadline = Instant::now() + state.limits.handshake;
    let mut negotiated = false;
    let mut arrivals = VecDeque::new();

    loop {
        let poll = Duration::from_secs(1);
        let wait = if negotiated {
            poll
        } else {
            poll.min(deadline.saturating_duration_since(Instant::now()))
        };
        let (input, mut outgoing) = tokio::select! {
            input = socket.recv() => (Some(input), None),
            outgoing = connection.subscription().recv() => (None, outgoing),
            _ = sleep(wait) => (None, None),
        };

        if connection.subscription().closing() {
            return Err(Some(1001));
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if !negotiated && remaining.is_zero() {
            return Err(Some(4408));
        }
        let auth_timeout = if negotiated {
            state.limits.send
        } else {
            state.limits.send.min(remaining)
        };
        let active = !connection.subscription().revoked()
            && timeout(auth_timeout, state.session_active(context))
                .await
                .unwrap_or(false)
            && !connection.subscription().revoked();
        if connection.subscription().closing() {
            return Err(Some(1001));
        }
        if !negotiated && Instant::now() >= deadline {
            return Err(Some(4408));
        }
        if !active {
            connection.cause = DisconnectCause::SessionExpired;
            return Err(Some(4401));
        }

        if let Some(input) = input {
            let Some(message) = input else {
                return Ok(());
            };
            match message.map_err(transport_close)? {
                Message::Close(_) => return Ok(()),
                Message::Binary(_) => return Err(Some(1003)),
                Message::Ping(_) | Message::Pong(_) => {}
                Message::Text(text) => {
                    if !json_complexity(text.as_bytes(), 32, 2_048) {
                        return Err(Some(1009));
                    }
                    let now = Instant::now();
                    while arrivals
                        .front()
                        .is_some_and(|at| now - *at >= Duration::from_secs(60))
                    {
                        arrivals.pop_front();
                    }
                    if arrivals.len() >= state.limits.message_limit {
                        return Err(Some(4429));
                    }
                    arrivals.push_back(now);
                    receive_text(socket, state, connection.subscription(), text.as_str()).await?;
                    negotiated = true;
                }
            }
        }

        if let Some(delivery) = outgoing.as_mut() {
            let value = serde_json::from_str(delivery.text()).map_err(|_| Some(1011))?;
            state
                .registry
                .validate("ServerEvent", "transport", &value)
                .map_err(|_| Some(1011))?;
            send(socket, state.limits.send, delivery.take_text()).await?;
        }
    }
}

async fn receive_text(
    socket: &mut WebSocket,
    state: &WebSocketState,
    subscription: &mut Subscription,
    text: &str,
) -> SocketResult<()> {
    let body: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    if body.get("type").and_then(Value::as_str) == Some("client.hello") {
        let failure = if state
            .registry
            .validate("ClientHelloMessage", "transport", &body)
            .is_err()
        {
            Some(("INVALID_MESSAGE", "Invalid realtime negotiation message."))
        } else if body["protocol_version"] != "1.0" {
            Some((
                "UNSUPPORTED_VERSION",
                "Realtime protocol version is unsupported.",
            ))
        } else if body
            .get("control_client_id")
            .and_then(Value::as_str)
            .is_some_and(|id| !id.is_empty() && !subscription.bind_control(id))
        {
            Some((
                "INVALID_MESSAGE",
                "A control context cannot change within one connection.",
            ))
        } else {
            None
        };
        if let Some((code, message)) = failure {
            let failure = subscription
                .protocol_error(code, message)
                .ok_or(Some(1011))?;
            send_value(socket, state, "ProtocolErrorEvent", failure).await?;
            return Err(Some(1002));
        }
        return Ok(());
    }
    if text.len() > ECHO_BYTES {
        return Err(Some(1009));
    }
    send_value(
        socket,
        state,
        "LegacyServerEvent",
        json!({"type":"echo","payload":text}),
    )
    .await
}

async fn send_value(
    socket: &mut WebSocket,
    state: &WebSocketState,
    name: &str,
    value: Value,
) -> SocketResult<()> {
    let value = state
        .registry
        .validate(name, "transport", &value)
        .map_err(|_| Some(1011))?;
    let text = serde_json::to_string(&value).map_err(|_| Some(1011))?;
    send(socket, state.limits.send, text).await
}

async fn send(socket: &mut WebSocket, budget: Duration, text: String) -> SocketResult<()> {
    timeout(budget, socket.send(Message::Text(text.into())))
        .await
        .map_err(|_| Some(4408))?
        .map_err(|_| None)
}

fn transport_close(error: axum::Error) -> Option<u16> {
    match error.into_inner().downcast::<WireError>().ok().as_deref()? {
        WireError::Capacity(_) => Some(1009),
        WireError::Protocol(_) => Some(1002),
        WireError::Utf8(_) => Some(1007),
        _ => None,
    }
}

#[cfg(test)]
#[path = "../tests/websocket_protocol.rs"]
mod tests;
