//! Explicitly opted-in evidence for the Windows loaded-Stop fixture.
use std::{
    collections::{BTreeSet, HashMap},
    fs::{self, OpenOptions},
    io::Write,
    net::SocketAddr,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    time::Duration,
};

use serde_json::{Value, json};
use tokio::{
    sync::watch,
    time::{Instant, timeout_at},
};
use tonic::{Request, Response, Status, metadata::MetadataValue};

use crate::{
    config::Config,
    hardware::{GatewayError, pb},
};

mod phases;

pub(crate) use phases::{Phase, StopPhaseTrace, mark as mark_stop_phase};

const ENABLE: &str = "CIRNET_NATIVE_REMOTE_STOP_PROBE";
const START_WAVE: &str = "x-cirnet-start-wave";
const STOP_INGRESS: &str = "x-cirnet-stop-ingress";
const CLOCK: &str = "qpc-ns-v1";
const START_TIMEOUT: Duration = Duration::from_secs(8);
const PARTICIPANTS: usize = 4;
const MAX_WAVES: u64 = 1024;
const MAX_EVENTS: usize = 32_768;

#[derive(Clone, Copy)]
pub(crate) enum StopSource {
    Explicit,
    Cleanup,
    Sweep,
    Recovery,
}

impl StopSource {
    fn name(self) -> &'static str {
        match self {
            Self::Explicit => "stop",
            Self::Cleanup => "run",
            Self::Sweep => "sweep",
            Self::Recovery => "recovery",
        }
    }
}

pub struct StopProbe {
    directory: PathBuf,
    starts: StartRendezvous,
    phases: Option<phases::PhaseBuffer>,
    events: AtomicUsize,
    failed: AtomicBool,
}

impl StopProbe {
    #[doc(hidden)]
    pub fn configure(
        variables: &HashMap<String, String>,
        config: &Config,
        address: SocketAddr,
    ) -> Result<Option<Arc<Self>>, &'static str> {
        let active = match variables.get(ENABLE).map(String::as_str) {
            None | Some("0") => false,
            Some("1") => true,
            _ => return Err("Invalid loaded Stop probe setting"),
        };
        let phase_probe = phases::enabled(variables, active)?;
        if !active {
            return Ok(None);
        }
        if !cfg!(windows)
            || !address.ip().is_loopback()
            || config.read_only
            || config.hardware_mode != "simulation"
            || !matches!(config.environment.as_str(), "development" | "test")
            || variables
                .get("CIRNET_HARDWARE_START_RENDEZVOUS")
                .map(String::as_str)
                != Some("1")
        {
            return Err("Loaded Stop probe requires an isolated Windows simulation lane");
        }
        if qpc_ns().is_none() {
            return Err("Loaded Stop probe QPC unavailable");
        }
        let session = variables
            .get("CIRNET_ARTIFACTS_SESSION")
            .filter(|value| !value.is_empty())
            .ok_or("Loaded Stop probe requires an owned artifact session")?;
        let session =
            fs::canonicalize(session).map_err(|_| "Loaded Stop artifact session unavailable")?;
        let lane = std::env::current_dir()
            .and_then(fs::canonicalize)
            .map_err(|_| "Loaded Stop probe working directory unavailable")?;
        if lane == session || !lane.starts_with(&session) {
            return Err("Loaded Stop probe working directory is outside the owned session");
        }
        let database = config
            .database_url
            .strip_prefix("sqlite:///")
            .and_then(|path| fs::canonicalize(path).ok());
        if database.as_deref() != Some(lane.join("baseline.sqlite").as_path()) {
            return Err("Loaded Stop probe requires the isolated SQLite lane");
        }
        let directory = lane.join("stop-observations");
        fs::create_dir(&directory).map_err(|_| "Loaded Stop evidence directory must be new")?;
        Ok(Some(Arc::new(Self {
            directory,
            starts: StartRendezvous::new(START_TIMEOUT),
            phases: phase_probe.then(phases::PhaseBuffer::default),
            events: AtomicUsize::new(0),
            failed: AtomicBool::new(false),
        })))
    }

    pub(crate) fn begin_stop_phases(&self, id: &str) -> Option<StopPhaseTrace> {
        self.phases.as_ref()?.begin(id)
    }

    #[doc(hidden)]
    pub fn flush_stop_phases(&self) {
        let Some(phases) = &self.phases else {
            return;
        };
        let path = self.directory.with_file_name("stop-phases.json");
        let written = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .and_then(|file| phases.write(file));
        if written.is_err() {
            crate::diagnostics::safety_log(format_args!("Loaded Stop phase sidecar write failed"));
        }
    }

    pub(crate) async fn start(&self, id: &str) -> Result<RpcTrace<'_>, GatewayError> {
        let ticket = self.starts.arrive(id).await?;
        Ok(RpcTrace {
            probe: self,
            id: id.to_owned(),
            kind: Kind::Start(ticket),
            sent_ns: None,
        })
    }

    pub(crate) fn stop(&self, id: &str, source: StopSource) -> RpcTrace<'_> {
        RpcTrace {
            probe: self,
            id: id.to_owned(),
            kind: Kind::Stop(source),
            sent_ns: None,
        }
    }

    pub(crate) fn settled(&self, id: &str, released: bool) {
        let event = if released {
            "lease-released"
        } else {
            "lease-quarantined"
        };
        self.record(id, event, qpc_ns(), json!({}));
    }

    fn record(&self, id: &str, event: &str, timestamp: Option<u64>, mut fields: Value) {
        if self.failed.load(Ordering::Relaxed) {
            return;
        }
        let written = (|| {
            let timestamp = timestamp.filter(|value| *value != 0).ok_or(())?;
            if !identity(id) || self.events.fetch_add(1, Ordering::Relaxed) >= MAX_EVENTS {
                return Err(());
            }
            fields["event"] = json!(event);
            fields["at_ns"] = json!(timestamp);
            fields["clock"] = json!(CLOCK);
            let trace = self.directory.join(id);
            match fs::create_dir(&trace) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    if fs::canonicalize(&trace).map_err(|_| ())? != trace {
                        return Err(());
                    }
                }
                Err(_) => return Err(()),
            }
            let path = trace.join(format!("{timestamp}-{event}.json"));
            let encoded = serde_json::to_vec(&fields).map_err(|_| ())?;
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)
                .map_err(|_| ())?;
            file.write_all(&encoded).map_err(|_| ())
        })();
        if written.is_err() && !self.failed.swap(true, Ordering::Relaxed) {
            crate::diagnostics::safety_log(format_args!("Loaded Stop probe evidence write failed"));
        }
    }
}

