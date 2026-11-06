use super::*;
use crate::{
    compiler::{self, generator_request, validate_generator},
    db::runtime::{LeaseRow, OperationInsert, OperationKey},
    hardware::HardwareCall,
};
use operations::{operation_key, request_fingerprint};
use std::collections::BTreeSet;

struct InstrumentFence {
    row: ExperimentRow,
    lease: LeaseRow,
    reservation: Arc<Reservation>,
}

impl ExperimentManager {
    pub async fn instrument_access(
        &self,
        context: &SessionContext,
        id: &str,
        client: Option<&str>,
    ) -> Result<Value, ApiError> {
        let owner = owner(context)?;
        let mut row = self.record(id, Some(owner)).await?;
        let mut channels = BTreeSet::new();
        let reason = if !self
            .is_control_context(&row.payload, &context.session_id, client)
            .await
        {
            "CONTROL_CONTEXT_REQUIRED"
        } else if self.closing() || row.payload["state"] != "RUNNING" {
            "NOT_RUNNING"
        } else if let Some(lease) = self.live_lease(id).await? {
            self.check_authority().await?;
            let caps = self
                .0
                .hardware
                .capabilities(field(&row.payload, "station_id")?)
                .await
                .map_err(gateway)?;
            let caps = self.validate_capabilities(&caps)?;
            let capability = &caps["instrument_capabilities"]["generator"];
            let limit = capability["channels"].as_u64().unwrap_or(0);
            let mut reason =
                if caps["available"] != true || caps["mode"] != row.payload["mode"] || limit == 0 {
                    "GENERATOR_UNAVAILABLE"
                } else if capability["runtime_reconfiguration_supported"] != true {
                    "RUNTIME_CONFIGURATION_UNSUPPORTED"
                } else {
                    channels.extend(
                        generator_channels(&row.payload)
                            .filter(|channel| *channel <= limit && (1..=2).contains(channel)),
                    );
                    if channels.is_empty() {
                        "NO_ALLOCATED_CHANNEL"
                    } else {
                        "READY"
                    }
                };
            let state = self.0.state.lock().await;
            let current = self.record(id, Some(owner)).await?;
            if expected(&current.payload)?.revision != expected(&row.payload)?.revision
                || current.payload["_reservation_generation"]
                    != row.payload["_reservation_generation"]
                || self.live_lease(id).await?.as_ref() != Some(&lease)
                || !self
                    .is_control_context(&current.payload, &context.session_id, client)
                    .await
                || state
                    .active
                    .get(id)
                    .is_none_or(|reservation| reservation.cancelled())
            {
                channels.clear();
                reason = "NOT_RUNNING";
            }
            row = current;
            reason
        } else {
            "LEASE_UNAVAILABLE"
        };
        compiler::validate(
            &self.0.registry,
            "InstrumentControlAccess",
            &json!({
                "schema_version":"1.0", "experiment_id":id, "revision":expected(&row.payload)?.revision,
                "can_configure_generator":reason=="READY", "generator_channels":channels, "reason":reason,
            }),
        )
    }

    pub async fn configure_instrument(
        &self,
        context: &SessionContext,
        id: &str,
        payload: &Value,
        client: &str,
    ) -> Result<Value, ApiError> {
        let manager = self.clone();
        let context = context.clone();
        let id = id.to_owned();
        let payload = payload.clone();
        let client = client.to_owned();
        self.owned(async move {
            manager
                .configure_instrument_inner(&context, &id, &payload, &client)
                .await
        })
        .await
    }

    async fn configure_instrument_inner(
        &self,
        context: &SessionContext,
        id: &str,
        payload: &Value,
        client: &str,
    ) -> Result<Value, ApiError> {
        let owner = owner(context)?;
        let fence = self
            .instrument_fence(id, owner, &context.session_id, client)
            .await?;
        let _command = fence.reservation.command.lock().await;
        let instrument = field(payload, "instrument")
            .map_err(|_| ApiError::new("INVALID_CONFIGURATION", 422))?;
        match instrument {
            "generator" => {}
            "clock" | "trigger" => return Err(ApiError::new("NOT_IMPLEMENTED", 422)),
            _ => return Err(ApiError::new("INVALID_CONFIGURATION", 422)),
        }
        let reply = self
            .configure_reply(
                id,
                owner,
                &context.session_id,
                client,
                &payload["configuration"],
            )
            .await?;
        let accepted = reply["accepted"] == true;
        Ok(
            json!({"accepted":accepted, "code":reply["code"].as_str().unwrap_or("OK"),
                "status":if accepted { "ACCEPTED" } else { "FAILED" },
            }),
        )
    }

    pub async fn generator_command(
        &self,
        owner: &str,
        id: &str,
        key: &str,
    ) -> Result<Value, ApiError> {
        self.record(id, Some(owner)).await?;
        let identity = OperationKey {
            owner_id: owner,
            kind: "generator",
            scope: id,
            key: operation_key(key)?,
        };
        let row = self
            .0
            .repo
            .operation(identity)
            .await
            .map_err(runtime_error)?
            .ok_or_else(|| ApiError::new("NOT_FOUND", 404))?;
        compiler::validate(&self.0.registry, "InstrumentCommandRecord", &row.payload)
    }

