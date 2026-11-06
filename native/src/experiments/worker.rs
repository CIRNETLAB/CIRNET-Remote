use super::*;
use crate::{
    compiler::{
        self, assess, capabilities_json, capture_request, decide, prepare_request,
        resolve_topology, verify_functional, verify_topology,
    },
    db::runtime::{LeaseOutcome, RecoveryKind, Settle},
    hardware::{ControlReply, HardwareCall},
    stop_probe::StopSource,
};
use cirnet_contracts_native::capture::{decode_digital, encode_digital};
use lifecycle::safe_stop_ack;

enum FlowError {
    Cancelled,
    AuthorityLost,
    Fault(ApiError),
}

impl From<ApiError> for FlowError {
    fn from(error: ApiError) -> Self {
        Self::Fault(error)
    }
}

type Flow<T> = Result<T, FlowError>;

impl ExperimentManager {
    pub async fn initialize(&self) -> Result<(), ApiError> {
        self.check_authority().await?;
        // Attempt electrical cleanup before any legacy capture storage I/O.
        let mut after = String::new();
        loop {
            let rows = self
                .0
                .repo
                .leases_page(&after, 100)
                .await
                .map_err(runtime_error)?;
            let Some(last) = rows.last() else {
                break;
            };
            after.clone_from(&last.experiment_id);
            for lease in rows {
                let row = self.record(&lease.experiment_id, None).await?;
                let safe = self
                    .stop_safety(
                        target(&row.payload)?,
                        field(&row.payload, "mode")?,
                        StopSource::Recovery,
                    )
                    .await;
                let mut payload = transition(
                    &row.payload,
                    "FAULT",
                    json!({
                        "error_code":"RESTART_RECOVERY", "lease_expires_at":null,
                    }),
                )?;
                // Invalidate the old worker even if it reloads the recovery revision.
                payload
                    .as_object_mut()
                    .ok_or_else(internal)?
                    .remove("_reservation_generation");
                applied(
                    self.0
                        .repo
                        .settle(Settle {
                            expected: expected(&row.payload)?,
                            payload: &payload,
                            lease: if safe {
                                LeaseOutcome::Release
                            } else {
                                LeaseOutcome::Quarantine
                            },
                            recovery: true,
                        })
                        .await
                        .map_err(runtime_error)?,
                )?;
            }
        }

        after.clear();
        self.check_authority().await?;
        if self.0.captures.get().is_none() {
            let store = CaptureStore::with_limits(
                Path::new(&self.0.config.capture_dir),
                self.0.config.capture_max_bytes,
                self.0.config.capture_max_files,
            )?;
            let _ = self.0.captures.set(store);
        }
        let mut total = 0usize;
        loop {
            let rows = self
                .0
                .repo
                .recovery_page(RecoveryKind::LegacyCapture, &after, 100)
                .await
                .map_err(runtime_error)?;
            let Some(last) = rows.last() else {
                break;
            };
            after = field(&last.payload, "experiment_id")?.into();
            total += rows.len();
            if total > RECOVERY_LIMIT {
                return Err(ApiError::new("RECOVERY_LIMIT_EXCEEDED", 503));
            }
            for row in rows {
                self.migrate_capture(row).await?;
            }
        }

        let mut queued = Vec::new();
        after.clear();
        loop {
            let rows = self
                .0
                .repo
                .recovery_page(RecoveryKind::Queued, &after, 100)
                .await
                .map_err(runtime_error)?;
            let Some(last) = rows.last() else {
                break;
            };
            after = field(&last.payload, "experiment_id")?.into();
            queued.extend(rows);
            if queued.len() > RECOVERY_LIMIT {
                return Err(ApiError::new("RECOVERY_LIMIT_EXCEEDED", 503));
            }
        }
        queued.sort_by_key(|row| row.payload["_queue_sequence"].as_i64().unwrap_or(0));
        let stations;
        {
            let mut state = self.0.state.lock().await;
            state.sequence = self
                .0
                .repo
                .admission_sequence()
                .await
                .map_err(runtime_error)?;
            for mut row in queued {
                if row.payload.get("_assignment_snapshot").is_none() {
                    let assignment = self.assignment_snapshot(&row).await;
                    let snapshot = match assignment {
                        Ok(snapshot) => snapshot,
                        Err(error) if error.status == 404 => {
                            self.save(&state, &row, "COMPLETE", json!({
                                "queue_position":null, "error_code":"ASSIGNMENT_NOT_FOUND",
                                "execution_decision":{"schema_version":"1.0","decision":"BLOCK_UNEXECUTABLE",
                                    "reasons":["Legacy assignment is missing"]},
                            })).await?;
                            continue;
                        }
                        Err(error) => return Err(error),
                    };
                    row = self.save(&state, &row, "QUEUED", json!({
                        "_assignment_snapshot":snapshot, "_snapshot_provenance":"legacy_recovery",
                    })).await?;
                }
                state
                    .queues
                    .entry(field(&row.payload, "station_id")?.to_owned())
                    .or_default()
                    .push_back(field(&row.payload, "experiment_id")?.to_owned());
            }
            stations = state.queues.keys().cloned().collect::<Vec<_>>();
        }
        for station in stations {
            self.dispatch(station).await?;
        }
        Ok(())
    }