fn identity(id: &str) -> bool {
    id.len() == 32
        && id
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
}

enum Kind {
    Start(Arc<Ticket>),
    Stop(StopSource),
}

pub(crate) struct RpcTrace<'a> {
    probe: &'a StopProbe,
    id: String,
    kind: Kind,
    sent_ns: Option<u64>,
}

impl RpcTrace<'_> {
    pub(crate) fn before_send<T>(&mut self, request: &mut Request<T>) -> Result<(), Status> {
        let metadata = request.metadata_mut();
        match &self.kind {
            Kind::Start(ticket) => {
                metadata.insert(
                    START_WAVE,
                    MetadataValue::try_from(ticket.metadata.as_str())
                        .map_err(|_| Status::internal("Invalid loaded Stop cohort"))?,
                );
            }
            Kind::Stop(_) => {
                metadata.insert(STOP_INGRESS, MetadataValue::from_static(CLOCK));
            }
        }
        self.sent_ns = qpc_ns();
        Ok(())
    }

    pub(crate) fn returned(self, response: Option<&Response<pb::OperationReply>>) {
        // Sample before reading any response fields or metadata.
        let at_ns = qpc_ns();
        let header = match &self.kind {
            Kind::Start(_) => START_WAVE,
            Kind::Stop(_) => STOP_INGRESS,
        };
        let metadata: Vec<_> = response.map_or_else(Vec::new, |response| {
            response
                .metadata()
                .get_all(header)
                .iter()
                .map(|value| (header, value.to_str().ok()))
                .collect()
        });
        let (event, fields) = match &self.kind {
            Kind::Start(ticket) => (
                "start-returned",
                json!({
                    "sent_ns": self.sent_ns, "start_wave_id": ticket.id, "wire_metadata": metadata,
                }),
            ),
            Kind::Stop(source) => {
                let safe = response.is_some_and(|response| {
                    let reply = response.get_ref();
                    reply.accepted
                        && reply.code == pb::ErrorCode::Ok as i32
                        && reply.state == "SAFE_STATE"
                });
                (
                    "stop-ack",
                    json!({
                        "sent_ns": self.sent_ns, "kind": source.name(), "safe": safe, "wire_metadata": metadata,
                    }),
                )
            }
        };
        self.probe.record(&self.id, event, at_ns, fields);
    }
}

