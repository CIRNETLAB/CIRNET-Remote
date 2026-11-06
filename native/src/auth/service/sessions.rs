use super::*;
use crate::db::write::tx_query;
use sqlx::types::Json;
use uuid::Uuid;

impl AuthService {
    pub async fn ensure_session(
        &self,
        cookie: Option<&str>,
        consume_legacy: bool,
        allow_create: bool,
    ) -> Result<SessionResolution> {
        if let Some(context) = self.current(cookie).await? {
            return Ok(SessionResolution {
                context: Some(context),
                cookie: None,
                replaced_invalid_cookie: false,
            });
        }
        if !allow_create
            && (!self.config.allow_guest || cookie.filter(|value| !value.is_empty()).is_none())
        {
            return Ok(SessionResolution {
                context: None,
                cookie: None,
                replaced_invalid_cookie: false,
            });
        }
        let mut tx = self.begin().await?;
        let now = now()?;
        if self.config.allow_guest
            && let Some(cookie) = cookie.filter(|value| !value.is_empty())
        {
            let expiry: Option<f64> = tx_query!(
                tx,
                query_scalar,
                fetch_optional,
                "SELECT expires_at FROM lab_sessions WHERE session_id = $1",
                cookie
            )
            .map_err(unavailable)?;
            if let Some(expiry) = expiry.filter(|expiry| *expiry > now) {
                tx_execute!(
                    tx,
                    "INSERT INTO auth_principals(principal_id, kind, created_at)
                    VALUES ($1, 'GUEST', $2) ON CONFLICT(principal_id) DO NOTHING",
                    cookie,
                    now
                )
                .map_err(unavailable)?;
                if consume_legacy {
                    let consumed = tx_execute!(
                        tx,
                        "DELETE FROM lab_sessions WHERE session_id = $1 AND expires_at > $2",
                        cookie,
                        now
                    )
                    .map_err(unavailable)?;
                    let (context, token, replaced) = if consumed == 1 {
                        let (context, token) = self
                            .new_session(&mut tx, Some(cookie), None, None, None)
                            .await?;
                        (context, token, false)
                    } else {
                        let (context, token) = self.guest(&mut tx).await?;
                        (context, token, true)
                    };
                    tx.commit().await.map_err(unavailable)?;
                    return Ok(SessionResolution {
                        context: Some(context),
                        cookie: Some(token),
                        replaced_invalid_cookie: replaced,
                    });
                }
                // A revoked/expired deterministic row is a tombstone until the
                // original legacy proof is consumed or expires.
                let id = Uuid::new_v5(
                    &Uuid::NAMESPACE_URL,
                    format!("netcircuit-legacy-read:{cookie}").as_bytes(),
                )
                .simple()
                .to_string();
                let row = tx.session_by_id(&id).await.map_err(unavailable)?;
                let context = match row {
                    Some(row) => context_from_row(row, self.config.allow_guest, now),
                    None => Some(
                        self.new_session(&mut tx, Some(cookie), None, Some(expiry), Some(id))
                            .await?
                            .0,
                    ),
                };
                tx.commit().await.map_err(unavailable)?;
                return Ok(SessionResolution {
                    context,
                    cookie: None,
                    replaced_invalid_cookie: false,
                });
            }
        }
        let (context, new_cookie) = if allow_create {
            let (context, token) = self.guest(&mut tx).await?;
            (Some(context), Some(token))
        } else {
            (None, None)
        };
        tx.commit().await.map_err(unavailable)?;
        Ok(SessionResolution {
            context,
            cookie: new_cookie,
            replaced_invalid_cookie: allow_create && cookie.is_some(),
        })
    }