    async fn migrate_capture(&self, row: ExperimentRow) -> Result<(), ApiError> {
        let mode = field(&row.payload, "mode")?.to_owned();
        let legacy = row.payload["capture"].clone();
        let captures = self.capture_store()?.clone();
        let registry = self.0.registry.clone();
        let sealed = tokio::task::spawn_blocking(move || {
            let invalid = || ApiError::new("INVALID_CAPTURE", 422);
            let samples = legacy["samples"].as_array().ok_or_else(invalid)?;
            let duration = legacy.get("duration_ns").cloned().unwrap_or_else(|| json!(
                samples.iter().filter_map(|sample| sample["time_ns"].as_u64()).max().unwrap_or(0)
            ));
            let payload = encode_digital(&legacy["samples"], &duration).map_err(|_| invalid())?;

            let available = legacy["available"].as_bool().unwrap_or(false);
            if !available && !samples.is_empty() { return Err(invalid()); }
            let result = json!({"available":available, "duration_ns":duration, "sample_count":samples.len()});
            captures.seal(&registry, &mode, &result, if available { &payload } else { &[] })
        }).await.map_err(|_| internal())?;
        let updates = match sealed {
            Ok(metadata) => json!({"capture":metadata}),
            Err(error) if error.code == "INVALID_CAPTURE" => json!({
                "capture":null, "functional_verification":verification("NO_RESPONSE", &["Malformed legacy capture: CAPTURE_CORRUPT"]),
                "error_code":row.payload["error_code"].as_str().unwrap_or("CAPTURE_CORRUPT"),
            }),
            Err(error) => return Err(error),
        };
        let payload = transition(&row.payload, field(&row.payload, "state")?, updates)?;
        applied(
            self.0
                .repo
                .update(Update {
                    expected: expected(&row.payload)?,
                    payload: &payload,
                })
                .await
                .map_err(runtime_error)?,
        )
    }

