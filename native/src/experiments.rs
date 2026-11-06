mod capture_api;
pub mod captures;
mod instrument;
mod lifecycle;
pub mod operations;
mod requests;
mod scheduler;
mod worker;

use crate::{
    assignments::AssignmentService,
    auth::{self, SessionContext},
    compiler::ExecutionCompiler,
    config::Config,
    db::{
        Db,
        authority::SchedulerAuthority,
        runtime::{Cas, Expected, ExperimentRepository, ExperimentRow, RuntimeError, Update},
    },
    error::ApiError,
    events::{ControlIdentity, EventHub},
    hardware::{GatewayError, HardwareClient, pb},
    http_auth::{Revocation, SessionRevoker},
    projects::ProjectService,
    websocket::{ControlCallbacks, ControlFuture, DisconnectCause},
};
use captures::CaptureStore;
use cirnet_contracts_native::validation::Registry;
use lifecycle::transition;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap, HashSet, VecDeque},
    future::Future,
    path::Path,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{Mutex, Notify, Semaphore};
use tokio::time::Instant;

const LEASE_SECONDS: f64 = 120.0;
const STOPS_IN_FLIGHT: usize = 4;
const STOPS_PENDING: usize = 16;
const MAX_QUEUE: usize = 50;
const RATE_ENTRIES: usize = 4096;
const RATE_WINDOW: Duration = Duration::from_secs(1);
const RECOVERY_LIMIT: usize = 10_000;

#[derive(Clone)]
pub struct ExperimentManager(Arc<Manager>);

struct Manager {
    repo: ExperimentRepository,
    auth_db: Db,
    authority: SchedulerAuthority,
    admissions: std::sync::Mutex<usize>,
    config: Arc<Config>,
    registry: Arc<Registry>,
    hardware: HardwareClient,
    compiler: ExecutionCompiler,
    events: EventHub,
    assignments: AssignmentService,
    projects: ProjectService,
    operation_guards: operations::OperationGuards,
    captures: OnceLock<CaptureStore>,
    #[cfg(test)]
    test_capture_gate: OnceLock<(Notify, Notify)>,
    state: Mutex<Scheduler>,
    closing: AtomicBool,
    cleanup_failed: AtomicBool,
    idle: Notify,
    stop_slots: Semaphore,
    worker_slots: Semaphore,
}

struct OwnedAdmission(Arc<Manager>);

impl Drop for OwnedAdmission {
    fn drop(&mut self) {
        let mut count = self
            .0
            .admissions
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *count -= 1;
        self.0.idle.notify_one();
    }
}

#[derive(Default)]
struct Scheduler {
    queues: BTreeMap<String, VecDeque<String>>,
    active: HashMap<String, Arc<Reservation>>,
    rate: HashMap<String, Instant>,
    dispatching: HashSet<String>,
    dispatch_again: HashSet<String>,
    stop_pending: HashSet<String>,
    fenced_stations: HashSet<String>,
    sequence: i64,
}

struct Reservation {
    generation: String,
    target: pb::Target,
    mode: String,
    cancelled: AtomicBool,
    emergency: AtomicBool,
    stop_acknowledged: AtomicBool,
    command: Mutex<()>,
}

impl Reservation {
    fn new(generation: String, target: pb::Target, mode: String) -> Self {
        Self {
            generation,
            target,
            mode,
            cancelled: AtomicBool::new(false),
            emergency: AtomicBool::new(false),
            stop_acknowledged: AtomicBool::new(false),
            command: Mutex::new(()),
        }
    }