#[derive(Debug)]
struct Ticket {
    id: String,
    metadata: String,
}

type Outcome = Result<Arc<Ticket>, GatewayError>;

struct Pending {
    wave: u64,
    deadline: Instant,
    members: BTreeSet<String>,
    outcome: watch::Sender<Option<Outcome>>,
}

#[derive(Default)]
struct State {
    wave: u64,
    broken: bool,
    pending: Option<Pending>,
}

struct StartRendezvous {
    timeout: Duration,
    state: Mutex<State>,
}

impl StartRendezvous {
    fn new(timeout: Duration) -> Self {
        Self {
            timeout,
            state: Mutex::new(State::default()),
        }
    }

    async fn arrive(&self, id: &str) -> Outcome {
        let (wave, deadline, mut received) = {
            let mut state = self.state.lock().map_err(|_| invalid_wave())?;
            if state.broken {
                return Err(invalid_wave());
            }
            if !identity(id) {
                Self::fail(&mut state, invalid_wave());
                return Err(invalid_wave());
            }
            if state.pending.is_none() {
                if state.wave >= MAX_WAVES {
                    Self::fail(&mut state, invalid_wave());
                    return Err(invalid_wave());
                }
                state.wave += 1;
                state.pending = Some(Pending {
                    wave: state.wave,
                    deadline: Instant::now() + self.timeout,
                    members: BTreeSet::new(),
                    outcome: watch::channel(None).0,
                });
            }
            let pending = state.pending.as_mut().expect("pending Start cohort");
            if Instant::now() >= pending.deadline {
                Self::fail(&mut state, wave_timeout());
                return Err(wave_timeout());
            }
            if !pending.members.insert(id.to_owned()) {
                Self::fail(&mut state, invalid_wave());
                return Err(invalid_wave());
            }
            let result = (pending.wave, pending.deadline, pending.outcome.subscribe());
            if pending.members.len() == PARTICIPANTS {
                let wave_id = uuid::Uuid::new_v4().simple().to_string();
                let metadata = format!(
                    "v1:{wave_id}:{}",
                    pending
                        .members
                        .iter()
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(":")
                );
                if Instant::now() >= pending.deadline {
                    Self::fail(&mut state, wave_timeout());
                    return Err(wave_timeout());
                }
                let pending = state.pending.take().expect("pending Start cohort");
                pending.outcome.send_replace(Some(Ok(Arc::new(Ticket {
                    id: wave_id,
                    metadata,
                }))));
            }
            result
        };
        let mut arrival = Arrival {
            barrier: self,
            wave,
            pending: true,
        };
        let result = timeout_at(deadline, async {
            loop {
                if let Some(result) = received.borrow_and_update().clone() {
                    return result;
                }
                received.changed().await.map_err(|_| invalid_wave())?;
            }
        })
        .await;
        arrival.pending = false;
        match result {
            Ok(result) => result,
            Err(_) => {
                self.abort(wave, wave_timeout());
                Err(wave_timeout())
            }
        }
    }

    fn abort(&self, wave: u64, error: GatewayError) {
        if let Ok(mut state) = self.state.lock()
            && state
                .pending
                .as_ref()
                .is_some_and(|pending| pending.wave == wave)
        {
            Self::fail(&mut state, error);
        }
    }

    fn fail(state: &mut State, error: GatewayError) {
        state.broken = true;
        if let Some(pending) = state.pending.take() {
            pending.outcome.send_replace(Some(Err(error)));
        }
    }
}

struct Arrival<'a> {
    barrier: &'a StartRendezvous,
    wave: u64,
    pending: bool,
}

impl Drop for Arrival<'_> {
    fn drop(&mut self) {
        if self.pending {
            self.barrier.abort(self.wave, invalid_wave());
        }
    }
}

fn invalid_wave() -> GatewayError {
    GatewayError::new("PROTOCOL_MISMATCH")
}
fn wave_timeout() -> GatewayError {
    GatewayError::new("TIMEOUT")
}

#[cfg(windows)]
fn qpc_ns() -> Option<u64> {
    use std::sync::OnceLock;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn QueryPerformanceCounter(value: *mut i64) -> i32;
        fn QueryPerformanceFrequency(value: *mut i64) -> i32;
    }
    static FREQUENCY: OnceLock<Option<u64>> = OnceLock::new();
    let frequency = (*FREQUENCY.get_or_init(|| {
        let mut frequency = 0i64;
        // SAFETY: i64 is writable LARGE_INTEGER storage.
        (unsafe { QueryPerformanceFrequency(&mut frequency) } != 0 && frequency > 0)
            .then_some(frequency as u64)
    }))?;
    let mut ticks = 0i64;
    // SAFETY: i64 is writable LARGE_INTEGER storage.
    if unsafe { QueryPerformanceCounter(&mut ticks) } == 0 || ticks < 0 {
        return None;
    }
    ((ticks as u128) * 1_000_000_000 / u128::from(frequency))
        .try_into()
        .ok()
}

