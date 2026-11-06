use crate::{
    auth::{self, SessionContext},
    config::Config,
    db::{Db, ProjectRow},
    error::ApiError,
    hardware::HardwareClient,
    http_auth::{self, MutationAdmission, SessionRevoker},
    preview::{self, GraphVersion},
};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{ConnectInfo, Request, State},
    response::{IntoResponse, Response},
};
use base64::{
    Engine,
    engine::{
        DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig, general_purpose::URL_SAFE_NO_PAD,
    },
};
use cirnet_contracts_native::validation::Registry;
use http::{HeaderMap, HeaderValue, Method, StatusCode};
use serde_json::{Value, json};
use std::{net::SocketAddr, sync::Arc, time::Duration};

pub struct WritableAuth {
    service: Arc<auth::AuthService>,
    admission: MutationAdmission,
    revoker: Arc<dyn SessionRevoker>,
}

impl WritableAuth {
    pub fn new(
        service: Arc<auth::AuthService>,
        revoker: Arc<dyn SessionRevoker>,
        config: &Config,
    ) -> Self {
        Self {
            service,
            admission: MutationAdmission::new(config.mutation_limit),
            revoker,
        }
    }
}

pub struct AppState {
    pub config: Config,
    pub db: Db,
    pub registry: Arc<Registry>,
    pub projects: Option<crate::projects::ProjectService>,
    pub assignments: Option<crate::assignments::AssignmentService>,
    pub hardware: HardwareClient,
    pub openapi: Option<Arc<Vec<u8>>>,
    pub routes: Option<crate::openapi::Routes>,
    pub stations: Option<crate::stations::StationService>,
    pub manager: Option<Arc<crate::experiments::ExperimentManager>>,
    pub websocket: Option<crate::websocket::WebSocketState>,
    pub writable_auth: Option<WritableAuth>,
}
pub fn router(state: Arc<AppState>) -> Router {
    let websocket = state.websocket.clone();
    let router = Router::new().fallback(handle).with_state(state);
    if let Some(websocket) = websocket {
        router.merge(crate::websocket::router(websocket))
    } else {
        router
    }
}
pub const IMPLEMENTED_OPERATIONS: &[&str] = &[
    "getHealth",
    "listProjects",
    "getProject",
    "validateCircuit",
    "previewCircuit",
    "validateCircuitV2",
    "previewCircuitV2",
    "createProject",
    "updateProject",
    "deleteProject",
    "listCircuits",
    "createCircuit",
    "getCircuit",
    "saveCircuit",
    "deleteCircuit",
    "listCircuitsV2",
    "createCircuitV2",
    "getCircuitV2",
    "saveCircuitV2",
    "listAssignments",
    "createAssignment",
    "getAssignment",
    "publishAssignment",
    "listAssignmentDocuments",
    "createAssignmentDocument",
    "getAssignmentDocument",
    "saveAssignmentDocument",
    "publishAssignmentDocument",
    "listAssignmentsV2",
    "getAssignmentV2",
    "listAssignmentDocumentsV2",
    "createAssignmentDocumentV2",
    "getAssignmentDocumentV2",
    "saveAssignmentDocumentV2",
    "publishAssignmentDocumentV2",
    "getSession",
    "login",
    "logout",
    "claimGuest",
    "listUsers",
    "createUser",
    "updateUser",
    "createExperiment",
    "listExperiments",
    "listExperimentHistory",
    "listActiveExperiments",
    "getExperiment",
    "runExperiment",
    "stopExperiment",
    "getExperimentResults",
    "getExperimentDocumentReference",
    "configureExperimentInstrument",
    "getExperimentInstrumentAccess",
    "configureExperimentGenerator",
    "getExperimentInstrumentCommand",
    "createExperimentV2",
    "getExperimentDocumentReferenceV2",
    "getOperation",
    "getCapturePayload",
    "deleteCapturePayload",
    "listStations",
    "getStationCapabilities",
    "getStationQueue",
];

