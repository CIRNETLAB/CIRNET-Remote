mod service;
pub use service::{
    AuthService, MaintenanceResult, SessionChange, SessionResolution, UserChange, UserView,
};

use crate::{
    config::Config,
    db::{Db, SessionRow},
    error::ApiError,
};
use http::HeaderMap;

#[derive(Clone, Debug)]
pub struct SessionContext {
    pub session_id: String,
    pub principal_id: Option<String>,
    pub owner_id: Option<String>,
    pub role: String,
    pub authenticated: bool,
    pub csrf_token: String,
    pub expires_at: f64,
    pub claimable_guest_id: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
}
pub fn session_cookie(headers: &HeaderMap) -> Option<String> {
    let value: String = headers
        .get("cookie")?
        .as_bytes()
        .iter()
        .map(|byte| char::from(*byte))
        .collect();
    let mut canonical = None;
    let mut legacy = None;
    for pair in value.split(';') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        let target = match key.trim() {
            "cirnet_session" => &mut canonical,
            "netcircuit_session" => &mut legacy,
            _ => continue,
        };
        let value = value.trim();
        *target = Some(
            if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
                let inner: Vec<char> = value[1..value.len() - 1].chars().collect();
                let mut decoded = String::new();
                let mut i = 0;
                while i < inner.len() {
                    if inner[i] == '\\' && i + 1 < inner.len() {
                        i += 1;
                        if i + 2 < inner.len()
                            && ('0'..='3').contains(&inner[i])
                            && ('0'..='7').contains(&inner[i + 1])
                            && ('0'..='7').contains(&inner[i + 2])
                        {
                            let number = (inner[i] as u8 - b'0') * 64
                                + (inner[i + 1] as u8 - b'0') * 8
                                + (inner[i + 2] as u8 - b'0');
                            decoded.push(char::from(number));
                            i += 3;
                            continue;
                        }
                    }
                    decoded.push(inner[i]);
                    i += 1;
                }
                decoded
            } else {
                value.to_owned()
            },
        );
    }
    canonical.or(legacy)
}
pub fn csrf_header(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("x-cirnet-csrf")
        .or_else(|| headers.get("x-csrf-token"))?
        .to_str()
        .ok()
}
pub fn context_from_row(row: SessionRow, allow_guest: bool, now: f64) -> Option<SessionContext> {
    if row.revoked || row.expires_at <= now {
        return None;
    }
    let authenticated = row.principal_id.is_some() && row.user_principal_id.is_some();
    if row.principal_id.is_some() && !authenticated && !allow_guest {
        return None;
    }
    if authenticated
        && (row.active != Some(true) || row.user_auth_revision != Some(row.auth_revision))
    {
        return None;
    }
    Some(SessionContext {
        session_id: row.session_id,
        owner_id: row.principal_id.clone(),
        principal_id: row.principal_id,
        role: if authenticated {
            row.role.unwrap_or_else(|| "STUDENT".into())
        } else {
            "STUDENT".into()
        },
        authenticated,
        csrf_token: row.csrf_token,
        expires_at: row.expires_at,
        claimable_guest_id: row.claimable_guest_id,
        username: if authenticated { row.username } else { None },
        display_name: if authenticated {
            row.display_name
        } else {
            None
        },
    })
}
pub async fn current(
    db: &Db,
    cookie: Option<&str>,
    config: &Config,
) -> Result<Option<SessionContext>, ApiError> {
    use sha2::{Digest, Sha256};
    let Some(cookie) = cookie.filter(|value| !value.is_empty() && value.chars().count() <= 256)
    else {
        return Ok(None);
    };
    let hash = format!("{:x}", Sha256::digest(cookie.as_bytes()));
    let row = db
        .session_by_token_hash(&hash)
        .await
        .map_err(|_| ApiError::new("UNAVAILABLE", 503))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| ApiError::new("UNAVAILABLE", 503))?
        .as_secs_f64();
    Ok(row.and_then(|row| context_from_row(row, config.allow_guest, now)))
}
async fn fenced_context(
    tx: &mut crate::db::WriteTx,
    session_id: &str,
    config: &Config,
) -> Result<SessionContext, ApiError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| ApiError::new("UNAVAILABLE", 503))?
        .as_secs_f64();
    tx.fence_session(session_id, now)
        .await
        .map_err(|_| ApiError::new("UNAVAILABLE", 503))?
        .and_then(|row| context_from_row(row, config.allow_guest, now))
        .ok_or_else(|| ApiError::new("SESSION_EXPIRED", 401))
}

pub async fn authorize_session(
    tx: &mut crate::db::WriteTx,
    session_id: &str,
    owner: &str,
    config: &Config,
) -> Result<SessionContext, ApiError> {
    let context = fenced_context(tx, session_id, config).await?;
    if context.owner_id.as_deref() != Some(owner) {
        return Err(ApiError::new("SESSION_EXPIRED", 401));
    }
    Ok(context)
}

