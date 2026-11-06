use super::*;
use crate::db::write::tx_query;
use uuid::Uuid;

#[derive(sqlx::FromRow)]
pub(super) struct UserRow {
    pub(super) principal_id: String,
    username: String,
    display_name: String,
    role: String,
    pub(super) active: bool,
    pub(super) auth_revision: i32,
    pub(super) password_hash: String,
}

impl From<UserRow> for UserView {
    fn from(row: UserRow) -> Self {
        Self {
            principal_id: row.principal_id,
            username: row.username,
            display_name: row.display_name,
            role: row.role,
            active: row.active,
        }
    }
}

impl AuthService {
    pub async fn bootstrap_admin(
        &self,
        username: &str,
        password: &str,
        display_name: Option<&str>,
    ) -> Result<UserView> {
        let mut tx = self.begin().await?;
        let admin: Option<String> = tx_query!(
            tx,
            query_scalar,
            fetch_optional,
            "SELECT principal_id FROM auth_users WHERE role = 'ADMIN' LIMIT 1"
        )
        .map_err(unavailable)?;
        if admin.is_some() {
            return Err(ApiError::new("BOOTSTRAP_ALREADY_COMPLETE", 409));
        }
        let display = credentials(username, password, "ADMIN", display_name)?;
        let owned_password = password.to_owned();
        let hash = password_job(move || password_hash(&owned_password)).await?;
        let user = insert_user(&mut tx, None, username, "ADMIN", display, &hash).await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(user)
    }

    pub async fn create_user(
        &self,
        actor: &SessionContext,
        username: &str,
        password: &str,
        role: &str,
        display_name: Option<&str>,
    ) -> Result<UserView> {
        self.require_admin(actor).await?;
        let display = credentials(username, password, role, display_name)?;
        let owned_password = password.to_owned();
        let hash = password_job(move || password_hash(&owned_password)).await?;
        let mut tx = self.begin().await?;
        let actor = self.locked_context(&mut tx, &actor.session_id).await?;
        admin(&actor)?;
        let user = insert_user(
            &mut tx,
            actor.principal_id.as_deref(),
            username,
            role,
            display,
            &hash,
        )
        .await?;
        tx.commit().await.map_err(unavailable)?;
        Ok(user)
    }

    pub async fn list_users(&self, actor: &SessionContext) -> Result<Vec<UserView>> {
        if !actor.authenticated {
            return Err(ApiError::new("FORBIDDEN", 403));
        }
        let mut tx = self.begin().await?;
        self.live_context(&mut tx, &actor.session_id).await?;
        admin(actor)?;
        let rows: Vec<UserView> = tx_query!(
            tx,
            query_as,
            fetch_all,
            "SELECT principal_id, username, display_name, role, active
             FROM auth_users ORDER BY username_key"
        )
        .map_err(unavailable)?;
        tx.commit().await.map_err(unavailable)?;
        Ok(rows)
    }

    pub async fn update_user(
        &self,
        actor: &SessionContext,
        principal_id: &str,
        changes: &Value,
    ) -> Result<UserChange> {
        self.require_admin(actor).await?;
        let invalid = || ApiError::new("INVALID_USER_UPDATE", 422);
        let fields = changes
            .as_object()
            .filter(|fields| {
                !fields.is_empty()
                    && fields
                        .keys()
                        .all(|key| matches!(key.as_str(), "role" | "active"))
            })
            .ok_or_else(invalid)?;
        let new_role = fields
            .get("role")
            .map(|value| {
                value
                    .as_str()
                    .filter(|role| ROLES.contains(role))
                    .ok_or_else(|| ApiError::new("INVALID_ROLE", 422))
            })
            .transpose()?;
        let new_active = fields
            .get("active")
            .map(|value| value.as_bool().ok_or_else(invalid))
            .transpose()?;
        let mut tx = self.begin().await?;
        let actor = self.locked_context(&mut tx, &actor.session_id).await?;
        admin(&actor)?;
        let user = by_id(&mut tx, principal_id)
            .await?
            .ok_or_else(|| ApiError::new("USER_NOT_FOUND", 404))?;
        let role = new_role.unwrap_or(&user.role);
        let active = new_active.unwrap_or(user.active);
        if user.role == "ADMIN" && user.active && (role != "ADMIN" || !active) {
            let admins: i64 = tx_query!(
                tx,
                query_scalar,
                fetch_one,
                "SELECT COUNT(*) FROM auth_users WHERE role = 'ADMIN' AND active = TRUE"
            )
            .map_err(unavailable)?;
            if admins <= 1 {
                return Err(ApiError::new("LAST_ADMIN_REQUIRED", 409));
            }
        }
        let revoked: Vec<String> = tx_query!(
            tx,
            query_scalar,
            fetch_all,
            "SELECT session_id FROM auth_sessions WHERE principal_id = $1 AND revoked = FALSE",
            principal_id
        )
        .map_err(unavailable)?;
        tx_execute!(
            tx,
            "UPDATE auth_sessions SET revoked = TRUE WHERE principal_id = $1",
            principal_id
        )
        .map_err(unavailable)?;
        tx_execute!(
            tx,
            "UPDATE auth_users SET role = $1, active = $2, auth_revision = auth_revision + 1
            WHERE principal_id = $3",
            role,
            active,
            principal_id
        )
        .map_err(unavailable)?;
        audit(
            &mut tx,
            actor.principal_id.as_deref(),
            "USER_UPDATED",
            principal_id,
        )
        .await?;
        let role = role.to_owned();
        let mut view = UserView::from(user);
        view.active = active;
        view.role = role;
        tx.commit().await.map_err(unavailable)?;
        Ok(UserChange {
            user: view,
            revoked_session_ids: revoked,
        })
    }

