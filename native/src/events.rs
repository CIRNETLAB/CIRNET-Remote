use crate::config::Config;
use serde_json::{Value, json};
use std::{
    collections::{HashMap, VecDeque},
    io::{self, Write},
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};
use tokio::{runtime::Handle, sync::Notify};
use uuid::Uuid;

const PROTOCOL_VERSION: &str = "1.0";
const QUEUE_EVENTS: usize = 128;
const RESYNC_RESERVE: usize = 512;

#[derive(Clone, Copy, Debug)]
pub struct EventLimits {
    pub maximum_subscriptions: usize,
    pub maximum_per_owner: usize,
    pub maximum_per_session: usize,
    pub event_bytes: usize,
    pub queue_bytes: usize,
    pub total_bytes: usize,
}

impl Default for EventLimits {
    fn default() -> Self {
        Self {
            maximum_subscriptions: 512,
            maximum_per_owner: 16,
            maximum_per_session: 8,
            event_bytes: 512 * 1024,
            queue_bytes: 1024 * 1024,
            total_bytes: 16 * 1024 * 1024,
        }
    }
}

impl From<&Config> for EventLimits {
    fn from(config: &Config) -> Self {
        Self {
            maximum_subscriptions: config.websocket_max_subscriptions,
            maximum_per_owner: config.websocket_max_per_owner,
            maximum_per_session: config.websocket_max_per_session,
            event_bytes: config.websocket_event_bytes,
            queue_bytes: config.websocket_queue_bytes,
            total_bytes: config.websocket_total_bytes,
        }
    }
}

