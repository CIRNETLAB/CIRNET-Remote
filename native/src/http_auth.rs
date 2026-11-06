//! Writable HTTP auth boundary and post-commit revocation dispatch.
use crate::{
    auth::{self, AuthService, SessionChange, SessionContext, SessionResolution},
    config::Config,
    error::ApiError,
    http_projects::{contract_body_profile, decode_path},
};
use axum::response::{IntoResponse, Response};
use cirnet_contracts_native::validation::Registry;
use http::{HeaderMap, HeaderValue, Method, StatusCode, header::SET_COOKIE};
use serde_json::Value;
use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub const AUTH_OPERATIONS: &[&str] = &[
    "getSession",
    "login",
    "logout",
    "claimGuest",
    "listUsers",
    "createUser",
    "updateUser",
];

pub type Revocation<'a> = Pin<Box<dyn Future<Output = Result<(), ApiError>> + Send + 'a>>;

/// A successful acknowledgement means all listed sessions were delivered to
/// the control revocation path. Absence of a receiver cannot acknowledge.
pub trait SessionRevoker: Send + Sync {
    fn revoke<'a>(&'a self, session_ids: &'a [String]) -> Revocation<'a>;
}

pub struct AuthRequest<'a> {
    pub method: &'a Method,
    pub path: &'a str,
    pub context: Option<&'a SessionContext>,
    pub body: &'a [u8],
    pub client_address: &'a str,
}

const MUTATION_WINDOW: Duration = Duration::from_secs(60);
const MAXIMUM_PRINCIPALS: usize = 10_000;

#[derive(Default)]
struct Windows {
    attempts: HashMap<String, VecDeque<Instant>>,
    newest: BTreeSet<(Instant, String)>,
}

pub struct MutationAdmission {
    limit: usize,
    windows: Mutex<Windows>,
}

impl MutationAdmission {
    pub fn new(limit: usize) -> Self {
        Self {
            limit,
            windows: Mutex::new(Windows::default()),
        }
    }

    fn allow(&self, owner: &str) -> bool {
        if self.limit == 0 {
            return false;
        }
        let Ok(mut windows) = self.windows.lock() else {
            return false;
        };
        let now = Instant::now();
        let expired = |at| now.saturating_duration_since(at) >= MUTATION_WINDOW;
        while windows.newest.first().is_some_and(|(at, _)| expired(*at)) {
            let (_, owner) = windows.newest.pop_first().unwrap();
            windows.attempts.remove(&owner);
        }
        if !windows.attempts.contains_key(owner) && windows.attempts.len() >= MAXIMUM_PRINCIPALS {
            return false;
        }
        let bucket = windows.attempts.entry(owner.to_owned()).or_default();
        let previous = bucket.back().copied();
        while bucket.front().is_some_and(|at| expired(*at)) {
            bucket.pop_front();
        }
        if bucket.len() >= self.limit {
            return false;
        }
        bucket.push_back(now);
        if let Some(at) = previous {
            windows.newest.remove(&(at, owner.to_owned()));
        }
        windows.newest.insert((now, owner.to_owned()));
        true
    }
}

pub async fn authorize(
    auth: &AuthService,
    config: &Config,
    method: &Method,
    path: &str,
    headers: &HeaderMap,
    client_address: &str,
    admission: &MutationAdmission,
) -> Result<SessionResolution, ApiError> {
    let mutation = !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS);
    if mutation {
        auth::verify_origin(
            config,
            headers.get("origin").and_then(|value| value.to_str().ok()),
        )?;
    }
    let cookie = auth::session_cookie(headers);
    let bootstrap = *method == Method::GET && path == "/api/auth/session";
    if bootstrap && auth.current(cookie.as_deref()).await?.is_none() {
        auth.admit_bootstrap(client_address).await?;
    }
    let resolution = if cookie.is_some() || bootstrap {
        auth.ensure_session(cookie.as_deref(), bootstrap, bootstrap)
            .await?
    } else {
        SessionResolution {
            context: None,
            cookie: None,
            replaced_invalid_cookie: false,
        }
    };
    let context = resolution.context.as_ref();
    if (cookie.is_some() && context.is_none()) || (resolution.replaced_invalid_cookie && !bootstrap)
    {
        return Err(expired());
    }
    if context.is_none() && path != "/api/health" && *method != Method::OPTIONS {
        return Err(unauthenticated());
    }
    if mutation {
        let context = context.ok_or_else(expired)?;
        if !auth.session_active(&context.session_id).await? {
            return Err(expired());
        }
        auth::verify_csrf(context, auth::csrf_header(headers))?;
    }
    if *method != Method::OPTIONS
        && !matches!(
            path,
            "/api/health" | "/api/auth/session" | "/api/auth/login" | "/api/auth/logout"
        )
        && context.is_none_or(|context| context.principal_id.is_none())
    {
        return Err(unauthenticated());
    }
    if mutation
        && !matches!(path, "/api/auth/login" | "/api/auth/logout")
        && !path.ends_with("/stop")
        && !context
            .and_then(|context| context.owner_id.as_deref())
            .is_some_and(|owner| admission.allow(owner))
    {
        return Err(ApiError::new("RATE_LIMITED", 429));
    }
    Ok(resolution)
}