    fn cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

impl ExperimentManager {
    pub fn new(
        repo: ExperimentRepository,
        hardware: HardwareClient,
        config: Arc<Config>,
        registry: Arc<Registry>,
        events: EventHub,
        assignments: AssignmentService,
        projects: ProjectService,
        authority: SchedulerAuthority,
    ) -> Result<Self, ApiError> {
        let workers = config
            .simulation_workers
            .checked_add(4)
            .filter(|value| *value <= Semaphore::MAX_PERMITS)
            .ok_or_else(|| ApiError::new("INVALID_CONFIGURATION", 422))?;
        Ok(Self(Arc::new(Manager {
            auth_db: repo.reads(),
            authority,
            admissions: std::sync::Mutex::new(0),
            repo,
            hardware,
            config,
            compiler: ExecutionCompiler::new(registry.clone()),
            registry,
            events,
            assignments,
            projects,
            operation_guards: operations::OperationGuards::default(),
            captures: OnceLock::new(),
            #[cfg(test)]
            test_capture_gate: OnceLock::new(),
            state: Mutex::new(Scheduler::default()),
            closing: AtomicBool::new(false),
            cleanup_failed: AtomicBool::new(false),
            idle: Notify::new(),
            stop_slots: Semaphore::new(STOPS_IN_FLIGHT),
            worker_slots: Semaphore::new(workers),
        })))
    }

    pub async fn queue(&self, station_id: &str) -> Result<Vec<String>, ApiError> {
        let state = self.0.state.lock().await;
        Ok(state
            .queues
            .get(station_id)
            .map_or_else(Vec::new, |queue| queue.iter().cloned().collect()))
    }

    fn capture_store(&self) -> Result<&CaptureStore, ApiError> {
        self.0
            .captures
            .get()
            .ok_or_else(|| ApiError::new("UNAVAILABLE", 503))
    }

    pub fn stop_admissions(&self) {
        // Share the gate with owned() so no request can register after closing.
        let _admissions = self
            .0
            .admissions
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.0.closing.store(true, Ordering::Release);
    }

    async fn owned<T: Send + 'static>(
        &self,
        future: impl Future<Output = Result<T, ApiError>> + Send + 'static,
    ) -> Result<T, ApiError> {
        let admission = {
            let mut count = self
                .0
                .admissions
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if self.closing() {
                return Err(ApiError::new("UNAVAILABLE", 503));
            }
            *count += 1;
            OwnedAdmission(self.0.clone())
        };
        tokio::spawn(async move {
            let _admission = admission;
            future.await
        })
        .await
        .map_err(|_| internal())?
    }

    fn admissions_pending(&self) -> bool {
        *self
            .0
            .admissions
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            > 0
    }

    async fn check_authority(&self) -> Result<(), ApiError> {
        if self.0.authority.check().await.is_ok() {
            Ok(())
        } else {
            self.stop_admissions();
            Err(ApiError::new("UNAVAILABLE", 503))
        }
    }

    fn closing(&self) -> bool {
        self.0.closing.load(Ordering::Acquire)
    }

    async fn session_active(&self, session: &str) -> bool {
        match self.0.auth_db.session_by_id(session).await {
            Ok(Some(row)) => {
                auth::context_from_row(row, self.0.config.allow_guest, now()).is_some()
            }
            _ => false,
        }
    }

    async fn record(&self, id: &str, owner: Option<&str>) -> Result<ExperimentRow, ApiError> {
        let row = self
            .0
            .repo
            .get(id)
            .await
            .map_err(runtime_error)?
            .ok_or_else(|| ApiError::new("NOT_FOUND", 404))?;
        if owner.is_some_and(|owner| owner != row.owner_id) {
            return Err(ApiError::new("FORBIDDEN", 403));
        }
        Ok(row)
    }

    pub async fn get(&self, owner: &str, id: &str) -> Result<Value, ApiError> {
        let row = self.record(id, Some(owner)).await?;
        if row.payload["state"] != "QUEUED" {
            return Ok(self.project(&row, None).await);
        }
        let state = self.0.state.lock().await;
        let row = self.record(id, Some(owner)).await?;
        Ok(self.project(&row, state.queue_position(&row.payload)).await)
    }