fn request_id(headers: &HeaderMap) -> String {
    headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 128
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
        })
        .map(str::to_owned)
        .unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string())
}
fn message(code: &str) -> String {
    match code {
        "FORBIDDEN" => "This resource is not available to the current principal.",
        "NOT_FOUND" => "The requested resource was not found.",
        "INVALID_STATE" => "The operation is not allowed in the current state.",
        "IDEMPOTENCY_CONFLICT" => "This operation key was already used with a different request.",
        "REVISION_CONFLICT" => "This document has a newer server revision. Keep your changes, reload or save a separate copy.",
        "UNAUTHENTICATED" => "Sign in to access this resource.",
        "INVALID_CREDENTIALS" => "The username or password is incorrect.",
        "CSRF_REJECTED" => "Refresh the current session before submitting this request.",
        "ORIGIN_REJECTED" => "This origin is not permitted to access the application.",
        "REQUEST_VALIDATION_ERROR" => "The request does not match the API contract.",
        "INVALID_CONTRACT" => "The request contains invalid contract data.",
        "RATE_LIMITED" => "Too many requests; retry after the admission interval.",
        "QUEUE_FULL" => "The execution queue is full.",
        "INTERNAL_ERROR" => "The application could not complete the request.",
        _ => return format!("The operation could not be completed: {}.", code.replace('_', " ").to_lowercase()),
    }.into()
}
fn error(error: ApiError, id: &str, headers: &HeaderMap) -> Response {
    let status = StatusCode::from_u16(error.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    let body = error.body.unwrap_or_else(|| {
        let mut value = json!({"code":error.code,"message":if error.message == error.code {message(&error.code)} else {error.message},"request_id":id});
        if !error.issues.is_empty() { value["issues"] = json!(error.issues); }
        if let Some(revision) = error.current_revision { value["current_revision"] = json!(revision); }
        if let Some(key) = headers.get("idempotency-key").and_then(|v| v.to_str().ok())
            .filter(|s| !s.is_empty() && s.len() <= 128 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))) {
            value["operation_key"] = json!(key);
        }
        value
    });
    (status, axum::Json(body)).into_response()
}
fn budget_error(code: &str) -> ApiError {
    ApiError::new(code, 400).with_message(
        if matches!(code, "REQUEST_TOO_LARGE" | "REQUEST_COMPLEXITY_EXCEEDED") {
            "The request exceeds the supported input budget."
        } else {
            "The request framing is invalid."
        },
    )
}
pub(crate) fn json_complexity(body: &[u8], max_depth: usize, max_tokens: usize) -> bool {
    let (mut depth, mut tokens, mut quoted, mut escaped) = (0isize, 0usize, false, false);
    for byte in body {
        if quoted {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                quoted = false;
            }
            continue;
        }
        match byte {
            b'"' => {
                quoted = true;
                tokens += 1;
            }
            b'{' | b'[' => {
                depth += 1;
                tokens += 1;
            }
            b'}' | b']' => depth -= 1,
            b',' | b':' => tokens += 1,
            _ => {}
        }
        if depth > max_depth as isize || tokens > max_tokens {
            return false;
        }
    }
    true
}
async fn body_bytes(request: &mut Request, config: &Config) -> Result<Vec<u8>, ApiError> {
    let maximum =
        if crate::http_projects::decode_path(request.uri().path()).starts_with("/api/auth/") {
            config.auth_request_max_bytes
        } else {
            config.request_max_bytes
        };
    if let Some(raw) = request.headers().get("content-length") {
        let raw = raw
            .to_str()
            .map_err(|_| budget_error("INVALID_REQUEST_FRAMING"))?;
        if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
            return Err(budget_error("INVALID_REQUEST_FRAMING"));
        }
        let normalized = raw.trim_start_matches('0');
        let ceiling = maximum.to_string();
        if normalized.len() > ceiling.len()
            || (normalized.len() == ceiling.len() && normalized > ceiling.as_str())
        {
            return Err(budget_error("REQUEST_TOO_LARGE"));
        }
    }
    let body = std::mem::replace(request.body_mut(), Body::empty());
    let bytes = tokio::time::timeout(
        Duration::from_secs_f64(config.request_body_seconds),
        to_bytes(body, maximum),
    )
    .await
    .map_err(|_| budget_error("REQUEST_TIMEOUT"))?
    .map_err(|_| budget_error("REQUEST_TOO_LARGE"))?;
    let json_content = request
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_none_or(|value| value.to_lowercase().contains("json"));
    if !bytes.is_empty() && json_content {
        if bytes.contains(&0) || std::str::from_utf8(&bytes).is_err() {
            return Err(budget_error("INVALID_REQUEST_FRAMING"));
        }
        if !json_complexity(
            &bytes,
            config.request_json_max_depth,
            config.request_json_max_tokens,
        ) {
            return Err(budget_error("REQUEST_COMPLEXITY_EXCEEDED"));
        }
    }
    Ok(bytes.to_vec())
}
async fn authorize(
    method: &Method,
    uri: &http::Uri,
    headers: &HeaderMap,
    state: &AppState,
) -> Result<Option<SessionContext>, ApiError> {
    let path = crate::http_projects::decode_path(uri.path());
    let mutation = !matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS);
    let origin = headers.get("origin").and_then(|v| v.to_str().ok());
    if mutation {
        auth::verify_origin(&state.config, origin)?;
    }
    let cookie = auth::session_cookie(headers);
    let context = auth::current(&state.db, cookie.as_deref(), &state.config).await?;
    if cookie.is_some() && context.is_none() {
        return Err(ApiError::new("SESSION_EXPIRED", 401));
    }
    if context.is_none() && path != "/api/health" && method != Method::OPTIONS {
        return Err(ApiError::new("UNAUTHENTICATED", 401));
    }
    if mutation {
        let context = context
            .as_ref()
            .ok_or_else(|| ApiError::new("SESSION_EXPIRED", 401))?;
        if auth::current(&state.db, cookie.as_deref(), &state.config)
            .await?
            .is_none()
        {
            return Err(ApiError::new("SESSION_EXPIRED", 401));
        }
        auth::verify_csrf(context, auth::csrf_header(headers))?;
    }
    if path != "/api/health"
        && method != Method::OPTIONS
        && context
            .as_ref()
            .is_none_or(|context| context.principal_id.is_none())
    {
        return Err(ApiError::new("UNAUTHENTICATED", 401));
    }
    Ok(context)
}
fn query_error(name: &str, code: &str) -> ApiError {
    ApiError::new("REQUEST_VALIDATION_ERROR", 422).with_issues(vec![json!({
        "code":code,"path":format!("/query/{name}"),"severity":"error","profile":"http-request",
        "message":"The request field does not match its declared contract."
    })])
}
pub(crate) fn page_query(query: Option<&str>) -> Result<(i64, Option<String>), ApiError> {
    let query: std::collections::HashMap<String, String> =
        url::form_urlencoded::parse(query.unwrap_or_default().as_bytes())
            .into_owned()
            .collect();
    let limit = crate::query::bounded_int(
        query.get("limit").map(String::as_str).unwrap_or("50"),
        "limit",
        1,
        100,
    )?;
    let cursor = query.get("cursor").cloned();
    if cursor
        .as_ref()
        .is_some_and(|cursor| cursor.chars().count() > 256)
    {
        return Err(query_error("cursor", "string_too_long"));
    }
    Ok((limit, cursor))
}
pub(crate) fn page(query: Option<&str>, kind: &str, scope: &str) -> Result<(i64, i64), ApiError> {
    let (limit, cursor) = page_query(query)?;
    let Some(cursor) = cursor else {
        return Ok((limit, 0));
    };
    let fail = || ApiError::new("INVALID_CURSOR", 422);
    let engine = GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
    );
    let decoded = engine
        .decode(cursor.replace('-', "+").replace('_', "/"))
        .map_err(|_| fail())?;
    let value: Value = serde_json::from_slice(&decoded).map_err(|_| fail())?;
    let object = value.as_object().ok_or_else(fail)?;
    let version_one =
        value["version"].as_f64() == Some(1.0) || value["version"].as_bool() == Some(true);
    if object.len() != 4 || !version_one || value["kind"] != kind || value["scope"] != scope {
        return Err(fail());
    }
    let after = value["after"]
        .as_i64()
        .filter(|value| (0..=9_007_199_254_740_991).contains(value))
        .ok_or_else(fail)?;
    Ok((limit, after))
}
pub(crate) fn next_cursor(sequence: i64, kind: &str, scope: &str) -> String {
    URL_SAFE_NO_PAD.encode(
        serde_json::to_vec(&json!({"version":1,"kind":kind,"scope":scope,"after":sequence}))
            .unwrap(),
    )
}
fn project(row: &ProjectRow) -> Value {
    json!({"schema_version":"1.0","project_id":row.project_id,"owner_id":row.owner_id,
        "name":row.name,"description":row.description,"revision":row.revision,
        "created_at":row.created_at,"updated_at":row.updated_at,"access_scope":"private"})
}
async fn dispatch(
    method: &Method,
    uri: &http::Uri,
    state: &AppState,
    context: Option<&SessionContext>,
    body: &[u8],
    headers: &HeaderMap,
    id: &str,
) -> Result<Response, ApiError> {
    let decoded = crate::http_projects::decode_path(uri.path());
    let path = decoded.as_str();
    if method == Method::GET && path == "/openapi.json" {
        let bytes = state
            .openapi
            .as_ref()
            .ok_or_else(|| ApiError::new("UNAVAILABLE", 503))?;
        return Ok((
            [(http::header::CONTENT_TYPE, "application/json")],
            bytes.as_ref().clone(),
        )
            .into_response());
    }
    if let Some(context) = context
        && let Some(stations) = &state.stations
    {
        let manager = state.manager.clone();
        if let Some(result) = crate::http_stations::dispatch(
            method,
            uri.path(),
            stations,
            context.owner_id.as_deref().unwrap_or_default(),
            move |station| async move {
                manager
                    .ok_or_else(|| ApiError::new("UNAVAILABLE", 503))?
                    .queue(&station)
                    .await
            },
        )
        .await
        {
            return result;
        }
    }
    if method == Method::GET && path == "/api/health" {
        return Ok(axum::Json(json!({"status":"ok","service":"cirnet-api","hardware_mode":state.config.hardware_mode})).into_response());
    }
    if let Some(context) = context
        && let Some(result) =
            crate::http_projects::dispatch(method, uri, state, context, body).await
    {
        return result;
    }
    if let Some(context) = context
        && let Some(result) =
            crate::http_assignments::dispatch(method, uri, state, context, body).await
    {
        return result;
    }
    if let Some(context) = context
        && let Some(result) =
            crate::http_experiments::dispatch(method, uri, headers, state, context, body, id).await
    {
        return result;
    }
    let owner = context
        .and_then(|context| context.owner_id.as_deref())
        .unwrap_or_default();
    if method == Method::GET && path == "/api/projects" {
        let (limit, after) = page(uri.query(), "projects", "")?;
        let rows = state
            .db
            .list_projects(owner, after, limit + 1)
            .await
            .map_err(|_| ApiError::new("UNAVAILABLE", 503))?;
        let next = if rows.len() > limit as usize {
            Some(next_cursor(
                rows[limit as usize - 1].sequence,
                "projects",
                "",
            ))
        } else {
            None
        };
        return Ok(axum::Json(json!({"schema_version":"1.0","items":rows.iter().take(limit as usize).map(project).collect::<Vec<_>>(),"next_cursor":next})).into_response());
    }
    if method == Method::GET
        && let Some(identity) = path.strip_prefix("/api/projects/")
        && !identity.contains('/')
    {
        let row = state
            .db
            .project_by_id(identity)
            .await
            .map_err(|_| ApiError::new("UNAVAILABLE", 503))?
            .filter(|row| !row.deleted)
            .ok_or_else(|| ApiError::new("NOT_FOUND", 404))?;
        if row.owner_id != owner {
            return Err(ApiError::new("FORBIDDEN", 403));
        }
        let mut response = axum::Json(project(&row)).into_response();
        response
            .headers_mut()
            .insert("etag", format!("\"{}\"", row.revision).parse().unwrap());
        return Ok(response);
    }
    if method == Method::POST {
        let operation = match path {
            "/api/circuits/validate" => Some((GraphVersion::V1, false)),
            "/api/circuits/physical-preview" => Some((GraphVersion::V1, true)),
            "/api/v2/circuits/validate" => Some((GraphVersion::V2, false)),
            "/api/v2/circuits/physical-preview" => Some((GraphVersion::V2, true)),
            _ => None,
        };
        if let Some((version, physical)) = operation {
            let graph = if body.is_empty() {
                Value::Null
            } else if crate::http_body::is_json_media_type(headers.get(http::header::CONTENT_TYPE))
            {
                crate::http_body::decode(body, "structural")?
            } else {
                return Err(preview::raw_graph_error(&state.registry, body, version));
            };
            let result = if physical {
                preview::physical_preview(&state.registry, &state.hardware, &graph, version).await?
            } else {
                preview::validate_graph(&state.registry, &graph, version)?
            };
            return Ok(axum::Json(result).into_response());
        }
    }
    Err(ApiError::new("NOT_FOUND", 404))
}
const CORS_METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const CORS_HEADERS: &[&str] = &[
    "Accept",
    "Accept-Language",
    "Content-Language",
    "Content-Type",
    "Idempotency-Key",
    "If-Match",
    "X-CIRNET-CSRF",
    "X-CSRF-Token",
    "X-Control-Client",
    "X-Request-ID",
];