    pub async fn configure_generator(
        &self,
        context: &SessionContext,
        id: &str,
        configuration: &Value,
        client: &str,
        key: &str,
    ) -> Result<Value, ApiError> {
        let manager = self.clone();
        let context = context.clone();
        let id = id.to_owned();
        let configuration = configuration.clone();
        let client = client.to_owned();
        let key = key.to_owned();
        self.owned(async move {
            manager
                .configure_generator_inner(&context, &id, &configuration, &client, &key)
                .await
        })
        .await
    }

    async fn configure_generator_inner(
        &self,
        context: &SessionContext,
        id: &str,
        configuration: &Value,
        client: &str,
        key: &str,
    ) -> Result<Value, ApiError> {
        let owner = owner(context)?;
        let configuration =
            compiler::validate(&self.0.registry, "GeneratorConfiguration", configuration)?;
        let key = operation_key(key)?;
        let fingerprint =
            request_fingerprint(&json!({"experiment_id":id, "configuration":configuration}))?;
        let identity = OperationKey {
            owner_id: owner,
            kind: "generator",
            scope: id,
            key,
        };
        let guard = self.0.operation_guards.lock(identity)?;
        let _operation = guard.lock().await;
        self.record(id, Some(owner)).await?;
        if self.previous(identity, &fingerprint).await?.is_some() {
            return self.generator_command(owner, id, key).await;
        }

        let fence = self
            .instrument_fence(id, owner, &context.session_id, client)
            .await?;
        let _command = fence.reservation.command.lock().await;
        let access = self.instrument_access(context, id, Some(client)).await?;
        let reason = field(&access, "reason")?;
        if reason == "CONTROL_CONTEXT_REQUIRED" {
            return Err(ApiError::new("FORBIDDEN", 403));
        }
        if access["can_configure_generator"] != true {
            return Err(ApiError::new(
                if matches!(reason, "NOT_RUNNING" | "LEASE_UNAVAILABLE") {
                    "INVALID_STATE"
                } else {
                    "UNEXECUTABLE"
                },
                if matches!(reason, "NOT_RUNNING" | "LEASE_UNAVAILABLE") {
                    409
                } else {
                    422
                },
            ));
        }
        let channel = crate::numeric::bounded_integer(&configuration["channel"], 1, 2)
            .map(|channel| channel as u64);
        if !compiler::array(&access["generator_channels"])
            .iter()
            .any(|value| value.as_u64() == channel)
        {
            return Err(ApiError::new("UNEXECUTABLE", 422));
        }
        self.check_authority().await?;
        let caps = self
            .0
            .hardware
            .capabilities(field(&fence.row.payload, "station_id")?)
            .await
            .map_err(gateway)?;
        let caps = self.validate_capabilities(&caps)?;
        validate_generator(
            &self.0.registry,
            &configuration,
            &caps["instrument_capabilities"]["generator"],
        )?;

        let mut record = json!({"schema_version":"1.0", "experiment_id":id, "operation_key":key,
            "status":"REQUESTED", "revision":0, "accepted":false, "hardware_applied":false,
            "error_code":null, "configuration":configuration,
        });
        let mut tx = self.0.repo.begin().await.map_err(runtime_error)?;
        auth::authorize_session(&mut tx, &context.session_id, owner, &self.0.config).await?;
        let inserted = self
            .0
            .repo
            .insert_operation_in(
                &mut tx,
                OperationInsert {
                    identity,
                    fingerprint: &fingerprint,
                    payload: &record,
                },
            )
            .await
            .map_err(runtime_error)?;
        tx.commit().await.map_err(|_| internal())?;
        if !inserted {
            self.previous(identity, &fingerprint).await?;
            return self.generator_command(owner, id, key).await;
        }

        match self
            .configure_reply(id, owner, &context.session_id, client, &configuration)
            .await
        {
            Ok(reply) if reply["accepted"] == true => {
                let applied = reply["hardware_applied"] == true;
                record["status"] = json!(if applied { "APPLIED" } else { "ACCEPTED" });
                record["accepted"] = json!(true);
                record["hardware_applied"] = json!(applied);
            }
            outcome => {
                let code = match &outcome {
                    Ok(reply) => reply["code"].as_str().unwrap_or("PROTOCOL_MISMATCH"),
                    Err(error) => error.code.as_str(),
                };
                let uncertain = matches!(
                    code,
                    "TIMEOUT"
                        | "GATEWAY_TIMEOUT"
                        | "HARDWARE_UNAVAILABLE"
                        | "PROTOCOL_MISMATCH"
                        | "INTERNAL_ERROR"
                        | "UNAVAILABLE"
                );
                record["status"] = json!(if uncertain { "REQUESTED" } else { "FAILED" });
                record["error_code"] = json!(if uncertain {
                    "ACKNOWLEDGEMENT_UNKNOWN"
                } else {
                    code
                });
            }
        }
        record["revision"] = json!(1);
        self.save_operation(identity, 0, &record).await?;
        compiler::validate(&self.0.registry, "InstrumentCommandRecord", &record)
    }