    async fn project(&self, row: &ExperimentRow, position: Option<usize>) -> Value {
        let mut view = public_record(&row.payload, position);
        if let Some(assignment) = row.payload["assignment_id"].as_str()
            && !self
                .0
                .assignments
                .may_disclose_experiment_feedback(&row.owner_id, assignment)
                .await
                .unwrap_or(false)
        {
            redact_assignment_feedback(&mut view);
        }
        view
    }

    async fn publish(&self, state: &Scheduler, row: &ExperimentRow) {
        self.0.events.publish(
            &row.owner_id,
            json!({
                "type":"experiment.updated",
                "experiment":self.project(row, state.queue_position(&row.payload)).await,
            }),
        );
    }

    async fn assignment_snapshot(&self, row: &ExperimentRow) -> Result<Value, ApiError> {
        if let Some(snapshot) = row.payload.get("_assignment_snapshot") {
            return Ok(snapshot.clone());
        }
        let Some(id) = row.payload["assignment_id"].as_str() else {
            return Ok(Value::Null);
        };
        self.0.assignments.legacy_assignment_definition(id).await
    }

    async fn save(
        &self,
        state: &Scheduler,
        row: &ExperimentRow,
        status: &str,
        updates: Value,
    ) -> Result<ExperimentRow, ApiError> {
        let payload = transition(&row.payload, status, updates)?;
        let cas = self
            .0
            .repo
            .update(Update {
                expected: expected(&row.payload)?,
                payload: &payload,
            })
            .await
            .map_err(runtime_error)?;
        applied(cas)?;
        // A guest claim can transfer the row after a system worker reads it.
        // Publish to the durable owner after the committed transition.
        if let Ok(current) = self.record(field(&payload, "experiment_id")?, None).await {
            self.publish(state, &current).await;
            Ok(current)
        } else {
            // The state change committed. A failed postcommit event snapshot
            // must not turn it into an apparent failed mutation or expose old owner data.
            Ok(ExperimentRow {
                owner_id: row.owner_id.clone(),
                payload,
            })
        }
    }
}

impl Scheduler {
    fn queue_position(&self, payload: &Value) -> Option<usize> {
        let station = payload["station_id"].as_str()?;
        let id = payload["experiment_id"].as_str()?;
        self.queues
            .get(station)?
            .iter()
            .position(|queued| queued == id)
            .map(|index| index + 1)
    }
}

fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn field<'a>(value: &'a Value, name: &str) -> Result<&'a str, ApiError> {
    value[name].as_str().ok_or_else(internal)
}

fn expected(payload: &Value) -> Result<Expected<'_>, ApiError> {
    Ok(Expected {
        id: field(payload, "experiment_id")?,
        revision: payload
            .get("revision")
            .map_or(Some(0), Value::as_i64)
            .ok_or_else(internal)?,
        generation: payload["_reservation_generation"].as_str(),
    })
}

fn target(payload: &Value) -> Result<pb::Target, ApiError> {
    Ok(pb::Target {
        station_id: field(payload, "station_id")?.into(),
        experiment_id: field(payload, "experiment_id")?.into(),
    })
}

fn applied(cas: Cas) -> Result<(), ApiError> {
    match cas {
        Cas::Applied => Ok(()),
        Cas::Missing => Err(ApiError::new("NOT_FOUND", 404)),
        Cas::Stale | Cas::Occupied | Cas::Quarantined => Err(ApiError::new("INVALID_STATE", 409)),
    }
}