pub fn install_cookies(
    response: &mut Response,
    token: &str,
    config: &Config,
) -> Result<(), ApiError> {
    let secure = if config.environment == "production" {
        "; Secure"
    } else {
        ""
    };
    let attributes = format!(
        "; HttpOnly; Max-Age={}; Path=/; SameSite=lax{secure}",
        config.session_ttl_seconds
    );
    for name in ["cirnet_session", "netcircuit_session"] {
        let value = HeaderValue::from_str(&format!("{name}={token}{attributes}"))
            .map_err(|_| internal())?;
        response.headers_mut().append(SET_COOKIE, value);
    }
    Ok(())
}

#[derive(Clone, Copy)]
enum Route<'a> {
    Session,
    Login,
    Logout,
    Claim,
    ListUsers,
    CreateUser,
    UpdateUser(&'a str),
}

pub async fn dispatch(
    auth: Arc<AuthService>,
    registry: &Registry,
    revoker: Arc<dyn SessionRevoker>,
    request: AuthRequest<'_>,
    config: &Config,
) -> Option<Result<Response, ApiError>> {
    let decoded = decode_path(request.path);
    let route = match (request.method, decoded.as_str()) {
        (&Method::GET, "/api/auth/session") => Route::Session,
        (&Method::POST, "/api/auth/login") => Route::Login,
        (&Method::POST, "/api/auth/logout") => Route::Logout,
        (&Method::POST, "/api/auth/claim-guest") => Route::Claim,
        (&Method::GET, "/api/admin/users") => Route::ListUsers,
        (&Method::POST, "/api/admin/users") => Route::CreateUser,
        (&Method::PATCH, path) => Route::UpdateUser(
            path.strip_prefix("/api/admin/users/")
                .filter(|id| !id.is_empty() && !id.contains('/'))?,
        ),
        _ => return None,
    };
    Some(
        async {
            let actor = request.context.ok_or_else(unauthenticated)?;
            match route {
                Route::Session => session_response(&auth, registry, actor),
                Route::ListUsers => {
                    let users = auth.list_users(actor).await?;
                    let users = users
                        .into_iter()
                        .map(|user| {
                            let value = serde_json::to_value(user).map_err(|_| internal())?;
                            validate_response(registry, "UserView", &value)?;
                            Ok(value)
                        })
                        .collect::<Result<Vec<_>, ApiError>>()?;
                    Ok(axum::Json(users).into_response())
                }
                Route::CreateUser => {
                    let value =
                        contract_body_profile(registry, "UserCreate", "transport", request.body)?;
                    let user = auth
                        .create_user(
                            actor,
                            field(&value, "username")?,
                            field(&value, "password")?,
                            field(&value, "role")?,
                            Some(field(&value, "display_name")?),
                        )
                        .await?;
                    user_response(registry, user, StatusCode::CREATED)
                }
                Route::UpdateUser(principal) => {
                    let value =
                        contract_body_profile(registry, "UserUpdate", "transport", request.body)?;
                    let actor = actor.clone();
                    let principal = principal.to_owned();
                    let user = with_revocation(revoker, async move {
                        let change = auth.update_user(&actor, &principal, &value).await?;
                        Ok((change.user, change.revoked_session_ids))
                    })
                    .await?;
                    user_response(registry, user, StatusCode::OK)
                }
                Route::Login | Route::Logout | Route::Claim => {
                    let (contract, operation) = match route {
                        Route::Login => ("LoginRequest", SessionOperation::Login),
                        Route::Logout => ("LogoutRequest", SessionOperation::Logout),
                        Route::Claim => ("GuestClaimRequest", SessionOperation::Claim),
                        _ => unreachable!(),
                    };
                    let body =
                        contract_body_profile(registry, contract, "transport", request.body)?;
                    let client_address = request.client_address.to_owned();
                    let actor = actor.clone();
                    let service = auth.clone();
                    let change = with_revocation(revoker, async move {
                        let mut change = match operation {
                            SessionOperation::Login => {
                                service
                                    .login(
                                        &actor,
                                        field(&body, "username")?,
                                        field(&body, "password")?,
                                        &client_address,
                                    )
                                    .await?
                            }
                            SessionOperation::Logout => service.logout(&actor).await?,
                            SessionOperation::Claim => {
                                service
                                    .claim_guest(&actor, body["confirm"].as_bool() == Some(true))
                                    .await?
                            }
                        };
                        let revoked = std::mem::take(&mut change.revoked_session_ids);
                        Ok((change, revoked))
                    })
                    .await?;
                    rotate_response(&auth, registry, change, config)
                }
            }
        }
        .await,
    )
}