fn cors_preflight(method: &Method, headers: &HeaderMap, config: &Config) -> Option<Response> {
    if *method != Method::OPTIONS || config.trusted_origins.is_empty() {
        return None;
    }
    let origin = headers.get("origin")?;
    let requested_method = headers.get("access-control-request-method")?;
    let allowed_origin = origin
        .to_str()
        .is_ok_and(|origin| config.trusted_origins.iter().any(|value| value == origin));
    let mut rejected = Vec::new();
    if !allowed_origin {
        rejected.push("origin");
    }
    if !requested_method
        .to_str()
        .is_ok_and(|method| CORS_METHODS.contains(&method))
    {
        rejected.push("method");
    }
    if headers
        .get("access-control-request-headers")
        .is_some_and(|headers| {
            !headers.to_str().is_ok_and(|headers| {
                headers.split(',').all(|name| {
                    CORS_HEADERS
                        .iter()
                        .any(|allowed| allowed.eq_ignore_ascii_case(name.trim()))
                })
            })
        })
    {
        rejected.push("headers");
    }
    if headers.contains_key("access-control-request-private-network") {
        rejected.push("private-network");
    }
    let mut response = if rejected.is_empty() {
        "OK".into_response()
    } else {
        (
            StatusCode::BAD_REQUEST,
            format!("Disallowed CORS {}", rejected.join(", ")),
        )
            .into_response()
    };
    let response_headers = response.headers_mut();
    response_headers.insert("vary", HeaderValue::from_static(
        "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network",
    ));
    response_headers.insert(
        "access-control-allow-methods",
        CORS_METHODS.join(", ").parse().unwrap(),
    );
    response_headers.insert(
        "access-control-allow-headers",
        CORS_HEADERS.join(", ").parse().unwrap(),
    );
    response_headers.insert("access-control-max-age", HeaderValue::from_static("600"));
    response_headers.insert(
        "access-control-allow-credentials",
        HeaderValue::from_static("true"),
    );
    if allowed_origin {
        response_headers.insert("access-control-allow-origin", origin.clone());
    }
    Some(response)
}