    pub(super) async fn execute(&self, station: String, id: String, reservation: Arc<Reservation>) {
        let mut touched = false;
        let permit = self.0.worker_slots.acquire().await;
        let result = if permit.is_ok() {
            self.execute_flow(&id, &reservation, &mut touched).await
        } else {
            Err(FlowError::Fault(internal()))
        };
        let fault = match result {
            Ok(()) | Err(FlowError::Cancelled) => None,
            Err(FlowError::AuthorityLost) => Some(ApiError::new("UNAVAILABLE", 503)),
            Err(FlowError::Fault(error))
                if reservation.cancelled()
                    && matches!(error.code.as_str(), "INVALID_STATE" | "RESOURCE_CONFLICT") =>
            {
                None
            }
            Err(FlowError::Fault(error)) => Some(error),
        };
        let result = self.finish(&id, &reservation, touched, fault).await;
        drop(permit);
        let mut state = self.0.state.lock().await;
        if let Err(error) = result {
            // A failed commit leaves the lease durable but may prevent the
            // quarantine flag from being stored. Refuse new station work until
            // a fresh authority can recover and verify that lease.
            state.fenced_stations.insert(station.clone());
            self.0.cleanup_failed.store(true, Ordering::Release);
            crate::diagnostics::safety_log(format_args!(
                "Experiment cleanup settlement failed ({})",
                error.code
            ));
        }
        if state
            .active
            .get(&id)
            .is_some_and(|current| Arc::ptr_eq(current, &reservation))
        {
            state.active.remove(&id);
        }
        drop(state);
        self.0.idle.notify_one();
        if let Err(error) = self.dispatch(station).await {
            eprintln!("Experiment dispatch failed ({})", error.code);
        }
    }

