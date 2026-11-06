use super::*;
use crate::db::runtime::Reserve;
use crate::stop_probe::{Phase, StopPhaseTrace, StopSource, mark_stop_phase};
use lifecycle::{safe_stop_ack, vacant_slot};
use std::{future::Future, pin::Pin};
use uuid::Uuid;

impl ExperimentManager {
    pub(super) async fn run_inner(
        &self,
        context: &SessionContext,
        id: &str,
        client_id: Option<&str>,
        request_id: Option<&str>,
        operation_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        self.check_authority().await?;
        let owner = owner(context)?;
        let station;
        {
            let mut state = self.0.state.lock().await;
            if self.closing() {
                return Err(ApiError::new("UNAVAILABLE", 503));
            }
            if !self.session_active(&context.session_id).await {
                return Err(ApiError::new("SESSION_EXPIRED", 401));
            }
            let row = self.record(id, Some(owner)).await?;
            if row.payload["state"] != "CREATED" {
                if terminal(&row.payload) {
                    return Err(ApiError::new("INVALID_STATE", 409));
                }
                return Ok(self.project(&row, state.queue_position(&row.payload)).await);
            }
            let admitted = Instant::now();
            state
                .rate
                .retain(|_, previous| admitted.duration_since(*previous) < RATE_WINDOW);
            if state.rate.contains_key(owner) || state.rate.len() >= RATE_ENTRIES {
                return Err(ApiError::new("RATE_LIMITED", 429));
            }
            if self
                .0
                .repo
                .has_active_owner(owner)
                .await
                .map_err(runtime_error)?
            {
                return Err(ApiError::new("RESOURCE_CONFLICT", 409));
            }
            station = field(&row.payload, "station_id")?.to_owned();
            let length = state.queues.get(&station).map_or(0, VecDeque::len);
            if length >= MAX_QUEUE {
                return Err(ApiError::new("QUEUE_FULL", 429));
            }
            let snapshot = self.assignment_snapshot(&row).await?;
            let sequence = state.sequence.checked_add(1).ok_or_else(internal)?;
            let payload = transition(
                &row.payload,
                "QUEUED",
                json!({
                    "_queue_sequence": sequence, "queue_position": length + 1,
                    "_run_request_id": request_id, "_run_operation_key": operation_key,
                    "_control_session_id": context.session_id, "_control_client_id": client_id,
                    "_assignment_snapshot": snapshot,
                    "_snapshot_provenance": row.payload["_snapshot_provenance"].as_str().unwrap_or("legacy_admission"),
                }),
            )?;
            let mut tx = self.0.repo.begin().await.map_err(runtime_error)?;
            auth::authorize_session(&mut tx, &context.session_id, owner, &self.0.config).await?;
            applied(
                self.0
                    .repo
                    .update_owned_in(
                        &mut tx,
                        owner,
                        Update {
                            expected: expected(&row.payload)?,
                            payload: &payload,
                        },
                    )
                    .await
                    .map_err(runtime_error)?,
            )?;
            tx.commit().await.map_err(|_| internal())?;

            state.rate.insert(owner.to_owned(), admitted);
            state.sequence = sequence;
            state
                .queues
                .entry(station.clone())
                .or_default()
                .push_back(id.to_owned());
            self.publish(
                &state,
                &ExperimentRow {
                    owner_id: owner.to_owned(),
                    payload,
                },
            )
            .await;
        }
        self.dispatch(station).await?;
        self.get(owner, id).await
    }