    pub async fn login(
        &self,
        context: &SessionContext,
        username: &str,
        password: &str,
        client_address: &str,
    ) -> Result<SessionChange> {
        // The public request contract restricts the username to ASCII.
        let key = username.to_ascii_lowercase();
        self.admit(
            &format!("login-address:{}", token_hash(client_address)),
            10,
            60.0,
        )
        .await?;
        self.admit(
            &format!("login:{}", token_hash(&format!("{client_address}|{key}"))),
            10,
            60.0,
        )
        .await?;
        let mut read = self.begin().await?;
        let user = users::by_username(&mut read, &key).await?;
        read.commit().await.map_err(unavailable)?;
        let candidate = user
            .as_ref()
            .map(|user| user.password_hash.as_str())
            .unwrap_or(&self.dummy_hash)
            .to_owned();
        let password = password.to_owned();
        let allow_rehash = user.as_ref().is_some_and(|user| user.active);
        let (valid, rehash) =
            password_job(move || password_matches(&password, &candidate, allow_rehash)).await?;
        let user = user
            .filter(|user| valid && user.active)
            .ok_or_else(|| ApiError::new("INVALID_CREDENTIALS", 401))?;

        let mut tx = self.begin().await?;
        let context = self.locked_context(&mut tx, &context.session_id).await?;
        let fresh = users::by_id(&mut tx, &user.principal_id).await?;
        if !fresh.is_some_and(|row| row.active && row.auth_revision == user.auth_revision) {
            return Err(ApiError::new("INVALID_CREDENTIALS", 401));
        }
        if let Some(hash) = rehash {
            tx_execute!(
                tx,
                "UPDATE auth_users SET password_hash = $1 WHERE principal_id = $2",
                hash,
                &user.principal_id
            )
            .map_err(unavailable)?;
        }
        consume(&mut tx, &context).await?;
        let claimable = context.claimable_guest_id.as_deref().or_else(|| {
            if context.authenticated {
                None
            } else {
                context.principal_id.as_deref()
            }
        });
        let (next, cookie) = self
            .new_session(&mut tx, Some(&user.principal_id), claimable, None, None)
            .await?;
        audit(
            &mut tx,
            Some(&user.principal_id),
            "LOGIN",
            &user.principal_id,
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(SessionChange {
            context: next,
            cookie,
            revoked_session_ids: vec![context.session_id],
        })
    }

    pub async fn logout(&self, context: &SessionContext) -> Result<SessionChange> {
        let mut tx = self.begin().await?;
        let context = self.locked_context(&mut tx, &context.session_id).await?;
        consume(&mut tx, &context).await?;
        let principal = context.principal_id.as_deref();
        audit(
            &mut tx,
            principal,
            "LOGOUT",
            principal.unwrap_or("anonymous"),
        )
        .await?;
        let (next, cookie) = self.guest(&mut tx).await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(SessionChange {
            context: next,
            cookie,
            revoked_session_ids: vec![context.session_id],
        })
    }

    pub async fn claim_guest(
        &self,
        context: &SessionContext,
        confirm: bool,
    ) -> Result<SessionChange> {
        let unavailable_claim = || ApiError::new("GUEST_CLAIM_UNAVAILABLE", 409);
        let guest = context
            .claimable_guest_id
            .as_deref()
            .filter(|guest| !guest.is_empty())
            .filter(|_| confirm && context.authenticated)
            .ok_or_else(unavailable_claim)?;
        let mut tx = self.begin().await?;
        let context = self.locked_context(&mut tx, &context.session_id).await?;
        let owner = context
            .principal_id
            .as_deref()
            .filter(|_| {
                context.authenticated && context.claimable_guest_id.as_deref() == Some(guest)
            })
            .ok_or_else(unavailable_claim)?;
        consume(&mut tx, &context).await?;
        let revoked: Vec<String> = tx_query!(
            tx,
            query_scalar,
            fetch_all,
            "SELECT session_id FROM auth_sessions WHERE principal_id = $1 OR session_id = $2",
            guest,
            &context.session_id
        )
        .map_err(unavailable)?;

        // Match the lock order of admitted mutations: session authority first,
        // then experiment ownership/reservation. A failed claim rolls back the
        // revocations as well as every ownership change.
        tx_execute!(
            tx,
            "UPDATE auth_sessions SET revoked = TRUE WHERE principal_id = $1",
            guest
        )
        .map_err(unavailable)?;
        tx_execute!(
            tx,
            "UPDATE lab_experiments SET owner_id = owner_id WHERE owner_id = $1",
            guest
        )
        .map_err(unavailable)?;
        let leases: bool = tx_query!(
            tx,
            query_scalar,
            fetch_one,
            "SELECT EXISTS(SELECT 1 FROM lab_leases AS l JOIN lab_experiments AS e
                ON e.experiment_id = l.experiment_id WHERE e.owner_id = $1)",
            guest
        )
        .map_err(unavailable)?;
        if leases {
            return Err(ApiError::new("GUEST_CLAIM_ACTIVE_LEASE", 409));
        }
        let rows: Vec<Json<Value>> = tx_query!(
            tx,
            query_scalar,
            fetch_all,
            "SELECT payload FROM lab_experiments WHERE owner_id = $1",
            guest
        )
        .map_err(unavailable)?;
        if rows.iter().any(|row| {
            !matches!(
                row["state"].as_str(),
                Some("CREATED" | "COMPLETE" | "FAULT")
            )
        }) {
            return Err(ApiError::new("GUEST_CLAIM_ACTIVE_LEASE", 409));
        }
        let map_transfer = |error: sqlx::Error| {
            if integrity(&error) {
                ApiError::new("GUEST_CLAIM_CONFLICT", 409)
            } else {
                unavailable(error)
            }
        };
        tx_execute!(
            tx,
            "UPDATE lab_operations SET owner_id = $1 WHERE owner_id = $2",
            owner,
            guest
        )
        .map_err(map_transfer)?;
        tx_execute!(
            tx,
            "UPDATE lab_experiments SET owner_id = $1 WHERE owner_id = $2",
            owner,
            guest
        )
        .map_err(map_transfer)?;
        // The composite foreign key updates document ownership. Saved revision
        // authors and sealed capture/payload bytes are historical evidence.
        tx_execute!(
            tx,
            "UPDATE projects SET owner_id = $1 WHERE owner_id = $2",
            owner,
            guest
        )
        .map_err(map_transfer)?;
        audit(&mut tx, Some(owner), "GUEST_CLAIMED", guest).await?;
        let (next, cookie) = self
            .new_session(&mut tx, Some(owner), None, None, None)
            .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(SessionChange {
            context: next,
            cookie,
            revoked_session_ids: revoked,
        })
    }