    async fn execute_flow(
        &self,
        id: &str,
        reservation: &Reservation,
        touched: &mut bool,
    ) -> Flow<()> {
        let row = self.current_execution(id, reservation).await?;
        let station = field(&row.payload, "station_id")?;
        let mode = field(&row.payload, "mode")?;
        let target = target(&row.payload)?;
        let assignment = self.assignment_snapshot(&row).await?;
        let assignment = (!assignment.is_null()).then_some(&assignment);
        self.check_authority().await?;
        let caps = self
            .0
            .hardware
            .capabilities(station)
            .await
            .map_err(gateway)?;
        let caps_json = self.validate_capabilities(&caps)?;
        self.current_execution(id, reservation).await?;
        let supported = caps.available
            && caps.mode == mode
            && if mode == "simulation" {
                caps.virtual_digital
            } else {
                caps.physical_digital && caps.physical_execution_slots >= 1
            };
        if !supported {
            self.advance(
                id,
                reservation,
                field(&row.payload, "state")?,
                json!({
                    "execution_decision":{"schema_version":"1.0", "decision":"BLOCK_UNEXECUTABLE",
                        "reasons":["Station unavailable or capability unsupported"]},
                }),
            )
            .await?;
            return Ok(());
        }

        self.advance(id, reservation, "SAFE_STATE", json!({}))
            .await?;
        *touched = true;
        self.control(
            id,
            reservation,
            HardwareCall::EnterSafeState(target.clone()),
        )
        .await?;
        let (safety, topology, resolution, unknown) = if mode == "hardware" {
            self.advance(id, reservation, "TOPOLOGY_SCAN", json!({}))
                .await?;
            let observed = self
                .control(id, reservation, HardwareCall::ScanTopology(target.clone()))
                .await?
                .result;
            self.advance(id, reservation, "SAFETY_CHECK", json!({}))
                .await?;
            let evidence = self
                .control(
                    id,
                    reservation,
                    HardwareCall::ReadRuntimeSafety(target.clone()),
                )
                .await?
                .result;
            let safety =
                compiler::validate(&self.0.registry, "SafetyVerificationResult", &evidence)?;
            let resolution =
                resolve_topology(&self.0.registry, assignment, &observed, Some(&caps_json))?;
            let topology =
                verify_topology(&self.0.registry, assignment, &observed, Some(&resolution))?;
            let unknown = compiler::array(&observed["components"])
                .iter()
                .any(|component| {
                    component["identity"] == "UNKNOWN"
                        || component["kind"] == "OPAQUE_PHYSICAL_COMPONENT"
                });
            self.advance(id, reservation, "SAFETY_CHECK", json!({
                "safety_verification":safety, "topology_verification":topology, "topology_resolution":resolution,
            })).await?;
            (safety, topology, Some(resolution), unknown)
        } else {
            let safety = verification("SAFE", &["Virtual execution; no electrical energization"]);
            let topology = verification("UNKNOWN", &["Physical topology scan not applicable"]);
            self.advance(
                id,
                reservation,
                "SAFETY_CHECK",
                json!({
                    "safety_verification":safety, "topology_verification":topology,
                }),
            )
            .await?;
            let graph =
                serde_json::to_vec(&row.payload["_circuit_graph"]).map_err(|_| internal())?;
            self.control(
                id,
                reservation,
                HardwareCall::ConfigureVirtualCircuit(pb::ConfigureVirtualRequest {
                    target: Some(target.clone()),
                    design_graph_json: graph,
                }),
            )
            .await?;
            (safety, topology, None, false)
        };

        let plan = self
            .0
            .compiler
            .compile(&row.payload, assignment, &caps, resolution.as_ref())
            .ok();
        let decision = decide(&self.0.registry, &safety, plan.is_some(), unknown)?;
        self.advance(id, reservation, "EXECUTION_DECISION", json!({
            "safety_verification":safety, "topology_verification":topology, "execution_decision":decision,
        })).await?;
        if field(&decision, "decision")?.starts_with("BLOCK_") {
            return Ok(());
        }
        let plan = plan.ok_or_else(internal)?;

        self.advance(
            id,
            reservation,
            "ROUTE_PREPARE",
            json!({"_execution_plan":plan}),
        )
        .await?;
        self.control(
            id,
            reservation,
            HardwareCall::PrepareExecution(prepare_request(target.clone(), &plan, &decision)?),
        )
        .await?;
        self.control(id, reservation, HardwareCall::ApplyRouting(target.clone()))
            .await?;
        self.advance(id, reservation, "GUARDED_POWER_UP", json!({}))
            .await?;
        self.control(
            id,
            reservation,
            HardwareCall::GuardedPowerUp(target.clone()),
        )
        .await?;
        self.control(
            id,
            reservation,
            HardwareCall::ArmCapture(pb::ArmCaptureRequest {
                target: Some(target.clone()),
                configuration: Some(capture_request(&plan["capture_config"])?),
            }),
        )
        .await?;
        self.advance(id, reservation, "RUNNING", json!({})).await?;
        self.control(
            id,
            reservation,
            HardwareCall::StartExecution(target.clone()),
        )
        .await?;
        self.advance(id, reservation, "CAPTURING", json!({}))
            .await?;
        let raw = self
            .control(id, reservation, HardwareCall::ReadCapture(target))
            .await?;

        let captures = self.capture_store()?.clone();
        let registry = self.0.registry.clone();
        let source = mode.to_owned();
        let metadata = tokio::task::spawn_blocking(move || {
            captures.seal(&registry, &source, &raw.result, &raw.capture_payload)
        })
        .await
        .map_err(|_| internal())??;
        #[cfg(test)]
        if let Some((sealed, release)) = self.0.test_capture_gate.get() {
            sealed.notify_one();
            let _ = tokio::time::timeout(Duration::from_secs(15), release.notified()).await;
        }
        if let Err(error) = self
            .advance(
                id,
                reservation,
                "FUNCTIONAL_VERIFY",
                json!({"capture":metadata}),
            )
            .await
        {
            if matches!(error, FlowError::Cancelled | FlowError::AuthorityLost)
                && metadata["available"] == true
            {
                // The transition was rejected before it could publish this identity.
                let captures = self.capture_store()?.clone();
                let capture_id = field(&metadata, "capture_id")?.to_owned();
                let _ = tokio::task::spawn_blocking(move || captures.remove(&capture_id)).await;
            }
            return Err(error);
        }

        let captures = self.capture_store()?.clone();
        let registry = self.0.registry.clone();
        let assignment = assignment.cloned();
        let vectors = row.payload["_configuration"]["test_vectors"].clone();
        let (functional, assessment) = tokio::task::spawn_blocking(move || {
            let observed = if metadata["available"] == true {
                let bytes = captures.read(&metadata)?;
                let mut data =
                    decode_digital(&bytes).map_err(|_| ApiError::new("CAPTURE_CORRUPT", 422))?;
                data["available"] = json!(true);
                data
            } else {
                json!({"available":false,"samples":[]})
            };
            let functional = verify_functional(
                &registry,
                assignment.as_ref(),
                Some(&observed),
                Some(&vectors),
            )?;
            let assessment = assess(assignment.as_ref(), Some(&topology), Some(&functional))?;
            let assessment = compiler::validate(&registry, "AssessmentResult", &assessment)?;
            Ok::<_, ApiError>((functional, assessment))
        })
        .await
        .map_err(|_| internal())??;
        self.advance(
            id,
            reservation,
            "FUNCTIONAL_VERIFY",
            json!({
                "functional_verification":functional, "assessment":assessment,
            }),
        )
        .await?;
        Ok(())
    }