    async fn configure_reply(
        &self,
        id: &str,
        owner: &str,
        session: &str,
        client: &str,
        configuration: &Value,
    ) -> Result<Value, ApiError> {
        let fence = self.instrument_fence(id, owner, session, client).await?;
        self.check_authority().await?;
        let caps = self
            .0
            .hardware
            .capabilities(field(&fence.row.payload, "station_id")?)
            .await
            .map_err(gateway)?;
        let caps = self.validate_capabilities(&caps)?;
        let capability = &caps["instrument_capabilities"]["generator"];
        if caps["available"] != true || caps["mode"] != fence.row.payload["mode"] {
            return Err(ApiError::new("UNEXECUTABLE", 422));
        }
        if capability["runtime_reconfiguration_supported"] != true {
            return Err(ApiError::new("NOT_IMPLEMENTED", 422));
        }
        validate_generator(&self.0.registry, configuration, capability)?;
        let channel =
            crate::numeric::bounded_integer(&configuration["channel"], 1, i64::from(u32::MAX))
                .ok_or_else(|| ApiError::new("INVALID_CONFIGURATION", 422))? as u64;
        if !generator_channels(&fence.row.payload).any(|allocated| allocated == channel) {
            return Err(ApiError::new("UNEXECUTABLE", 422));
        }
        let current = self.instrument_fence(id, owner, session, client).await?;
        if !same_fence(&fence, &current) {
            return Err(ApiError::new("INVALID_STATE", 409));
        }
        self.check_authority().await?;
        let reply = self
            .0
            .hardware
            .call(HardwareCall::ConfigureInstrument(
                pb::ConfigureInstrumentRequest {
                    target: Some(fence.reservation.target.clone()),
                    instrument: "generator".into(),
                    generator: Some(generator_request(configuration)?),
                    ..Default::default()
                },
            ))
            .await;
        self.check_authority().await?;
        // A late reply cannot restore a revoked lifecycle or certify the new
        // generation as applied. This check also covers an RPC error race.
        match self.instrument_fence(id, owner, session, client).await {
            Ok(current) if same_fence(&fence, &current) => {}
            _ => {
                return Ok(json!({"accepted":false, "hardware_applied":false, "code":"CANCELLED"}));
            }
        }
        let reply = reply.map_err(gateway)?.result;
        if reply["accepted"] == false {
            return Err(ApiError::new(
                reply["code"].as_str().unwrap_or("DRIVER_ERROR"),
                503,
            ));
        }
        Ok(reply)
    }

    async fn is_control_context(
        &self,
        payload: &Value,
        session: &str,
        client: Option<&str>,
    ) -> bool {
        client.is_some_and(|client| {
            !client.is_empty() && payload["_control_client_id"].as_str() == Some(client)
        }) && payload["_control_session_id"].as_str() == Some(session)
            && self.session_active(session).await
    }

    async fn live_lease(&self, id: &str) -> Result<Option<LeaseRow>, ApiError> {
        Ok(self
            .0
            .repo
            .lease(id)
            .await
            .map_err(runtime_error)?
            .filter(|lease| !lease.quarantined && lease.expires_at > now()))
    }

    async fn instrument_fence(
        &self,
        id: &str,
        owner: &str,
        session: &str,
        client: &str,
    ) -> Result<InstrumentFence, ApiError> {
        let state = self.0.state.lock().await;
        let row = self.record(id, Some(owner)).await?;
        if !self.session_active(session).await {
            return Err(ApiError::new("SESSION_EXPIRED", 401));
        }
        if row.payload["_control_session_id"].as_str() != Some(session)
            || row.payload["_control_client_id"].as_str() != Some(client)
        {
            return Err(ApiError::new("FORBIDDEN", 403));
        }
        let invalid = || ApiError::new("INVALID_STATE", 409);
        if self.closing() || row.payload["state"] != "RUNNING" {
            return Err(invalid());
        }
        let lease = self.live_lease(id).await?.ok_or_else(invalid)?;
        let reservation = state
            .active
            .get(id)
            .filter(|reservation| {
                !reservation.cancelled()
                    && row.payload["_reservation_generation"].as_str()
                        == Some(&reservation.generation)
            })
            .cloned()
            .ok_or_else(invalid)?;
        Ok(InstrumentFence {
            row,
            lease,
            reservation,
        })
    }
}

fn same_fence(previous: &InstrumentFence, current: &InstrumentFence) -> bool {
    Arc::ptr_eq(&previous.reservation, &current.reservation)
        && previous.row.payload["revision"] == current.row.payload["revision"]
        && previous.lease == current.lease
}

fn generator_channels(payload: &Value) -> impl Iterator<Item = u64> + '_ {
    compiler::array(&payload["_execution_plan"]["instrument_allocations"])
        .iter()
        .filter(|entry| entry["instrument"] == "GENERATOR")
        .filter_map(|entry| {
            crate::numeric::bounded_integer(&entry["channel"], 1, i64::from(u32::MAX))
                .map(|channel| channel as u64)
        })
}
