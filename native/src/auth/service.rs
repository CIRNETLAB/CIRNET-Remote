mod rates;
mod sessions;
mod users;

use super::{SessionContext, context_from_row};
use crate::{
    config::Config,
    db::{
        WriteDb, WriteTx,
        write::{Tx, tx_execute},
    },
    error::ApiError,
};
use argon2::{
    Algorithm, Argon2, Params, Version,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::{RngCore, rngs::OsRng};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::{Mutex, Semaphore};

type Result<T> = std::result::Result<T, ApiError>;
const ROLES: &[&str] = &["STUDENT", "INSTRUCTOR", "ADMIN"];
const AUTH_LOCK: i64 = i64::from_be_bytes(*b"CIRNETAU");

#[derive(Clone)]
pub struct AuthService {
    db: WriteDb,
    config: Config,
    dummy_hash: String,
    maintenance_after: Arc<Mutex<Option<(f64, String)>>>,
}

pub struct SessionResolution {
    pub context: Option<SessionContext>,
    pub cookie: Option<String>,
    pub replaced_invalid_cookie: bool,
}

pub struct SessionChange {
    pub context: SessionContext,
    pub cookie: String,
    pub revoked_session_ids: Vec<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct UserView {
    pub principal_id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
    pub active: bool,
}

pub struct UserChange {
    pub user: UserView,
    pub revoked_session_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct MaintenanceResult {
    pub sessions_removed: u64,
    pub rate_buckets_removed: u64,
}

impl AuthService {
    pub async fn new(db: WriteDb, config: Config) -> Result<Self> {
        if config.read_only {
            return Err(ApiError::new("UNAVAILABLE", 503));
        }
        let dummy_hash = password_job(|| password_hash(&random_token()?)).await?;
        Ok(Self {
            db,
            config,
            dummy_hash,
            maintenance_after: Arc::new(Mutex::new(None)),
        })
    }

    pub async fn current(&self, cookie: Option<&str>) -> Result<Option<SessionContext>> {
        super::current(&self.db.reads(), cookie, &self.config).await
    }

    pub async fn session_active(&self, session_id: &str) -> Result<bool> {
        let row = self
            .db
            .reads()
            .session_by_id(session_id)
            .await
            .map_err(unavailable)?;
        let now = now()?;
        Ok(row
            .and_then(|row| context_from_row(row, self.config.allow_guest, now))
            .is_some())
    }

    pub fn view(&self, context: &SessionContext) -> Value {
        let mut principal = context
            .principal_id
            .as_ref()
            .map_or(Value::Null, |principal_id| {
                json!({
                    "principal_id": principal_id,
                    "kind": if context.authenticated { "USER" } else { "GUEST" },
                    "role": context.role,
                })
            });
        if let Some(object) = principal.as_object_mut() {
            if let Some(username) = &context.username {
                object.insert("username".into(), json!(username));
            }
            if let Some(display_name) = &context.display_name {
                object.insert("display_name".into(), json!(display_name));
            }
        }
        json!({
            "schema_version": "1.0", "authenticated": context.authenticated,
            "principal": principal, "csrf_token": context.csrf_token, "expires_at": context.expires_at,
            "guest_enabled": self.config.allow_guest,
            "claim_available": context.authenticated && context.claimable_guest_id.as_ref().is_some_and(|id| !id.is_empty()),
        })
    }

    async fn begin(&self) -> Result<WriteTx> {
        let mut tx = self.db.begin().await.map_err(unavailable)?;
        // SQLite starts with a writer lock. PostgreSQL serializes the global
        // auth predicates (last admin, bootstrap and bucket capacity) without
        // replacing the same-transaction session/parent row fences.
        if let Tx::Postgres(connection) = &mut tx.inner {
            sqlx::query("SELECT pg_advisory_xact_lock($1)")
                .bind(AUTH_LOCK)
                .execute(&mut **connection)
                .await
                .map_err(unavailable)?;
        }
        Ok(tx)
    }

    async fn live_context(&self, tx: &mut WriteTx, id: &str) -> Result<SessionContext> {
        let now = now()?;
        tx.session_by_id(id)
            .await
            .map_err(unavailable)?
            .and_then(|row| context_from_row(row, self.config.allow_guest, now))
            .ok_or_else(expired)
    }

    async fn locked_context(&self, tx: &mut WriteTx, id: &str) -> Result<SessionContext> {
        super::fenced_context(tx, id, &self.config).await
    }
}

async fn audit(tx: &mut WriteTx, actor: Option<&str>, action: &str, subject: &str) -> Result<()> {
    tx_execute!(
        tx,
        "INSERT INTO auth_audit(occurred_at, actor_id, action, subject_id)
                     VALUES ($1, $2, $3, $4)",
        now()?,
        actor,
        action,
        subject
    )
    .map_err(unavailable)?;
    Ok(())
}

fn unavailable<T>(_: T) -> ApiError {
    ApiError::new("UNAVAILABLE", 503)
}
fn expired() -> ApiError {
    ApiError::new("SESSION_EXPIRED", 401)
}

fn now() -> Result<f64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .map_err(unavailable)
}

fn random_token() -> Result<String> {
    let mut bytes = [0; 32];
    OsRng.try_fill_bytes(&mut bytes).map_err(unavailable)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn token_hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn hasher() -> Argon2<'static> {
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(65_536, 3, 4, Some(32)).expect("fixed Argon2 profile"),
    )
}

fn password_hash(password: &str) -> Result<String> {
    let mut bytes = [0; 16];
    OsRng.try_fill_bytes(&mut bytes).map_err(unavailable)?;
    let salt = SaltString::encode_b64(&bytes).map_err(unavailable)?;
    hasher()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(unavailable)
}

async fn password_job<T: Send + 'static>(
    work: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    static LIMIT: OnceLock<Arc<Semaphore>> = OnceLock::new();
    let permit = LIMIT
        .get_or_init(|| Arc::new(Semaphore::new(4)))
        .clone()
        .acquire_owned()
        .await
        .map_err(unavailable)?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        work()
    })
    .await
    .map_err(unavailable)?
}

fn password_matches(password: &str, encoded: &str, rehash: bool) -> Result<(bool, Option<String>)> {
    let Ok(parsed) = PasswordHash::new(encoded) else {
        return Ok((false, None));
    };
    if hasher()
        .verify_password(password.as_bytes(), &parsed)
        .is_err()
    {
        return Ok((false, None));
    }
    let same = parsed.algorithm.as_str() == "argon2id"
        && parsed.version == Some(19)
        && parsed.params.get_decimal("m") == Some(65_536)
        && parsed.params.get_decimal("t") == Some(3)
        && parsed.params.get_decimal("p") == Some(4)
        && parsed.salt.is_some_and(|value| value.as_str().len() == 22)
        && parsed.hash.is_some_and(|value| value.len() == 32);
    let updated = if rehash && !same {
        Some(password_hash(password)?)
    } else {
        None
    };
    Ok((true, updated))
}

fn integrity(error: &sqlx::Error) -> bool {
    use sqlx::error::ErrorKind;
    error.as_database_error().is_some_and(|error| {
        matches!(
            error.kind(),
            ErrorKind::UniqueViolation
                | ErrorKind::ForeignKeyViolation
                | ErrorKind::NotNullViolation
                | ErrorKind::CheckViolation
        )
    })
}