    pub(super) fn validate_capabilities(
        &self,
        caps: &pb::StationCapabilities,
    ) -> Result<Value, ApiError> {
        compiler::validate(
            &self.0.registry,
            "StationCapabilities",
            &capabilities_json(caps),
        )
    }

    async fn current_execution(&self, id: &str, reservation: &Reservation) -> Flow<ExperimentRow> {
        if reservation.cancelled() {
            return Err(FlowError::Cancelled);
        }
        let row = self.record(id, None).await?;
        if row.payload["_reservation_generation"].as_str() != Some(&reservation.generation) {
            return Err(FlowError::Cancelled);
        }
        if let Some(session) = row.payload["_control_session_id"].as_str()
            && !self.session_active(session).await
        {
            self.cancel_matching(
                Some(&row.owner_id),
                Some(session),
                row.payload["_control_client_id"].as_str(),
                "SESSION_EXPIRED",
            )
            .await?;
            return Err(FlowError::Cancelled);
        }
        if reservation.cancelled() {
            return Err(FlowError::Cancelled);
        }
        Ok(row)
    }

    async fn advance(
        &self,
        id: &str,
        reservation: &Reservation,
        state: &str,
        updates: Value,
    ) -> Flow<ExperimentRow> {
        self.current_execution(id, reservation).await?;
        // Progress can follow blocking capture I/O or pure verification long
        // after the last RPC check. Prove scheduler authority again before
        // committing a result. Keep the potentially slow check off the Stop lock.
        self.check_authority()
            .await
            .map_err(|_| FlowError::AuthorityLost)?;
        let scheduler = self.0.state.lock().await;
        let row = self.record(id, None).await?;
        if self.0.authority.is_lost() {
            return Err(FlowError::AuthorityLost);
        }
        if reservation.cancelled()
            || row.payload["_reservation_generation"].as_str() != Some(&reservation.generation)
        {
            return Err(FlowError::Cancelled);
        }
        self.save(&scheduler, &row, state, updates)
            .await
            .map_err(Into::into)
    }

    async fn control(
        &self,
        id: &str,
        reservation: &Reservation,
        call: HardwareCall,
    ) -> Flow<ControlReply> {
        self.current_execution(id, reservation).await?;
        self.check_authority().await?;
        let reply = self.0.hardware.call(call).await.map_err(gateway)?;
        self.check_authority().await?;
        if reply.result["accepted"] == false {
            let code = reply.result["code"].as_str().unwrap_or("DRIVER_ERROR");
            return Err(ApiError::new(code, 503).into());
        }
        self.current_execution(id, reservation).await?;
        Ok(reply)
    }

    async fn stop_safety(&self, target: pb::Target, mode: &str, source: StopSource) -> bool {
        let Ok(_permit) = self.0.stop_slots.acquire().await else {
            return false;
        };
        self.0
            .hardware
            .call_stop(target, source)
            .await
            .is_ok_and(|reply| safe_stop_ack(mode, &reply.result))
    }