    async fn require_admin(&self, actor: &SessionContext) -> Result<()> {
        if !actor.authenticated {
            return Err(ApiError::new("FORBIDDEN", 403));
        }
        let mut tx = self.begin().await?;
        self.live_context(&mut tx, &actor.session_id).await?;
        admin(actor)?;
        tx.commit().await.map_err(unavailable)
    }
}

fn admin(actor: &SessionContext) -> Result<()> {
    if !actor.authenticated || actor.role != "ADMIN" {
        return Err(ApiError::new("FORBIDDEN", 403));
    }
    Ok(())
}

fn credentials<'a>(
    username: &'a str,
    password: &str,
    role: &str,
    display_name: Option<&'a str>,
) -> Result<&'a str> {
    let mut bytes = username.bytes();
    if !(3..=64).contains(&username.len())
        || !bytes
            .next()
            .is_some_and(|first| first.is_ascii_alphanumeric())
        || !bytes.all(|value| value.is_ascii_alphanumeric() || b"_.@-".contains(&value))
    {
        return Err(ApiError::new("INVALID_USERNAME", 422));
    }
    if !(12..=1024).contains(&password.chars().count()) {
        return Err(ApiError::new("INVALID_PASSWORD", 422));
    }
    if !ROLES.contains(&role) {
        return Err(ApiError::new("INVALID_ROLE", 422));
    }
    let display = display_name
        .filter(|name| !name.is_empty())
        .unwrap_or(username);
    if display.chars().count() > 128 {
        return Err(ApiError::new("INVALID_DISPLAY_NAME", 422));
    }
    Ok(display)
}

async fn insert_user(
    tx: &mut WriteTx,
    actor: Option<&str>,
    username: &str,
    role: &str,
    display: &str,
    hash: &str,
) -> Result<UserView> {
    let principal_id = Uuid::new_v4().simple().to_string();
    let duplicate = |error: sqlx::Error| {
        if integrity(&error) {
            ApiError::new("USERNAME_EXISTS", 409)
        } else {
            unavailable(error)
        }
    };
    tx_execute!(
        tx,
        "INSERT INTO auth_principals(principal_id, kind, created_at)
        VALUES ($1, 'USER', $2)",
        &principal_id,
        now()?
    )
    .map_err(duplicate)?;
    tx_execute!(
        tx,
        "INSERT INTO auth_users(principal_id, username, username_key, display_name,
        password_hash, role, active, auth_revision) VALUES ($1, $2, $3, $4, $5, $6, TRUE, 0)",
        &principal_id,
        username,
        username.to_ascii_lowercase(),
        display,
        hash,
        role
    )
    .map_err(duplicate)?;
    audit(tx, actor, "USER_CREATED", &principal_id).await?;
    Ok(UserView {
        principal_id,
        username: username.to_owned(),
        display_name: display.to_owned(),
        role: role.to_owned(),
        active: true,
    })
}

pub(super) async fn by_username(tx: &mut WriteTx, key: &str) -> Result<Option<UserRow>> {
    tx_query!(
        tx,
        query_as,
        fetch_optional,
        "SELECT principal_id, username, display_name, role, active, auth_revision, password_hash
         FROM auth_users WHERE username_key = $1",
        key
    )
    .map_err(unavailable)
}

pub(super) async fn by_id(tx: &mut WriteTx, principal_id: &str) -> Result<Option<UserRow>> {
    tx_query!(
        tx,
        query_as,
        fetch_optional,
        "SELECT principal_id, username, display_name, role, active, auth_revision, password_hash
         FROM auth_users WHERE principal_id = $1",
        principal_id
    )
    .map_err(unavailable)
}
