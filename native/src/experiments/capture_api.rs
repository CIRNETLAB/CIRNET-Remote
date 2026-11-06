use super::*;
use crate::db::runtime::OperationKey;

impl ExperimentManager {
    pub async fn capture_payload(
        &self,
        context: &SessionContext,
        id: &str,
    ) -> Result<Vec<u8>, ApiError> {
        let owner = owner(context)?;
        let guard = self.capture_guard(id)?;
        let _capture = guard.lock().await;
        let reference = self
            .0
            .repo
            .capture_reference(id, Some(owner))
            .await
            .map_err(runtime_error)?;
        let captures = self.capture_store()?.clone();
        let bytes = tokio::task::spawn_blocking(move || captures.read(&reference.metadata))
            .await
            .map_err(|_| internal())??;

        // Claim, revocation and retirement can commit while the file is read.
        if !self.session_active(&context.session_id).await {
            return Err(ApiError::new("SESSION_EXPIRED", 401));
        }
        if !self
            .0
            .repo
            .capture_reference(id, Some(owner))
            .await
            .map_err(runtime_error)?
            .available
        {
            return Err(ApiError::new("CAPTURE_UNAVAILABLE", 422));
        }
        Ok(bytes)
    }

    pub async fn delete_capture(
        &self,
        context: &SessionContext,
        id: &str,
    ) -> Result<Value, ApiError> {
        let manager = self.clone();
        let context = context.clone();
        let id = id.to_owned();
        self.owned(async move {
            manager
                .retire_capture(&id, owner(&context)?, "DELETED", Some(&context))
                .await
        })
        .await
    }

    pub async fn expire_captures(&self, limit: usize, dry_run: bool) -> Result<Value, ApiError> {
        let retention = self.0.config.capture_retention_seconds;
        let cutoff = (retention != 0).then(|| now() - retention as f64);
        let references = self
            .0
            .repo
            .expired_captures(cutoff, limit)
            .await
            .map_err(runtime_error)?;
        let scanned = references.len();
        let mut deleted = 0;
        let mut failed = 0;
        if !dry_run {
            for reference in references {
                match self
                    .retire_capture(
                        &reference.capture_id,
                        &reference.owner_id,
                        "RETENTION",
                        None,
                    )
                    .await
                {
                    Ok(_) => deleted += 1,
                    Err(_) => failed += 1,
                }
            }
        }
        Ok(json!({"scanned":scanned, "deleted":deleted, "failed":failed, "dry_run":dry_run}))
    }

    async fn retire_capture(
        &self,
        id: &str,
        owner: &str,
        reason: &str,
        session: Option<&SessionContext>,
    ) -> Result<Value, ApiError> {
        let guard = self.capture_guard(id)?;
        let _capture = guard.lock().await;
        let mut tx = self.0.repo.begin().await.map_err(runtime_error)?;
        let actor = if let Some(session) = session {
            auth::authorize_session(&mut tx, &session.session_id, owner, &self.0.config)
                .await?
                .principal_id
        } else {
            None
        };
        let retired = self
            .0
            .repo
            .retire_capture_in(&mut tx, id, owner, reason, actor.as_deref())
            .await
            .map_err(runtime_error)?;
        tx.commit().await.map_err(|_| internal())?;
        if retired.changed
            && let Ok(row) = self.record(&retired.reference.experiment_id, None).await
        {
            let state = self.0.state.lock().await;
            self.publish(&state, &row).await;
        }

        let reference = self
            .0
            .repo
            .capture_reference(id, Some(owner))
            .await
            .map_err(runtime_error)?;
        if reference.cleanup_pending {
            let capture_id = id.to_owned();
            let captures = self.capture_store()?.clone();
            tokio::task::spawn_blocking(move || captures.remove(&capture_id))
                .await
                .map_err(|_| internal())??;
            self.0
                .repo
                .finish_capture_cleanup(id)
                .await
                .map_err(runtime_error)?;
        }
        Ok(retired.reference.metadata)
    }

    fn capture_guard(&self, id: &str) -> Result<Arc<Mutex<()>>, ApiError> {
        self.0.operation_guards.lock(OperationKey {
            owner_id: "",
            kind: "capture",
            scope: "",
            key: id,
        })
    }
}
