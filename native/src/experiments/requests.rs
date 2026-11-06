use super::*;
use crate::stop_probe::{Phase, StopPhaseTrace, mark_stop_phase};
use crate::{
    compiler,
    db::runtime::{Create, OperationInsert, OperationKey, OperationUpdate},
    preview::{self, GraphVersion},
};
use operations::{operation_key, request_fingerprint};
use uuid::Uuid;

impl ExperimentManager {
    pub async fn create(
        &self,
        context: &SessionContext,
        payload: &Value,
        key: Option<&str>,
        request_id: Option<&str>,
        v2: bool,
    ) -> Result<Value, ApiError> {
        let manager = self.clone();
        let context = context.clone();
        let payload = payload.clone();
        let key = key.map(str::to_owned);
        let request_id = request_id.map(str::to_owned);
        self.owned(async move {
            manager
                .create_inner(
                    &context,
                    &payload,
                    key.as_deref(),
                    request_id.as_deref(),
                    v2,
                )
                .await
        })
        .await
    }

    async fn create_inner(
        &self,
        context: &SessionContext,
        request: &Value,
        key: Option<&str>,
        request_id: Option<&str>,
        v2: bool,
    ) -> Result<Value, ApiError> {
        if self.closing() {
            return Err(ApiError::new("UNAVAILABLE", 503));
        }
        let owner = owner(context)?;
        if !self.session_active(&context.session_id).await {
            return Err(ApiError::new("SESSION_EXPIRED", 401));
        }
        let operation = key.map(operation_key).transpose()?.map(|key| OperationKey {
            owner_id: owner,
            kind: "create",
            scope: "",
            key,
        });
        let fingerprint = operation
            .map(|_| request_fingerprint(request))
            .transpose()?;
        let guard = operation
            .map(|identity| self.0.operation_guards.lock(identity))
            .transpose()?;
        let _operation_guard = match &guard {
            Some(guard) => Some(guard.lock().await),
            None => None,
        };
        if let (Some(identity), Some(fingerprint)) = (operation, &fingerprint)
            && let Some(existing) = self.previous(identity, fingerprint).await?
        {
            return self.get(owner, field(&existing, "experiment_id")?).await;
        }

        let invalid = || ApiError::new("INVALID_CONFIGURATION", 422);
        let station = request["station_id"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or_else(invalid)?;
        self.check_authority().await?;
        let caps = self
            .0
            .hardware
            .capabilities(station)
            .await
            .map_err(gateway)?;
        let caps_json = self.validate_capabilities(&caps)?;
        let assignment = match request["assignment_id"].as_str() {
            Some(id) => Some(self.0.assignments.resolve_snapshot(owner, id).await?),
            None => None,
        };
        let assignment_definition = assignment.as_ref().map(|snapshot| &snapshot.definition);
        let (graph, reference) = if request.get("circuit_document_id").is_some()
            || request.get("circuit_revision").is_some()
        {
            if request.get("circuit_graph").is_some() {
                return Err(invalid());
            }
            let id = request["circuit_document_id"]
                .as_str()
                .filter(|value| !value.is_empty())
                .ok_or_else(invalid)?;
            let revision = crate::numeric::bounded_integer(
                &request["circuit_revision"],
                1,
                9_007_199_254_740_991,
            )
            .ok_or_else(invalid)?;
            let snapshot = self
                .0
                .projects
                .get_circuit(owner, id, Some(revision), true)
                .await?;
            if !v2 && snapshot["graph_schema_version"] == "1.2" {
                return Err(ApiError::new("UNSUPPORTED_DOCUMENT_VERSION", 422));
            }
            (
                snapshot["graph"].clone(),
                Some(json!({"document_id":id, "revision":revision})),
            )
        } else {
            (request["circuit_graph"].clone(), None)
        };

        if caps.mode == "simulation" {
            preview::validate_graph(&self.0.registry, &graph, GraphVersion::V2)
                .map_err(|error| ApiError::new(error.code, error.status))?;
        } else if assignment_definition.is_none() {
            return Err(ApiError::new("ASSIGNMENT_REQUIRED", 422));
        }

        let id = Uuid::new_v4().simple().to_string();
        let config = request
            .as_object()
            .ok_or_else(invalid)?
            .iter()
            .filter(|(key, _)| {
                matches!(
                    key.as_str(),
                    "capture_config" | "test_vectors" | "clock_config" | "generator_config"
                )
            })
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect::<serde_json::Map<_, _>>();
        let mut record = json!({
            "schema_version":"1.0", "experiment_id":id, "circuit_id":graph["circuit_id"].as_str().unwrap_or(&id),
            "station_id":caps.station_id, "assignment_id":assignment_definition.and_then(|value| value["assignment_id"].as_str()),
            "mode":caps.mode, "state":"CREATED", "state_history":["CREATED"], "revision":0,
            "execution_decision":null, "safety_verification":null, "topology_verification":null,
            "topology_resolution":null, "functional_verification":{"schema_version":"1.0","status":"NOT_EVALUATED","issues":[]},
            "capture":null, "assessment":null, "error_code":null, "queue_position":null, "lease_expires_at":null,
            "_circuit_graph":graph, "_configuration":config, "_assignment_snapshot":assignment_definition,
            "_snapshot_provenance":"created", "_capabilities":caps_json, "_creation_request_id":request_id,
        });
        if let Some(reference) = reference {
            record["_document_reference"] = reference;
        }
        if let (Some(operation), Some(fingerprint)) = (operation, &fingerprint) {
            record["_operation"] = json!({"key":operation.key, "fingerprint":fingerprint});
        }
        // Physical requests use the virtual admission profile for input shape;
        // actual routes and electrical safety are resolved inside the worker.
        let mut admission = caps_json;
        admission["mode"] = json!("simulation");
        self.0
            .compiler
            .compile_value(&record, assignment_definition, &admission, None)?;

        let op_payload = operation.map(|identity| json!({
            "schema_version":"1.0", "operation_key":identity.key, "kind":"create", "status":"APPLIED",
            "experiment_id":id, "error_code":null, "revision":1,
        }));
        let mut tx = self.0.repo.begin().await.map_err(runtime_error)?;
        let current =
            auth::authorize_session(&mut tx, &context.session_id, owner, &self.0.config).await?;
        if let Some(snapshot) = &assignment {
            let assignment_id = field(&snapshot.definition, "assignment_id")?;
            record["_assignment_reference"] = self
                .0
                .assignments
                .authorize_snapshot(
                    &mut tx,
                    &current,
                    assignment_id,
                    snapshot.revision,
                    &snapshot.definition,
                )
                .await?;
        }
        let insertion = self
            .0
            .repo
            .create_in(
                &mut tx,
                Create {
                    owner_id: owner,
                    payload: &record,
                    operation: operation
                        .zip(fingerprint.as_deref())
                        .zip(op_payload.as_ref())
                        .map(|((identity, fingerprint), payload)| OperationInsert {
                            identity,
                            fingerprint,
                            payload,
                        }),
                },
            )
            .await;
        if let Err(error) = insertion {
            tx.rollback().await.map_err(|_| internal())?;
            if let (Some(identity), Some(fingerprint)) = (operation, &fingerprint)
                && let Some(existing) = self.previous(identity, fingerprint).await?
            {
                return self.get(owner, field(&existing, "experiment_id")?).await;
            }
            return Err(runtime_error(error));
        }
        tx.commit().await.map_err(|_| internal())?;
        self.get(owner, &id).await
    }

    pub async fn run(
        &self,
        context: &SessionContext,
        id: &str,
        key: Option<&str>,
        client: Option<&str>,
        request_id: Option<&str>,
    ) -> Result<Value, ApiError> {
        self.mutate("run", context, id, key, client, request_id, None)
            .await
    }

    pub async fn stop(
        &self,
        context: &SessionContext,
        id: &str,
        key: Option<&str>,
        request_id: Option<&str>,
    ) -> Result<Value, ApiError> {
        self.stop_observed(context, id, key, request_id, None).await
    }

    pub(crate) fn stop_phase_trace(&self, id: &str) -> Option<StopPhaseTrace> {
        self.0.hardware.stop_probe()?.begin_stop_phases(id)
    }

    pub(crate) async fn stop_observed(
        &self,
        context: &SessionContext,
        id: &str,
        key: Option<&str>,
        request_id: Option<&str>,
        phases: Option<StopPhaseTrace>,
    ) -> Result<Value, ApiError> {
        self.mutate("stop", context, id, key, None, request_id, phases)
            .await
    }

    async fn mutate(
        &self,
        kind: &'static str,
        context: &SessionContext,
        id: &str,
        key: Option<&str>,
        client: Option<&str>,
        request_id: Option<&str>,
        phases: Option<StopPhaseTrace>,
    ) -> Result<Value, ApiError> {
        let manager = self.clone();
        let context = context.clone();
        let id = id.to_owned();
        let key = key.map(str::to_owned);
        let client = client.map(str::to_owned);
        let request_id = request_id.map(str::to_owned);
        // A disconnected caller cannot cancel an admitted mutation.
        self.owned(async move {
            manager
                .mutate_inner(
                    kind,
                    &context,
                    &id,
                    key.as_deref(),
                    client.as_deref(),
                    request_id.as_deref(),
                    phases.as_ref(),
                )
                .await
        })
        .await
    }

    async fn mutate_inner(
        &self,
        kind: &str,
        context: &SessionContext,
        id: &str,
        key: Option<&str>,
        client: Option<&str>,
        request_id: Option<&str>,
        phases: Option<&StopPhaseTrace>,
    ) -> Result<Value, ApiError> {
        let owner = owner(context)?;
        if !self.session_active(&context.session_id).await {
            return Err(ApiError::new("SESSION_EXPIRED", 401));
        }
        let invoke = async {
            if kind == "run" {
                self.run_inner(context, id, client, request_id, key).await
            } else {
                self.stop_inner(context, id, "STOPPED", phases).await
            }
        };
        let Some(key) = key else {
            return invoke.await;
        };
        let key = operation_key(key)?;
        let identity = OperationKey {
            owner_id: owner,
            kind,
            scope: id,
            key,
        };
        let guard = self.0.operation_guards.lock(identity)?;
        let _operation_guard = guard.lock().await;
        let mut experiment = self.record(id, Some(owner)).await?;
        let fingerprint = request_fingerprint(&json!({"experiment_id":id}))?;
        let mut operation;
        let recovering;
        if let Some(previous) = self.previous(identity, &fingerprint).await? {
            operation = previous;
            recovering = true;
        } else {
            operation = json!({
                "schema_version":"1.0", "operation_key":key, "kind":kind, "status":"REQUESTED",
                "experiment_id":id, "error_code":null, "revision":0,
            });
            let mut tx = self.0.repo.begin().await.map_err(runtime_error)?;
            auth::authorize_session(&mut tx, &context.session_id, owner, &self.0.config).await?;
            let applied = self
                .0
                .repo
                .insert_operation_in(
                    &mut tx,
                    OperationInsert {
                        identity,
                        fingerprint: &fingerprint,
                        payload: &operation,
                    },
                )
                .await
                .map_err(runtime_error)?;
            tx.commit().await.map_err(|_| internal())?;
            recovering = !applied;
            if recovering {
                operation = self
                    .previous(identity, &fingerprint)
                    .await?
                    .ok_or_else(internal)?;
                experiment = self.record(id, Some(owner)).await?;
            }
        }
        if recovering {
            match operation["status"].as_str() {
                Some("FAILED") => return Err(operation_error(field(&operation, "error_code")?)),
                Some("ACCEPTED" | "APPLIED") => return self.get(owner, id).await,
                _ => {}
            }
        }

        let result = if recovering && kind == "run" && experiment.payload["state"] != "CREATED" {
            // An aggregate transition proves the previous Run reached admission.
            self.get(owner, id).await
        } else {
            invoke.await
        };
        let revision = operation["revision"].as_i64().ok_or_else(internal)?;
        match &result {
            Ok(_) => operation["status"] = json!("ACCEPTED"),
            Err(error) if error.status < 500 => {
                operation["status"] = json!("FAILED");
                operation["error_code"] = json!(error.code);
            }
            Err(_) => return result,
        }
        operation["revision"] = json!(revision + 1);
        if let Err(persistence) = self
            .save_observed_operation(identity, revision, &operation, phases)
            .await
        {
            // A concurrent guest claim can move both the experiment and its
            // operation. Keep the failed authorization from the fenced Stop.
            if matches!(persistence.code.as_str(), "NOT_FOUND" | "FORBIDDEN")
                && result.as_ref().is_err_and(|error| {
                    matches!(error.code.as_str(), "SESSION_EXPIRED" | "FORBIDDEN")
                })
            {
                return result;
            }
            return Err(persistence);
        }
        result
    }

    pub async fn operation(
        &self,
        owner: &str,
        kind: &str,
        id: Option<&str>,
        key: &str,
    ) -> Result<Value, ApiError> {
        let key = operation_key(key)?;
        let scope = match (kind, id) {
            ("create", _) => "",
            ("run" | "stop", Some(scope)) if !scope.is_empty() => scope,
            _ => return Err(ApiError::new("INVALID_CONFIGURATION", 422)),
        };
        let identity = OperationKey {
            owner_id: owner,
            kind,
            scope,
            key,
        };
        let guard = self.0.operation_guards.lock(identity)?;
        let _operation_guard = guard.lock().await;
        let mut value = self
            .0
            .repo
            .operation(identity)
            .await
            .map_err(runtime_error)?
            .ok_or_else(|| ApiError::new("NOT_FOUND", 404))?
            .payload;
        let id = field(&value, "experiment_id")?.to_owned();
        let experiment = self.get(owner, &id).await?;
        if value["status"] == "ACCEPTED" {
            let done = terminal(&experiment);
            let released = experiment["lease_expires_at"].is_null()
                && self
                    .0
                    .repo
                    .lease(&id)
                    .await
                    .map_err(runtime_error)?
                    .is_none();
            let acknowledged = (kind == "run"
                && compiler::array(&experiment["state_history"])
                    .iter()
                    .any(|state| state == "CAPTURING"))
                || (kind == "stop" && done && released);
            let failed = !acknowledged
                && (experiment["state"] == "FAULT"
                    || experiment["execution_decision"]["decision"]
                        .as_str()
                        .is_some_and(|decision| decision.starts_with("BLOCK_"))
                    || (kind == "run" && done && released));
            if acknowledged || failed {
                let revision = value["revision"].as_i64().ok_or_else(internal)?;
                value["status"] = json!(if failed { "FAILED" } else { "APPLIED" });
                value["error_code"] = json!(
                    failed.then(|| experiment["error_code"].as_str().unwrap_or("UNEXECUTABLE"))
                );
                value["revision"] = json!(revision + 1);
                self.save_operation(identity, revision, &value).await?;
            }
        }
        value["experiment"] = experiment;
        Ok(value)
    }

    pub(super) async fn previous(
        &self,
        identity: OperationKey<'_>,
        fingerprint: &str,
    ) -> Result<Option<Value>, ApiError> {
        let row = self
            .0
            .repo
            .operation(identity)
            .await
            .map_err(runtime_error)?;
        if let Some(row) = row {
            if row.fingerprint != fingerprint {
                return Err(ApiError::new("IDEMPOTENCY_CONFLICT", 409));
            }
            return Ok(Some(row.payload));
        }
        Ok(None)
    }

    pub(super) async fn save_operation(
        &self,
        identity: OperationKey<'_>,
        revision: i64,
        payload: &Value,
    ) -> Result<(), ApiError> {
        self.save_observed_operation(identity, revision, payload, None)
            .await
    }

    async fn save_observed_operation(
        &self,
        identity: OperationKey<'_>,
        revision: i64,
        payload: &Value,
        phases: Option<&StopPhaseTrace>,
    ) -> Result<(), ApiError> {
        mark_stop_phase(phases, Phase::OperationSaveStart);
        let begun = self.0.repo.begin().await;
        mark_stop_phase(phases, Phase::OperationBeginReturned);
        let mut tx = begun.map_err(runtime_error)?;
        let result = self
            .0
            .repo
            .update_operation_in(
                &mut tx,
                OperationUpdate {
                    identity,
                    expected_revision: revision,
                    payload,
                },
            )
            .await;
        mark_stop_phase(phases, Phase::OperationCasReturned);
        applied(result.map_err(runtime_error)?)?;
        let committed = tx.commit().await;
        mark_stop_phase(phases, Phase::OperationCommitReturned);
        committed.map_err(|_| internal())
    }

    pub async fn history(
        &self,
        owner: &str,
        limit: usize,
        cursor: Option<&str>,
        active: bool,
    ) -> Result<Value, ApiError> {
        let page = self
            .0
            .repo
            .page(owner, limit, cursor, active)
            .await
            .map_err(runtime_error)?;
        let positions: HashMap<_, _> = self
            .0
            .state
            .lock()
            .await
            .queues
            .values()
            .flat_map(|queue| {
                queue
                    .iter()
                    .enumerate()
                    .map(|(index, id)| (id.clone(), index + 1))
            })
            .collect();
        let mut items = Vec::with_capacity(page.items.len());
        for payload in page.items {
            let position = positions.get(field(&payload, "experiment_id")?).copied();
            items.push(
                self.project(
                    &ExperimentRow {
                        owner_id: owner.to_owned(),
                        payload,
                    },
                    position,
                )
                .await,
            );
        }
        Ok(json!({"schema_version":"1.0", "items":items, "next_cursor":page.next_cursor}))
    }

    pub async fn list(&self, owner: &str) -> Result<Value, ApiError> {
        let state = self.0.state.lock().await;
        let rows = self.0.repo.list_owner(owner).await.map_err(runtime_error)?;
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            items.push(self.project(&row, state.queue_position(&row.payload)).await);
        }
        Ok(Value::Array(items))
    }