pub fn verify_origin(config: &Config, origin: Option<&str>) -> Result<(), ApiError> {
    if origin.is_some_and(|origin| {
        config
            .trusted_origins
            .iter()
            .any(|allowed| origin == allowed)
    }) {
        Ok(())
    } else {
        Err(ApiError::new("ORIGIN_REJECTED", 403))
    }
}
pub fn verify_csrf(context: &SessionContext, token: Option<&str>) -> Result<(), ApiError> {
    use subtle::ConstantTimeEq;
    if token.is_some_and(|token| bool::from(context.csrf_token.as_bytes().ct_eq(token.as_bytes())))
    {
        Ok(())
    } else {
        Err(ApiError::new("CSRF_REJECTED", 403))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn row() -> SessionRow {
        SessionRow {
            session_id: "session".into(),
            principal_id: Some("owner".into()),
            csrf_token: "csrf".into(),
            expires_at: 200.0,
            revoked: false,
            auth_revision: 7,
            claimable_guest_id: None,
            user_principal_id: Some("owner".into()),
            user_auth_revision: Some(7),
            active: Some(true),
            role: Some("STUDENT".into()),
            username: Some("student".into()),
            display_name: Some("Student".into()),
        }
    }
    #[test]
    fn canonical_cookie_presence_owns_the_request_including_empty_value() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "cookie",
            "netcircuit_session=old; cirnet_session=".parse().unwrap(),
        );
        assert_eq!(session_cookie(&headers).as_deref(), Some(""));
        headers.insert(
            "cookie",
            "netcircuit_session=old; cirnet_session=invalid"
                .parse()
                .unwrap(),
        );
        assert_eq!(session_cookie(&headers).as_deref(), Some("invalid"));
        headers.insert("cookie", "netcircuit_session=valid".parse().unwrap());
        assert_eq!(session_cookie(&headers).as_deref(), Some("valid"));
        headers.insert("cookie", "cirnet_session=\"quoted\"".parse().unwrap());
        assert_eq!(session_cookie(&headers).as_deref(), Some("quoted"));
    }
    #[test]
    fn quoted_cookie_octal_decodes_full_byte_range() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "cookie",
            r#"cirnet_session="\377\000\073""#.parse().unwrap(),
        );
        assert_eq!(session_cookie(&headers).as_deref(), Some("ÿ\0;"));
    }

    #[test]
    fn canonical_csrf_presence_never_revives_legacy_authority() {
        let mut headers = HeaderMap::new();
        headers.insert("x-csrf-token", "good".parse().unwrap());
        headers.insert("x-cirnet-csrf", "".parse().unwrap());
        assert_eq!(csrf_header(&headers), Some(""));
        headers.remove("x-cirnet-csrf");
        assert_eq!(csrf_header(&headers), Some("good"));
    }
    #[test]
    fn expired_revoked_disabled_or_old_revision_contexts_are_rejected() {
        assert!(context_from_row(row(), false, 199.0).unwrap().authenticated);
        assert!(context_from_row(row(), false, 200.0).is_none());
        let mut value = row();
        value.revoked = true;
        assert!(context_from_row(value, true, 1.0).is_none());
        let mut value = row();
        value.active = Some(false);
        assert!(context_from_row(value, true, 1.0).is_none());
        let mut value = row();
        value.user_auth_revision = Some(8);
        assert!(context_from_row(value, true, 1.0).is_none());
    }
    #[test]
    fn guest_permission_is_distinct_from_anonymous_session() {
        let mut guest = row();
        guest.user_principal_id = None;
        guest.user_auth_revision = None;
        guest.active = None;
        assert!(context_from_row(guest, false, 1.0).is_none());
        let mut guest = row();
        guest.user_principal_id = None;
        guest.user_auth_revision = None;
        guest.active = None;
        assert!(!context_from_row(guest, true, 1.0).unwrap().authenticated);
        let mut anonymous = row();
        anonymous.principal_id = None;
        anonymous.user_principal_id = None;
        assert!(
            context_from_row(anonymous, false, 1.0)
                .unwrap()
                .owner_id
                .is_none()
        );
    }
    #[test]
    fn mutation_verification_requires_exact_origin_and_csrf() {
        let config = Config::from_vars(&Default::default()).unwrap();
        assert!(verify_origin(&config, Some("http://testserver")).is_ok());
        assert_eq!(
            verify_origin(&config, Some("http://testserver.attacker"))
                .unwrap_err()
                .code,
            "ORIGIN_REJECTED"
        );
        assert_eq!(verify_origin(&config, None).unwrap_err().status, 403);
        let context = context_from_row(row(), false, 1.0).unwrap();
        assert!(verify_csrf(&context, Some("csrf")).is_ok());
        assert_eq!(
            verify_csrf(&context, Some("CSRF")).unwrap_err().code,
            "CSRF_REJECTED"
        );
        assert!(verify_csrf(&context, None).is_err());
    }
}