    pub(super) fn dispatch(
        &self,
        station: String,
    ) -> Pin<Box<dyn Future<Output = Result<(), ApiError>> + Send + '_>> {
        Box::pin(async move {
            {
                let mut state = self.0.state.lock().await;
                if self.closing() || state.fenced_stations.contains(&station) {
                    return Ok(());
                }
                if !state.dispatching.insert(station.clone()) {
                    state.dispatch_again.insert(station);
                    return Ok(());
                }
            }
            loop {
                let result = self.dispatch_queue(&station).await;
                let mut state = self.0.state.lock().await;
                let again = state.dispatch_again.remove(&station);
                if result.is_ok() && again && !self.closing() {
                    continue;
                }
                state.dispatching.remove(&station);
                if state.queues.get(&station).is_some_and(VecDeque::is_empty) {
                    state.queues.remove(&station);
                }
                return result;
            }
        })
    }

    async fn dispatch_queue(&self, station: &str) -> Result<(), ApiError> {
        loop {
            let (id, row) = {
                let mut state = self.0.state.lock().await;
                if self.closing() || state.fenced_stations.contains(station) {
                    return Ok(());
                }
                let Some(id) = state.queues.get(station).and_then(VecDeque::front).cloned() else {
                    return Ok(());
                };
                let row = self.record(&id, None).await?;
                if row.payload["state"] != "QUEUED" {
                    pop_head(&mut state, station, &id);
                    self.refresh_positions(&state, station).await?;
                    continue;
                }
                (id, row)
            };

            let mode = field(&row.payload, "mode")?;
            self.check_authority().await?;
            let capacity = self
                .0
                .hardware
                .capabilities(station)
                .await
                .ok()
                .filter(|caps| {
                    self.validate_capabilities(caps).is_ok()
                        && caps.available
                        && caps.mode == mode
                        && (if mode == "simulation" {
                            caps.virtual_digital
                        } else {
                            caps.physical_digital
                        })
                })
                .map_or(0, |caps| {
                    if mode == "simulation" {
                        self.0.config.simulation_workers
                    } else {
                        caps.physical_execution_slots as usize
                    }
                });
            // Check the same authority after capability I/O, before lease admission.
            self.check_authority().await?;

            let mut state = self.0.state.lock().await;
            if self.closing() || state.fenced_stations.contains(station) {
                return Ok(());
            }
            if state.queues.get(station).and_then(VecDeque::front) != Some(&id) {
                continue;
            }
            let current = self.record(&id, None).await?;
            if expected(&current.payload)?.revision != expected(&row.payload)?.revision
                || current.payload["state"] != "QUEUED"
            {
                continue;
            }
            if let Some(session) = current.payload["_control_session_id"].as_str()
                && !self.session_active(session).await
            {
                self.finish_queued(
                    &mut state,
                    &current,
                    json!({
                        "error_code":"SESSION_EXPIRED", "queue_position":null,
                    }),
                )
                .await?;
                continue;
            }

            let leases = self
                .0
                .repo
                .station_leases(station)
                .await
                .map_err(runtime_error)?;
            if leases.iter().any(|lease| lease.quarantined) {
                return Ok(());
            }
            if capacity == 0 {
                self.finish_queued(
                    &mut state,
                    &current,
                    json!({
                        "queue_position":null, "execution_decision":{
                            "schema_version":"1.0", "decision":"BLOCK_UNEXECUTABLE",
                            "reasons":["Station unavailable or execution capacity is zero"],
                        },
                    }),
                )
                .await?;
                continue;
            }
            let Some(slot) = vacant_slot(
                capacity,
                leases.iter().map(|lease| (lease.slot, lease.quarantined)),
            ) else {
                return Ok(());
            };
            let expires_at = now() + LEASE_SECONDS;
            let reservation = Arc::new(Reservation::new(
                Uuid::new_v4().simple().to_string(),
                target(&current.payload)?,
                mode.to_owned(),
            ));
            let payload = transition(
                &current.payload,
                "RESERVED",
                json!({
                    "lease_expires_at":expires_at, "queue_position":null,
                    "_reservation_generation":reservation.generation,
                }),
            )?;
            let result = self
                .0
                .repo
                .reserve(Reserve {
                    expected: expected(&current.payload)?,
                    station_id: station,
                    slot,
                    expires_at,
                    payload: &payload,
                })
                .await
                .map_err(runtime_error)?;
            match result {
                Cas::Applied => {}
                Cas::Stale => continue,
                Cas::Missing | Cas::Occupied | Cas::Quarantined => return Ok(()),
            }
            pop_head(&mut state, station, &id);
            state.active.insert(id.clone(), reservation.clone());
            let manager = self.clone();
            let worker_id = id.clone();
            let worker_station = station.to_owned();
            tokio::spawn(async move {
                manager
                    .execute(worker_station, worker_id, reservation)
                    .await;
            });
            // Worker is tracked and must run cleanup even if event publication
            // or queue-position persistence subsequently fails.
            let committed = self.record(&id, None).await?;
            self.publish(&state, &committed).await;
            self.refresh_positions(&state, station).await?;
        }
    }

    async fn finish_queued(
        &self,
        state: &mut Scheduler,
        row: &ExperimentRow,
        updates: Value,
    ) -> Result<(), ApiError> {
        let station = field(&row.payload, "station_id")?;
        let id = field(&row.payload, "experiment_id")?;
        let payload = transition(&row.payload, "COMPLETE", updates)?;
        applied(
            self.0
                .repo
                .update(Update {
                    expected: expected(&row.payload)?,
                    payload: &payload,
                })
                .await
                .map_err(runtime_error)?,
        )?;
        pop_head(state, station, id);
        if let Ok(committed) = self.record(id, None).await {
            self.publish(state, &committed).await;
        }
        self.refresh_positions(state, station).await
    }

    async fn refresh_positions(&self, state: &Scheduler, station: &str) -> Result<(), ApiError> {
        if let Some(queue) = state.queues.get(station) {
            for (index, id) in queue.iter().enumerate() {
                let row = self.record(id, None).await?;
                let position = index + 1;
                if row.payload["queue_position"].as_u64() != Some(position as u64) {
                    self.save(
                        state,
                        &row,
                        field(&row.payload, "state")?,
                        json!({"queue_position":position}),
                    )
                    .await?;
                }
            }
        }
        Ok(())
    }

    pub(super) async fn stop_inner(
        &self,
        context: &SessionContext,
        id: &str,
        reason: &str,
        phases: Option<&StopPhaseTrace>,
    ) -> Result<Value, ApiError> {
        let owner = owner(context)?;
        if let Some(reservation) = self
            .accept_stop(id, owner, reason, Some(&context.session_id))
            .await?
        {
            self.remote_stop(id, &reservation, true, phases).await;
            mark_stop_phase(phases, Phase::CommandReturned);
        }
        mark_stop_phase(phases, Phase::SnapshotStart);
        let result = self.get(owner, id).await;
        mark_stop_phase(phases, Phase::SnapshotEnd);
        result
    }

    async fn accept_stop(
        &self,
        id: &str,
        owner: &str,
        reason: &str,
        session: Option<&str>,
    ) -> Result<Option<Arc<Reservation>>, ApiError> {
        let mut state = self.0.state.lock().await;
        let row = self.record(id, Some(owner)).await?;
        if terminal(&row.payload) {
            return Ok(None);
        }
        let station = field(&row.payload, "station_id")?;
        let queued = state
            .queues
            .get(station)
            .and_then(|queue| queue.iter().position(|entry| entry == id));
        let active = state.active.get(id).cloned();
        if active
            .as_ref()
            .is_some_and(|reservation| reservation.cancelled())
        {
            return Ok(None);
        }
        if queued.is_none()
            && active.is_none()
            && self
                .0
                .repo
                .lease(id)
                .await
                .map_err(runtime_error)?
                .is_some()
        {
            // Only restart/reconciliation can dispose an untracked durable lease.
            return Err(ApiError::new("UNAVAILABLE", 503));
        }

        let payload = if active.is_some() {
            transition(&row.payload, "STOPPING", json!({"error_code":reason}))?
        } else {
            transition(
                &row.payload,
                "COMPLETE",
                json!({"error_code":reason,"queue_position":null}),
            )?
        };
        let mut tx = self.0.repo.begin().await.map_err(runtime_error)?;
        if let Some(session) = session {
            auth::authorize_session(&mut tx, session, owner, &self.0.config).await?;
        }
        applied(
            self.0
                .repo
                .update_owned_in(
                    &mut tx,
                    owner,
                    Update {
                        expected: expected(&row.payload)?,
                        payload: &payload,
                    },
                )
                .await
                .map_err(runtime_error)?,
        )?;
        tx.commit().await.map_err(|_| internal())?;

        if let Some(reservation) = &active {
            reservation.cancelled.store(true, Ordering::Release);
        }
        if let Some(index) = queued
            && let Some(queue) = state.queues.get_mut(station)
        {
            queue.remove(index);
        }
        if let Ok(committed) = self.record(id, None).await {
            self.publish(&state, &committed).await;
        }
        if queued.is_some() {
            self.refresh_positions(&state, station).await?;
        }
        Ok(active)
    }

    async fn remote_stop(
        &self,
        id: &str,
        reservation: &Reservation,
        blocking: bool,
        phases: Option<&StopPhaseTrace>,
    ) {
        let source = if blocking {
            StopSource::Explicit
        } else {
            StopSource::Sweep
        };
        let _command = if blocking {
            reservation.command.lock().await
        } else {
            let Ok(command) = reservation.command.try_lock() else {
                return;
            };
            command
        };
        let Ok(_permit) = self.0.stop_slots.acquire().await else {
            return;
        };
        if self.0.authority.is_lost() || reservation.emergency.load(Ordering::Acquire) {
            if reservation.cancelled()
                && self
                    .0
                    .hardware
                    .call_stop(reservation.target.clone(), source)
                    .await
                    .is_ok_and(|reply| safe_stop_ack(&reservation.mode, &reply.result))
            {
                reservation.stop_acknowledged.store(true, Ordering::Release);
            }
            return;
        }

        let Ok(row) = self.record(id, None).await else {
            return;
        };
        if !reservation.cancelled()
            || row.payload["state"] != "STOPPING"
            || row.payload["_reservation_generation"].as_str() != Some(&reservation.generation)
        {
            return;
        }
        let Ok(target) = target(&row.payload) else {
            return;
        };
        let reply = self.0.hardware.call_stop(target, source).await;
        if let Ok(reply) = reply
            && safe_stop_ack(row.payload["mode"].as_str().unwrap_or(""), &reply.result)
        {
            mark_stop_phase(phases, Phase::PostAckReadStart);
            let latest = self.record(id, None).await;
            mark_stop_phase(phases, Phase::PostAckReadEnd);
            if let Ok(latest) = latest
                && latest.payload["state"] == "STOPPING"
                && latest.payload["_reservation_generation"].as_str()
                    == Some(&reservation.generation)
            {
                // Early ACK suppresses duplicate sweeps. Only the execution
                // worker's separately verified cleanup can settle the lease.
                reservation.stop_acknowledged.store(true, Ordering::Release);
            }
        }
    }

    async fn dispatch_cancelled_stops(&self) {
        let mut state = self.0.state.lock().await;
        let remaining = STOPS_PENDING.saturating_sub(state.stop_pending.len());
        let stops: Vec<_> = state
            .active
            .iter()
            .filter(|(id, reservation)| {
                reservation.cancelled()
                    && !reservation.stop_acknowledged.load(Ordering::Acquire)
                    && !state.stop_pending.contains(*id)
            })
            .take(remaining)
            .map(|(id, reservation)| (id.clone(), reservation.clone()))
            .collect();
        for (id, reservation) in stops {
            state.stop_pending.insert(id.clone());
            let manager = self.clone();
            tokio::spawn(async move {
                manager.remote_stop(&id, &reservation, false, None).await;
                manager.0.state.lock().await.stop_pending.remove(&id);
                manager.0.idle.notify_one();
            });
        }
    }

    pub(super) async fn cancel_matching(
        &self,
        owner: Option<&str>,
        session: Option<&str>,
        client: Option<&str>,
        reason: &str,
    ) -> Result<(), ApiError> {
        let result = self.accept_matching(owner, session, client, reason).await;
        self.dispatch_cancelled_stops().await;
        result
    }

    async fn accept_matching(
        &self,
        owner: Option<&str>,
        session: Option<&str>,
        client: Option<&str>,
        reason: &str,
    ) -> Result<(), ApiError> {
        let mut after = String::new();
        loop {
            let rows = self
                .0
                .repo
                .active_page(owner, session, client, &after, 100)
                .await
                .map_err(runtime_error)?;
            let Some(last) = rows.last() else {
                return Ok(());
            };
            after.clone_from(&last.experiment_id);
            for row in rows {
                if let Err(error) = self
                    .accept_stop(&row.experiment_id, &row.owner_id, reason, None)
                    .await
                    && !matches!(error.code.as_str(), "NOT_FOUND" | "FORBIDDEN")
                {
                    return Err(error);
                }
            }
        }
    }

    pub async fn monitor_tick(&self) -> Result<(), ApiError> {
        if let Err(error) = self.check_authority().await {
            self.cancel_local().await;
            return Err(error);
        }
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
            for lease in rows
                .into_iter()
                .filter(|lease| !lease.quarantined && lease.expires_at <= now())
            {
                let row = self.record(&lease.experiment_id, None).await?;
                self.accept_stop(&lease.experiment_id, &row.owner_id, "TIMEOUT", None)
                    .await?;
            }
        }
        after.clear();
        loop {
            let rows = self
                .0
                .repo
                .active_page(None, None, None, &after, 100)
                .await
                .map_err(runtime_error)?;
            let Some(last) = rows.last() else {
                break;
            };
            after.clone_from(&last.experiment_id);
            let mut checked = HashMap::new();
            for row in rows {
                if let Some(session) = row.control_session_id
                    && !self.session_active_cached(&mut checked, &session).await
                {
                    self.accept_stop(&row.experiment_id, &row.owner_id, "SESSION_EXPIRED", None)
                        .await?;
                }
            }
        }
        self.dispatch_cancelled_stops().await;
        Ok(())
    }

    async fn session_active_cached(
        &self,
        checked: &mut HashMap<String, bool>,
        session: &str,
    ) -> bool {
        if let Some(active) = checked.get(session) {
            return *active;
        }
        let active = self.session_active(session).await;
        checked.insert(session.to_owned(), active);
        active
    }

    pub async fn shutdown(&self) -> Result<(), ApiError> {
        self.stop_admissions();
        let first = self.cancel_matching(None, None, None, "DISCONNECTED").await;
        if first.is_err() {
            self.cancel_local().await;
        }
        while self.admissions_pending() {
            self.0.idle.notified().await;
        }
        // An owned operation already past its admission fence can commit
        // while the first sweep reads the index. Reconcile after those tasks drain.
        let cancellation = self.cancel_matching(None, None, None, "DISCONNECTED").await;
        if cancellation.is_err() {
            self.cancel_local().await;
        }
        loop {
            let next = self.0.idle.notified();
            {
                let state = self.0.state.lock().await;
                if state.active.is_empty() && state.stop_pending.is_empty() {
                    break;
                }
            }
            next.await;
        }
        cancellation?;
        if self.0.cleanup_failed.load(Ordering::Acquire) {
            return Err(ApiError::new("UNAVAILABLE", 503));
        }
        Ok(())
    }

    async fn cancel_local(&self) {
        {
            let state = self.0.state.lock().await;
            for reservation in state.active.values() {
                reservation.emergency.store(true, Ordering::Release);
                reservation.cancelled.store(true, Ordering::Release);
            }
        }
        self.dispatch_cancelled_stops().await;
    }
}

fn pop_head(state: &mut Scheduler, station: &str, id: &str) {
    if let Some(queue) = state.queues.get_mut(station)
        && queue.front().is_some_and(|entry| entry == id)
    {
        queue.pop_front();
    }
}