    pub async fn document_reference(&self, owner: &str, id: &str) -> Result<Value, ApiError> {
        let row = self.record(id, Some(owner)).await?;
        let graph = &row.payload["_circuit_graph"];
        let reference = row
            .payload
            .get("_document_reference")
            .and_then(Value::as_object);
        let source = if reference.is_some() {
            "SAVED_DOCUMENT"
        } else if graph.is_object() {
            "INLINE_GRAPH"
        } else {
            "ASSIGNMENT_CONTEXT"
        };
        let mut value = json!({
            "schema_version":"1.0", "experiment_id":id, "snapshot_id":id, "source":source,
            "execution_mode":row.payload["mode"], "circuit_id":row.payload["circuit_id"],
            "graph_schema_version":graph["schema_version"], "assignment_id":row.payload["assignment_id"],
        });
        if let (Some(value), Some(reference)) = (value.as_object_mut(), reference) {
            value.extend(reference.clone());
        }
        Ok(value)
    }
}

fn operation_error(code: &str) -> ApiError {
    ApiError::new(
        code,
        match code {
            "FORBIDDEN" => 403,
            "SESSION_EXPIRED" => 401,
            "NOT_FOUND" | "EXPERIMENT_NOT_FOUND" => 404,
            "RATE_LIMITED" | "QUEUE_FULL" => 429,
            "RESOURCE_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "INVALID_STATE" => 409,
            _ => 422,
        },
    )
}