#[derive(Debug, thiserror::Error, Eq, PartialEq)]
pub enum EventError {
    #[error("INVALID_EVENT_LIMITS")]
    InvalidLimits,
    #[error("SUBSCRIPTION_LIMIT")]
    SubscriptionLimit,
    #[error("EVENT_RUNTIME_UNAVAILABLE")]
    NoRuntime,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ControlIdentity {
    pub owner: String,
    pub session_id: String,
    pub client_id: String,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct HubMetrics {
    pub subscriptions: usize,
    pub retained_bytes: usize,
    pub ingress_events: usize,
    pub scheduled_drains: usize,
}

#[derive(Clone)]
pub struct EventHub(Arc<Hub>);

struct Hub {
    limits: EventLimits,
    data_bytes: usize,
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    closed: bool,
    subscribers: HashMap<Uuid, Subscriber>,
    retained_bytes: usize,
}

struct Subscriber {
    owner: String,
    session_id: String,
    stream_id: String,
    sequence: u64,
    client_id: Option<String>,
    runtime: Handle,
    notify: Arc<Notify>,
    revoked: bool,
    ingress: VecDeque<(Arc<Value>, usize)>,
    queue: VecDeque<(String, usize)>,
    retained_bytes: usize,
    scheduled: bool,
    dropped: usize,
}

pub struct Subscription {
    hub: EventHub,
    token: Option<Uuid>,
    stream_id: String,
    notify: Arc<Notify>,
}

/// Charges a dequeued event until the socket has sent or discarded it.
pub struct Delivery {
    hub: EventHub,
    token: Uuid,
    text: String,
    bytes: usize,
}

impl Delivery {
    pub fn text(&self) -> &str {
        &self.text
    }

    pub(crate) fn take_text(&mut self) -> String {
        std::mem::take(&mut self.text)
    }
}

impl Drop for Delivery {
    fn drop(&mut self) {
        let mut state = self.hub.lock();
        if let Some(subscriber) = state.subscribers.get_mut(&self.token) {
            subscriber.retained_bytes -= self.bytes;
            state.retained_bytes -= self.bytes;
        }
    }
}

impl EventHub {
    pub fn new(limits: EventLimits) -> Result<Self, EventError> {
        let reserve = limits
            .maximum_subscriptions
            .checked_mul(RESYNC_RESERVE)
            .ok_or(EventError::InvalidLimits)?;
        if limits.maximum_subscriptions == 0
            || limits.maximum_per_owner == 0
            || limits.maximum_per_session == 0
            || limits.event_bytes <= RESYNC_RESERVE
            || limits.queue_bytes < 2 * RESYNC_RESERVE
            || limits.event_bytes > limits.queue_bytes
            || limits.total_bytes <= reserve
        {
            return Err(EventError::InvalidLimits);
        }
        Ok(Self(Arc::new(Hub {
            limits,
            data_bytes: limits.total_bytes - reserve,
            state: Mutex::default(),
        })))
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.0.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn subscribe(&self, owner: &str, session_id: &str) -> Result<Subscription, EventError> {
        let runtime = Handle::try_current().map_err(|_| EventError::NoRuntime)?;
        let mut state = self.lock();
        let limits = self.0.limits;
        if state.closed
            || state.subscribers.len() >= limits.maximum_subscriptions
            || state
                .subscribers
                .values()
                .filter(|value| value.owner == owner)
                .count()
                >= limits.maximum_per_owner
            || state
                .subscribers
                .values()
                .filter(|value| value.session_id == session_id)
                .count()
                >= limits.maximum_per_session
        {
            return Err(EventError::SubscriptionLimit);
        }
        let token = Uuid::new_v4();
        let stream_id = Uuid::new_v4().simple().to_string();
        let notify = Arc::new(Notify::new());
        state.subscribers.insert(
            token,
            Subscriber {
                owner: owner.into(),
                session_id: session_id.into(),
                stream_id: stream_id.clone(),
                sequence: 0,
                client_id: None,
                runtime,
                notify: notify.clone(),
                revoked: false,
                ingress: VecDeque::new(),
                queue: VecDeque::new(),
                retained_bytes: 0,
                scheduled: false,
                dropped: 0,
            },
        );
        Ok(Subscription {
            hub: self.clone(),
            token: Some(token),
            stream_id,
            notify,
        })
    }

    pub fn metrics(&self) -> HubMetrics {
        let state = self.lock();
        HubMetrics {
            subscriptions: state.subscribers.len(),
            retained_bytes: state.retained_bytes,
            ingress_events: state
                .subscribers
                .values()
                .map(|value| value.ingress.len())
                .sum(),
            scheduled_drains: state
                .subscribers
                .values()
                .filter(|value| value.scheduled)
                .count(),
        }
    }

    pub fn has_control(&self, identity: &ControlIdentity) -> bool {
        self.lock()
            .subscribers
            .values()
            .any(|value| value.matches_control(identity))
    }

    /// Wake every subscriber and stop admitting new sockets during shutdown.
    pub fn shutdown(&self) {
        let mut state = self.lock();
        if state.closed {
            return;
        }
        state.closed = true;
        let State {
            subscribers,
            retained_bytes,
            ..
        } = &mut *state;
        for subscriber in subscribers.values_mut() {
            subscriber.take_ingress(retained_bytes);
            subscriber.clear_queue(retained_bytes);
            subscriber.notify.notify_one();
        }
    }

    pub fn revoke_session(&self, session_id: &str) {
        let mut state = self.lock();
        let State {
            subscribers,
            retained_bytes,
            ..
        } = &mut *state;
        for subscriber in subscribers
            .values_mut()
            .filter(|value| value.session_id == session_id)
        {
            subscriber.revoked = true;
            subscriber.take_ingress(retained_bytes);
            subscriber.clear_queue(retained_bytes);
            subscriber.notify.notify_one();
        }
    }

    /// Publish one immutable payload to the matching owner's bounded ingress queues.
    pub fn publish(&self, owner: &str, event: Value) {
        if !event.get("type").is_some_and(Value::is_string) {
            return;
        }
        let size = ascii_json_size(&event, self.0.limits.event_bytes - RESYNC_RESERVE)
            .map(|bytes| bytes + RESYNC_RESERVE);
        let event = Arc::new(event);
        let mut tasks = Vec::new();
        {
            let mut state = self.lock();
            if state.closed {
                return;
            }
            let State {
                subscribers,
                retained_bytes,
                ..
            } = &mut *state;
            for (token, subscriber) in subscribers
                .iter_mut()
                .filter(|(_, value)| value.owner == owner && !value.revoked)
            {
                let fits = |retained: usize, total: usize| {
                    size.is_some_and(|size| {
                        size <= self.0.limits.queue_bytes.saturating_sub(retained)
                            && size <= self.0.data_bytes.saturating_sub(total)
                    })
                };
                if subscriber.ingress.len() >= QUEUE_EVENTS - 1
                    || !fits(subscriber.retained_bytes, *retained_bytes)
                {
                    subscriber.dropped = subscriber
                        .dropped
                        .saturating_add(subscriber.ingress.len() + 1);
                    subscriber.take_ingress(retained_bytes);
                }
                if fits(subscriber.retained_bytes, *retained_bytes) {
                    let size = size.expect("fitting ingress size");
                    subscriber.ingress.push_back((event.clone(), size));
                    subscriber.retained_bytes += size;
                    *retained_bytes += size;
                }
                if !subscriber.scheduled {
                    subscriber.scheduled = true;
                    tasks.push((*token, subscriber.runtime.clone()));
                }
            }
        }
        for (token, runtime) in tasks {
            let hub = self.clone();
            runtime.spawn(async move {
                hub.drain(token);
            });
        }
    }

    fn drain(&self, token: Uuid) {
        let mut state = self.lock();
        if state.closed {
            return;
        }
        let State {
            subscribers,
            retained_bytes,
            ..
        } = &mut *state;
        let Some(subscriber) = subscribers.get_mut(&token) else {
            return;
        };
        subscriber.scheduled = false;
        if subscriber.revoked {
            return;
        }
        let pending = subscriber.take_ingress(retained_bytes);
        let limits = self.0.limits;
        if subscriber.dropped > 0 || subscriber.queue.len() + pending.len() > QUEUE_EVENTS {
            let dropped = subscriber.dropped.saturating_add(subscriber.queue.len());
            subscriber.dropped = 0;
            subscriber.resync(retained_bytes, limits, dropped);
        }
        for (event, _) in pending {
            let value = subscriber.envelope(&event);
            if !subscriber.enqueue(retained_bytes, limits, value) {
                subscriber.resync(retained_bytes, limits, 1);
                let value = subscriber.envelope(&event);
                let _ = subscriber.enqueue(retained_bytes, limits, value);
            }
        }
        subscriber.notify.notify_one();
    }

    fn detach(&self, token: Uuid) -> Option<ControlIdentity> {
        let mut state = self.lock();
        let subscriber = state.subscribers.remove(&token)?;
        state.retained_bytes -= subscriber.retained_bytes;
        let identity = ControlIdentity {
            owner: subscriber.owner,
            session_id: subscriber.session_id,
            client_id: subscriber.client_id?,
        };
        if state
            .subscribers
            .values()
            .any(|value| value.matches_control(&identity))
        {
            None
        } else {
            Some(identity)
        }
    }
}

impl Subscriber {
    fn matches_control(&self, identity: &ControlIdentity) -> bool {
        self.owner == identity.owner
            && self.session_id == identity.session_id
            && self.client_id.as_deref() == Some(identity.client_id.as_str())
    }

    fn envelope(&mut self, payload: &Value) -> Value {
        self.sequence += 1;
        let mut value = payload.clone();
        value["protocol_version"] = json!(PROTOCOL_VERSION);
        value["stream_id"] = json!(self.stream_id);
        value["sequence"] = json!(self.sequence);
        if value["type"] == "experiment.updated" {
            value["aggregate_id"] = value["experiment"]["experiment_id"].clone();
            value["aggregate_revision"] = value["experiment"]["revision"].clone();
        } else if value["type"] == "station.updated" {
            value["aggregate_id"] = value["station"]["station_id"].clone();
        }
        value
    }

    fn take_ingress(&mut self, total: &mut usize) -> VecDeque<(Arc<Value>, usize)> {
        let pending = std::mem::take(&mut self.ingress);
        let bytes: usize = pending.iter().map(|(_, bytes)| bytes).sum();
        self.retained_bytes -= bytes;
        *total -= bytes;
        pending
    }

    fn clear_queue(&mut self, total: &mut usize) {
        let bytes: usize = self.queue.drain(..).map(|(_, bytes)| bytes).sum();
        self.retained_bytes -= bytes;
        *total -= bytes;
    }

    fn enqueue(&mut self, total: &mut usize, limits: EventLimits, event: Value) -> bool {
        if self.queue.len() >= QUEUE_EVENTS {
            return false;
        }
        let available = limits
            .event_bytes
            .min(limits.queue_bytes.saturating_sub(self.retained_bytes))
            .min(limits.total_bytes.saturating_sub(*total));
        let Some(size) = ascii_json_size(&event, available) else {
            return false;
        };
        let Ok(text) = serde_json::to_string(&event) else {
            return false;
        };
        self.queue.push_back((text, size));
        self.retained_bytes += size;
        *total += size;
        true
    }

    fn resync(&mut self, total: &mut usize, limits: EventLimits, dropped: usize) {
        self.clear_queue(total);
        let marker = self.envelope(&json!({
            "type":"resync.required","reason":"QUEUE_OVERFLOW","dropped_events":dropped.max(1),
        }));
        let _ = self.enqueue(total, limits, marker);
    }
}

impl Subscription {
    pub fn hello(&self) -> Value {
        json!({
            "type":"hello","service":"cirnet-api","protocol_version":PROTOCOL_VERSION,
            "stream_id":self.stream_id,"sequence":0,"resync_required":true,
            "supported_protocol_versions":[PROTOCOL_VERSION],
            "capabilities":{"snapshot_resync":true,"ordered_stream":true,"replay_commands":false},
        })
    }

    pub fn bind_control(&mut self, client_id: &str) -> bool {
        let Some(token) = self.token else {
            return false;
        };
        let mut state = self.hub.lock();
        if state.closed {
            return false;
        }
        let Some(subscriber) = state.subscribers.get_mut(&token) else {
            return false;
        };
        if subscriber.revoked
            || subscriber
                .client_id
                .as_deref()
                .is_some_and(|id| id != client_id)
        {
            return false;
        }
        subscriber.client_id = Some(client_id.into());
        true
    }

    pub fn protocol_error(&mut self, code: &str, message: &str) -> Option<Value> {
        let token = self.token?;
        self.hub.lock().subscribers.get_mut(&token).map(|subscriber| {
            subscriber.envelope(&json!({"type":"protocol.error","code":code,"message":message,"retryable":false}))
        })
    }

    pub(crate) fn closing(&self) -> bool {
        self.hub.lock().closed
    }

    pub fn revoked(&self) -> bool {
        self.token
            .and_then(|token| {
                self.hub
                    .lock()
                    .subscribers
                    .get(&token)
                    .map(|value| value.revoked)
            })
            .unwrap_or(true)
    }

    pub async fn recv(&mut self) -> Option<Delivery> {
        let token = self.token?;
        loop {
            {
                let mut state = self.hub.lock();
                if state.closed {
                    return None;
                }
                let subscriber = state.subscribers.get_mut(&token)?;
                if subscriber.revoked {
                    return None;
                }
                if let Some((text, bytes)) = subscriber.queue.pop_front() {
                    return Some(Delivery {
                        hub: self.hub.clone(),
                        token,
                        text,
                        bytes,
                    });
                }
            }
            self.notify.notified().await;
        }
    }

    /// Remove the subscriber and determine the last matching control atomically.
    pub fn close(mut self) -> Option<ControlIdentity> {
        self.token.take().and_then(|token| self.hub.detach(token))
    }
}

impl Drop for Subscription {
    fn drop(&mut self) {
        if let Some(token) = self.token.take() {
            let _ = self.hub.detach(token);
        }
    }
}

fn ascii_json_size(value: &Value, limit: usize) -> Option<usize> {
    struct Count {
        size: usize,
        limit: usize,
    }
    impl Write for Count {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            for byte in bytes {
                // Python ensure_ascii=True uses one escape per UTF-16 code unit.
                let width = match *byte {
                    0x00..=0x7e => 1,
                    0x80..=0xbf => 0,
                    0xf0..=0xf4 => 12,
                    _ => 6,
                };
                self.size = self.size.saturating_add(width);
                if self.size > self.limit {
                    return Err(io::Error::other("event budget exceeded"));
                }
            }
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    let mut counter = Count { size: 0, limit };
    serde_json::to_writer(&mut counter, value).ok()?;
    Some(counter.size)
}

#[cfg(test)]
#[path = "../tests/events_hub.rs"]
mod tests;