enum SessionOperation {
    Login,
    Logout,
    Claim,
}

async fn with_revocation<T: Send + 'static>(
    revoker: Arc<dyn SessionRevoker>,
    operation: impl Future<Output = Result<(T, Vec<String>), ApiError>> + Send + 'static,
) -> Result<T, ApiError> {
    // A disconnected client cannot cancel durable auth work and its
    // post-commit delivery between the transaction and the HTTP response.
    tokio::spawn(async move {
        let (value, sessions) = operation.await?;
        revoker.revoke(&sessions).await?;
        Ok(value)
    })
    .await
    .map_err(|_| internal())?
}

fn session_response(
    auth: &AuthService,
    registry: &Registry,
    context: &SessionContext,
) -> Result<Response, ApiError> {
    let view = auth.view(context);
    validate_response(registry, "SessionView", &view)?;
    Ok(axum::Json(view).into_response())
}

fn rotate_response(
    auth: &AuthService,
    registry: &Registry,
    change: SessionChange,
    config: &Config,
) -> Result<Response, ApiError> {
    let mut response = session_response(auth, registry, &change.context)?;
    install_cookies(&mut response, &change.cookie, config)?;
    Ok(response)
}

fn user_response(
    registry: &Registry,
    user: auth::UserView,
    status: StatusCode,
) -> Result<Response, ApiError> {
    let value = serde_json::to_value(user).map_err(|_| internal())?;
    validate_response(registry, "UserView", &value)?;
    Ok((status, axum::Json(value)).into_response())
}

fn validate_response(registry: &Registry, contract: &str, body: &Value) -> Result<(), ApiError> {
    registry
        .validate(contract, "transport", body)
        .map(|_| ())
        .map_err(|_| internal())
}

fn field<'a>(body: &'a Value, name: &str) -> Result<&'a str, ApiError> {
    body.get(name).and_then(Value::as_str).ok_or_else(internal)
}

fn internal() -> ApiError {
    ApiError::new("INTERNAL_ERROR", 500)
}
fn expired() -> ApiError {
    ApiError::new("SESSION_EXPIRED", 401)
}
fn unauthenticated() -> ApiError {
    ApiError::new("UNAUTHENTICATED", 401)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::{Notify, oneshot};

    #[derive(Default)]
    struct RecordedRevoker {
        called: Notify,
        ids: Mutex<Vec<String>>,
    }

    impl SessionRevoker for RecordedRevoker {
        fn revoke<'a>(&'a self, sessions: &'a [String]) -> Revocation<'a> {
            Box::pin(async move {
                self.ids.lock().unwrap().extend_from_slice(sessions);
                self.called.notify_one();
                Ok(())
            })
        }
    }

    #[tokio::test]
    async fn revocation_runs_when_the_http_response_is_abandoned() {
        let revoker = Arc::new(RecordedRevoker::default());
        let (began, began_signal) = oneshot::channel();
        let (finish, finish_signal) = oneshot::channel();
        let handler = tokio::spawn(with_revocation(revoker.clone(), async move {
            began.send(()).unwrap();
            finish_signal.await.unwrap();
            Ok(((), vec!["revoked-session".to_owned()]))
        }));
        began_signal.await.unwrap();
        handler.abort();
        finish.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(2), revoker.called.notified())
            .await
            .unwrap();
        assert_eq!(*revoker.ids.lock().unwrap(), ["revoked-session"]);
    }
}