fn runtime_error(error: RuntimeError) -> ApiError {
    match error {
        RuntimeError::Forbidden => ApiError::new("FORBIDDEN", 403),
        RuntimeError::CaptureIdentityConflict => ApiError::new("CAPTURE_KEY_CONFLICT", 422),
        RuntimeError::CaptureRetired => ApiError::new("CAPTURE_UNAVAILABLE", 422),
        RuntimeError::InvalidPageLimit => ApiError::new("INVALID_PAGE_LIMIT", 422),
        RuntimeError::InvalidCursor => ApiError::new("INVALID_CURSOR", 422),
        RuntimeError::DocumentUnavailable => ApiError::new("DOCUMENT_UNAVAILABLE", 422),
        RuntimeError::OperationConflict => ApiError::new("IDEMPOTENCY_CONFLICT", 409),
        RuntimeError::CaptureNotFound => ApiError::new("NOT_FOUND", 404),
        RuntimeError::CaptureActive => ApiError::new("INVALID_STATE", 409),
        RuntimeError::RevisionLimit => ApiError::new("REVISION_LIMIT_REACHED", 422),
        RuntimeError::InvalidRetentionQuery => {
            ApiError::new("INVALID_CAPTURE_RETENTION_QUERY", 422)
        }
        _ => internal(),
    }
}

fn gateway(error: GatewayError) -> ApiError {
    let status = if matches!(error.code.as_str(), "TIMEOUT" | "GATEWAY_TIMEOUT") {
        504
    } else {
        503
    };
    ApiError::new(error.code, status)
}

fn internal() -> ApiError {
    ApiError::new("INTERNAL_ERROR", 500)
}

fn owner(context: &SessionContext) -> Result<&str, ApiError> {
    context
        .owner_id
        .as_deref()
        .ok_or_else(|| ApiError::new("SESSION_EXPIRED", 401))
}

fn terminal(payload: &Value) -> bool {
    matches!(payload["state"].as_str(), Some("COMPLETE" | "FAULT"))
}

fn public_record(payload: &Value, position: Option<usize>) -> Value {
    let mut view = payload.clone();
    if let Some(value) = view.as_object_mut() {
        value.retain(|key, _| !key.starts_with('_'));
        if value
            .get("capture")
            .is_some_and(|capture| capture.get("samples").is_some())
        {
            value.insert("capture".into(), Value::Null);
        }
        value.entry("revision").or_insert(json!(0));
        value.entry("assessment").or_insert(Value::Null);
        value.insert("queue_position".into(), json!(position));
    }
    view
}

fn redact_assignment_feedback(record: &mut Value) {
    record["topology_resolution"] = Value::Null;
    let note = "Detailed assignment feedback is restricted by the instructor.";
    for (field, observed) in [
        (
            "topology_verification",
            &["observed_signals", "unknown_components"][..],
        ),
        (
            "functional_verification",
            &["observed_signals", "observed_truth_table"][..],
        ),
        (
            "assessment",
            &["policy", "topology_evaluated", "function_evaluated"][..],
        ),
    ] {
        if let Some(evidence) = record[field].as_object_mut() {
            evidence.retain(|key, _| {
                matches!(key.as_str(), "schema_version" | "status")
                    || observed.contains(&key.as_str())
            });
            evidence.insert("issues".into(), json!([note]));
        }
    }
}

impl ControlCallbacks for ExperimentManager {
    fn disconnect_control(
        &self,
        identity: ControlIdentity,
        cause: DisconnectCause,
    ) -> ControlFuture {
        let manager = self.clone();
        Box::pin(async move {
            let code = match cause {
                DisconnectCause::Disconnected => "DISCONNECTED",
                DisconnectCause::SessionExpired => "SESSION_EXPIRED",
            };
            manager
                .cancel_matching(
                    Some(&identity.owner),
                    Some(&identity.session_id),
                    Some(&identity.client_id),
                    code,
                )
                .await
        })
    }
}

impl SessionRevoker for ExperimentManager {
    fn revoke<'a>(&'a self, session_ids: &'a [String]) -> Revocation<'a> {
        Box::pin(async move {
            let result = async {
                for session in session_ids {
                    self.cancel_matching(None, Some(session), None, "SESSION_REVOKED")
                        .await?;
                }
                Ok(())
            }
            .await;
            for session in session_ids {
                self.0.events.revoke_session(session);
            }
            result
        })
    }
}

#[cfg(test)]
#[path = "../tests/experiment_manager.rs"]
mod tests;