#[cfg(not(windows))]
fn qpc_ns() -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "11111111111111111111111111111111";
    const B: &str = "22222222222222222222222222222222";
    const C: &str = "33333333333333333333333333333333";
    const D: &str = "44444444444444444444444444444444";

    #[test]
    fn probe_is_disabled_by_default_and_refuses_unowned_execution() {
        let mut config = Config::from_vars(&HashMap::new()).unwrap();
        let loopback = "127.0.0.1:5001".parse().unwrap();
        let public = "0.0.0.0:5001".parse().unwrap();
        let mut variables = HashMap::new();
        assert!(
            StopProbe::configure(&variables, &config, public)
                .unwrap()
                .is_none()
        );
        variables.insert(ENABLE.into(), "invalid".into());
        assert!(StopProbe::configure(&variables, &config, loopback).is_err());
        variables.insert(ENABLE.into(), "1".into());
        assert!(StopProbe::configure(&variables, &config, loopback).is_err());
        variables.insert("CIRNET_HARDWARE_START_RENDEZVOUS".into(), "1".into());
        config.read_only = false;
        assert!(StopProbe::configure(&variables, &config, public).is_err());
        config.environment = "production".into();
        assert!(StopProbe::configure(&variables, &config, loopback).is_err());
        config.environment = "development".into();
        assert!(StopProbe::configure(&variables, &config, loopback).is_err());
    }

    #[tokio::test]
    async fn four_distinct_starts_share_one_sorted_wave_then_next_wave_is_fresh() {
        let gate = StartRendezvous::new(Duration::from_secs(1));
        let mut previous = None;
        for _ in 0..2 {
            let (a, b, c, d) = tokio::join!(
                gate.arrive(D),
                gate.arrive(B),
                gate.arrive(C),
                gate.arrive(A)
            );
            let ticket = a.unwrap();
            assert!(identity(&ticket.id));
            assert_eq!(ticket.metadata, format!("v1:{}:{A}:{B}:{C}:{D}", ticket.id));
            for peer in [b, c, d] {
                assert!(Arc::ptr_eq(&ticket, &peer.unwrap()));
            }
            assert_ne!(previous.as_deref(), Some(ticket.id.as_str()));
            previous = Some(ticket.id.clone());
        }
    }

    #[tokio::test]
    async fn duplicate_start_aborts_the_whole_unreleased_wave() {
        let gate = StartRendezvous::new(Duration::from_secs(1));
        let (first, duplicate) = tokio::join!(gate.arrive(A), gate.arrive(A));
        assert_eq!(first.unwrap_err().code, "PROTOCOL_MISMATCH");
        assert_eq!(duplicate.unwrap_err().code, "PROTOCOL_MISMATCH");
        assert!(gate.arrive(B).await.is_err());
    }

    #[tokio::test]
    async fn timeout_breaks_the_cohort_instead_of_mixing_late_members() {
        let gate = StartRendezvous::new(Duration::from_millis(10));
        let (first, second) = tokio::join!(gate.arrive(A), gate.arrive(B));
        assert_eq!(first.unwrap_err().code, "TIMEOUT");
        assert_eq!(second.unwrap_err().code, "TIMEOUT");
        assert!(gate.arrive(C).await.is_err());
    }

    #[tokio::test]
    async fn cancelled_member_wakes_peers_without_releasing_the_wave() {
        let gate = Arc::new(StartRendezvous::new(Duration::from_secs(2)));
        let a = {
            let gate = gate.clone();
            tokio::spawn(async move { gate.arrive(A).await })
        };
        let b = {
            let gate = gate.clone();
            tokio::spawn(async move { gate.arrive(B).await })
        };
        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if gate
                    .state
                    .lock()
                    .unwrap()
                    .pending
                    .as_ref()
                    .is_some_and(|wave| wave.members.len() == 2)
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        a.abort();
        assert!(a.await.unwrap_err().is_cancelled());
        assert_eq!(b.await.unwrap().unwrap_err().code, "PROTOCOL_MISMATCH");
        assert!(gate.arrive(C).await.is_err());
    }
}
