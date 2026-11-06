use super::*;
use crate::db::write::tx_query;

const MAX_BUCKETS: i64 = 10_000;
const LEGACY_BUCKET_SECONDS: f64 = 86_400.0;

impl AuthService {
    pub async fn admit_bootstrap(&self, client_address: &str) -> Result<()> {
        self.admit(
            &format!("bootstrap:{}", token_hash(client_address)),
            self.config.bootstrap_limit,
            60.0,
        )
        .await
    }

    pub(super) async fn admit(&self, bucket: &str, limit: usize, window: f64) -> Result<()> {
        let mut tx = self.begin().await?;
        let now = now()?;
        let row: Option<(f64, i32)> = tx_query!(
            tx,
            query_as,
            fetch_optional,
            "SELECT window_start, attempts FROM auth_rate_limits WHERE bucket = $1",
            bucket
        )
        .map_err(unavailable)?;
        if let Some((started, attempts)) = row {
            if started > now - window {
                if attempts as usize >= limit {
                    return Err(ApiError::new("RATE_LIMITED", 429));
                }
                tx_execute!(
                    tx,
                    "UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE bucket = $1",
                    bucket
                )
                .map_err(unavailable)?;
            } else {
                tx_execute!(
                    tx,
                    "UPDATE auth_rate_limits SET window_start = $1, attempts = 1 WHERE bucket = $2",
                    now,
                    bucket
                )
                .map_err(unavailable)?;
            }
        } else {
            let at_capacity: Option<String> = tx_query!(
                tx,
                query_scalar,
                fetch_optional,
                "SELECT bucket FROM auth_rate_limits LIMIT 1 OFFSET $1",
                MAX_BUCKETS - 1
            )
            .map_err(unavailable)?;
            if at_capacity.is_some() {
                return Err(ApiError::new("RATE_LIMITED", 429));
            }
            tx_execute!(
                tx,
                "INSERT INTO auth_rate_limits(bucket, window_start, attempts) VALUES ($1, $2, 1)",
                bucket,
                now
            )
            .map_err(unavailable)?;
        }
        tx.commit().await.map_err(unavailable)
    }

    pub async fn maintain(&self) -> Result<MaintenanceResult> {
        let mut cursor = self.maintenance_after.lock().await;
        let mut tx = self.begin().await?;
        let now = now()?;
        let cutoff = now - self.config.auth_retention_seconds as f64;
        let batch = i64::try_from(self.config.auth_maintenance_batch).map_err(unavailable)?;
        let (expiry, identity) = match cursor.as_ref() {
            Some((expiry, identity)) => (Some(*expiry), Some(identity.as_str())),
            None => (None, None),
        };
        let candidates: Vec<(String, f64)> = tx_query!(
            tx,
            query_as,
            fetch_all,
            "SELECT session_id, expires_at FROM auth_sessions WHERE expires_at <= $1
             AND (CAST($2 AS DOUBLE PRECISION) IS NULL OR expires_at > $2
                OR (expires_at = $2 AND session_id > $3))
             ORDER BY expires_at, session_id LIMIT $4",
            cutoff,
            expiry,
            identity,
            batch
        )
        .map_err(unavailable)?;
        // Keep old deterministic read-session tombstones for as long as
        // the original legacy proof could otherwise recreate authority.
        let sessions_removed = tx_execute!(tx,
            "WITH candidates AS (
                SELECT session_id FROM auth_sessions WHERE expires_at <= $1
                AND (CAST($2 AS DOUBLE PRECISION) IS NULL OR expires_at > $2
                    OR (expires_at = $2 AND session_id > $3))
                ORDER BY expires_at, session_id LIMIT $4
            )
            DELETE FROM auth_sessions WHERE session_id IN (SELECT session_id FROM candidates)
                AND NOT EXISTS (SELECT 1 FROM lab_sessions
                    WHERE lab_sessions.session_id = auth_sessions.principal_id AND lab_sessions.expires_at > $5)",
            cutoff, expiry, identity, batch, now).map_err(unavailable)?;
        let rate_buckets_removed = tx_execute!(
            tx,
            "DELETE FROM auth_rate_limits WHERE bucket IN (
                SELECT bucket FROM auth_rate_limits WHERE window_start <= $1
                ORDER BY window_start, bucket LIMIT $2)",
            now - LEGACY_BUCKET_SECONDS,
            batch
        )
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        *cursor = if candidates.len() == self.config.auth_maintenance_batch {
            candidates.last().map(|(id, expiry)| (*expiry, id.clone()))
        } else {
            None
        };
        Ok(MaintenanceResult {
            sessions_removed,
            rate_buckets_removed,
        })
    }
}