    async fn finish(
        &self,
        id: &str,
        reservation: &Reservation,
        touched: bool,
        fault: Option<ApiError>,
    ) -> Result<(), ApiError> {
        {
            let state = self.0.state.lock().await;
            // The locally owned target remains known during a database failure.
            // A failed state read/write must not prevent electrical cleanup.
            if let Ok(mut row) = self.record(id, None).await {
                if row.payload["_reservation_generation"].as_str() != Some(&reservation.generation)
                {
                    return Ok(());
                }
                if let Some(error) = &fault
                    && let Ok(changed) =
                        self.save(&state, &row, "FAULT", fault_updates(error)).await
                {
                    row = changed;
                }
                if touched {
                    let _ = self.save(&state, &row, "STOPPING", json!({})).await;
                }
            }
        }
        let safe = if touched {
            let _command = reservation.command.lock().await;
            self.stop_safety(
                reservation.target.clone(),
                &reservation.mode,
                StopSource::Cleanup,
            )
            .await
        } else {
            true
        };

        let state = self.0.state.lock().await;
        let mut current = self.record(id, None).await?;
        if current.payload["_reservation_generation"].as_str() != Some(&reservation.generation) {
            return Ok(());
        }
        let status;
        let mut updates = if let Some(error) = &fault {
            fault_updates(error)
        } else {
            json!({})
        };
        if safe {
            if touched {
                current = self.save(&state, &current, "SAFE_STATE", json!({})).await?;
            }
            current = self.save(&state, &current, "RELEASE", json!({})).await?;
            status = if fault.is_some() { "FAULT" } else { "COMPLETE" };
        } else {
            updates = json!({"error_code":"SAFE_STATE_FAILED",
                "safety_verification":verification("INDETERMINATE", &["Safe cleanup unacknowledged"]),
                "execution_decision":{"schema_version":"1.0", "decision":"BLOCK_SAFETY","reasons":["SAFE_STATE_FAILED"]},
            });
            status = "FAULT";
        }
        updates["lease_expires_at"] = Value::Null;
        let payload = transition(&current.payload, status, updates)?;
        applied(
            self.0
                .repo
                .settle(Settle {
                    expected: expected(&current.payload)?,
                    payload: &payload,
                    lease: if safe {
                        LeaseOutcome::Release
                    } else {
                        LeaseOutcome::Quarantine
                    },
                    recovery: false,
                })
                .await
                .map_err(runtime_error)?,
        )?;
        if let Some(probe) = self.0.hardware.stop_probe() {
            probe.settled(id, safe);
        }
        if let Ok(committed) = self.record(id, None).await {
            self.publish(&state, &committed).await;
        }
        Ok(())
    }
}

fn verification(status: &str, issues: &[&str]) -> Value {
    json!({"schema_version":"1.0", "status":status, "issues":issues})
}

fn fault_updates(error: &ApiError) -> Value {
    let code = match error.code.as_str() {
        "INVALID_CAPTURE" | "CAPTURE_CORRUPT" | "INTERNAL_ERROR" | "INVALID_CONTRACT" => {
            "DRIVER_ERROR"
        }
        code => code,
    };
    let mut value = json!({"error_code":code});
    if matches!(code, "UNSAFE" | "SAFETY_INDETERMINATE") {
        value["safety_verification"] = verification(
            if code == "UNSAFE" {
                "UNSAFE"
            } else {
                "INDETERMINATE"
            },
            &[code],
        );
        value["execution_decision"] =
            json!({"schema_version":"1.0","decision":"BLOCK_SAFETY","reasons":[code]});
    } else if matches!(
        code,
        "UNEXECUTABLE" | "HARDWARE_UNAVAILABLE" | "PROTOCOL_MISMATCH"
    ) {
        value["execution_decision"] =
            json!({"schema_version":"1.0","decision":"BLOCK_UNEXECUTABLE","reasons":[code]});
    }
    value
}