    async fn new_session(
        &self,
        tx: &mut WriteTx,
        principal: Option<&str>,
        claimable: Option<&str>,
        max_expiry: Option<f64>,
        identity: Option<String>,
    ) -> Result<(SessionContext, String)> {
        let token = random_token()?;
        let id = identity.unwrap_or_else(|| Uuid::new_v4().simple().to_string());
        let revision: Option<i32> = tx_query!(
            tx,
            query_scalar,
            fetch_optional,
            "SELECT auth_revision FROM auth_users WHERE principal_id = $1",
            principal
        )
        .map_err(unavailable)?;
        let now = now()?;
        let deadline = now + self.config.session_ttl_seconds as f64;
        let expiry = max_expiry.map_or(deadline, |expiry| deadline.min(expiry));
        tx_execute!(
            tx,
            "INSERT INTO auth_sessions(session_id, token_hash, principal_id, csrf_token,
            expires_at, revoked, auth_revision, claimable_guest_id)
            VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)",
            &id,
            token_hash(&token),
            principal,
            random_token()?,
            expiry,
            revision.unwrap_or(0),
            claimable
        )
        .map_err(unavailable)?;
        let context = self.live_context(tx, &id).await?;
        Ok((context, token))
    }

    async fn guest(&self, tx: &mut WriteTx) -> Result<(SessionContext, String)> {
        let principal = if self.config.allow_guest {
            let id = Uuid::new_v4().simple().to_string();
            tx_execute!(
                tx,
                "INSERT INTO auth_principals(principal_id, kind, created_at)
                VALUES ($1, 'GUEST', $2)",
                &id,
                now()?
            )
            .map_err(unavailable)?;
            Some(id)
        } else {
            None
        };
        self.new_session(tx, principal.as_deref(), None, None, None)
            .await
    }
}

async fn consume(tx: &mut WriteTx, context: &SessionContext) -> Result<()> {
    let affected = tx_execute!(
        tx,
        "UPDATE auth_sessions SET revoked = TRUE
        WHERE session_id = $1 AND revoked = FALSE AND expires_at > $2",
        &context.session_id,
        now()?
    )
    .map_err(unavailable)?;
    if affected != 1 {
        return Err(expired());
    }
    Ok(())
}