fn cors_simple(response: &mut Response, request: &HeaderMap, config: &Config) {
    if config.trusted_origins.is_empty() {
        return;
    }
    let headers = response.headers_mut();
    headers.append("vary", HeaderValue::from_static("Origin"));
    if let Some(origin) = request.get("origin") {
        headers.insert(
            "access-control-allow-credentials",
            HeaderValue::from_static("true"),
        );
        headers.insert(
            "access-control-expose-headers",
            HeaderValue::from_static("ETag, X-Request-ID"),
        );
        if origin
            .to_str()
            .is_ok_and(|origin| config.trusted_origins.iter().any(|value| value == origin))
        {
            headers.insert("access-control-allow-origin", origin.clone());
        }
    }
}

async fn handle(State(state): State<Arc<AppState>>, mut request: Request) -> Response {
    let headers = request.headers().clone();
    let method = request.method().clone();
    if let Some(response) = cors_preflight(&method, &headers, &state.config) {
        return response;
    }
    let id = request_id(&headers);
    let uri = request.uri().clone();
    let path = crate::http_projects::decode_path(uri.path());
    let is_api = path.starts_with("/api/");
    let client_address = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip().to_string())
        .unwrap_or_default();
    let mut bootstrap_cookie = None;
    let result = async {
        let body = if is_api {
            body_bytes(&mut request, &state.config).await?
        } else {
            Vec::new()
        };
        let context = if !is_api {
            None
        } else if let Some(writable) = &state.writable_auth {
            let resolution = http_auth::authorize(
                &writable.service,
                &state.config,
                &method,
                &path,
                &headers,
                &client_address,
                &writable.admission,
            )
            .await?;
            bootstrap_cookie = resolution.cookie;
            resolution.context
        } else {
            authorize(&method, &uri, &headers, &state).await?
        };
        if is_api && let Some(routes) = &state.routes {
            use crate::openapi::Boundary;
            match routes.resolve(&path, method.as_str()) {
                Boundary::Matched { body_profile } => {
                    let any_graph = matches!(
                        path.as_str(),
                        "/api/circuits/validate"
                            | "/api/circuits/physical-preview"
                            | "/api/v2/circuits/validate"
                            | "/api/v2/circuits/physical-preview"
                    );
                    if !any_graph
                        && !body.is_empty()
                        && let Some(profile) = body_profile
                        && !crate::http_body::is_json_media_type(
                            headers.get(http::header::CONTENT_TYPE),
                        )
                    {
                        return Err(crate::http_body::media_type_error(profile));
                    }
                }
                Boundary::MethodNotAllowed => return Err(ApiError::new("METHOD_NOT_ALLOWED", 405)),
                Boundary::NotFound => return Err(ApiError::new("NOT_FOUND", 404)),
                Boundary::Redirect(path) => {
                    let location = crate::openapi::redirect_location(&path, &uri, &headers)?;
                    return Ok((
                        StatusCode::TEMPORARY_REDIRECT,
                        [(http::header::LOCATION, location)],
                        "",
                    )
                        .into_response());
                }
            }
        }
        if let Some(writable) = &state.writable_auth
            && let Some(response) = http_auth::dispatch(
                writable.service.clone(),
                &state.registry,
                writable.revoker.clone(),
                http_auth::AuthRequest {
                    method: &method,
                    path: uri.path(),
                    context: context.as_ref(),
                    body: &body,
                    client_address: &client_address,
                },
                &state.config,
            )
            .await
        {
            return response;
        }
        dispatch(
            &method,
            &uri,
            &state,
            context.as_ref(),
            &body,
            &headers,
            &id,
        )
        .await
    }
    .await;
    let mut response = result.unwrap_or_else(|failure| error(failure, &id, &headers));
    if let Some(token) = bootstrap_cookie
        && let Err(failure) = http_auth::install_cookies(&mut response, &token, &state.config)
    {
        response = error(failure, &id, &headers);
    }
    response
        .headers_mut()
        .insert("x-request-id", id.parse().unwrap());
    if is_api {
        response
            .headers_mut()
            .insert("cache-control", HeaderValue::from_static("no-store"));
    }
    cors_simple(&mut response, &headers, &state.config);
    response
}
#[cfg(test)]
#[path = "../tests/http_boundary.rs"]
mod tests;
