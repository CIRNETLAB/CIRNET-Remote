//! Public command routes delegate all authority and durable state to the manager.
use crate::{
    auth::SessionContext,
    error::ApiError,
    http_api::AppState,
    http_projects::{contract_body_profile, decode_path},
    stop_probe::{Phase, mark_stop_phase},
};
use axum::{
    body::Body,
    response::{IntoResponse, Response},
};
use http::{HeaderMap, HeaderValue, Method, StatusCode};
use serde_json::json;

fn field_error(location: &str, name: &str, code: &str) -> ApiError {
    ApiError::new("REQUEST_VALIDATION_ERROR", 422).with_issues(vec![json!({
  "code":code,"path":format!("/{location}/{name}"),"severity":"error","profile":"http-request",
  "message":"The request field does not match its declared contract."})])
}
fn header<'a>(
    headers: &'a HeaderMap,
    name: &str,
    required: bool,
    pattern: bool,
) -> Result<Option<&'a str>, ApiError> {
    let Some(value) = headers.get(name) else {
        return if required {
            Err(field_error("header", name, "missing"))
        } else {
            Ok(None)
        };
    };
    let value = value
        .to_str()
        .map_err(|_| field_error("header", name, "string_pattern_mismatch"))?;
    let length = value.chars().count();
    if length < 1 {
        return Err(field_error("header", name, "string_too_short"));
    }
    if length > 128 {
        return Err(field_error("header", name, "string_too_long"));
    }
    if pattern
        && !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.:-".contains(&b))
    {
        return Err(field_error("header", name, "string_pattern_mismatch"));
    }
    Ok(Some(value))
}
fn query(uri: &http::Uri) -> std::collections::HashMap<String, String> {
    url::form_urlencoded::parse(uri.query().unwrap_or_default().as_bytes())
        .into_owned()
        .collect()
}
fn history_query(uri: &http::Uri, active: bool) -> Result<(usize, Option<String>), ApiError> {
    let query = query(uri);
    let limit = if active {
        100
    } else {
        let raw = query.get("limit").map(String::as_str).unwrap_or("50");
        crate::query::bounded_int(raw, "limit", 1, 100)? as usize
    };
    let cursor = query.get("cursor").cloned();
    if let Some(cursor) = &cursor {
        if cursor.is_empty() {
            return Err(field_error("query", "cursor", "string_too_short"));
        }
        if cursor.chars().count() > 1024 {
            return Err(field_error("query", "cursor", "string_too_long"));
        }
    }
    Ok((limit, cursor))
}
pub async fn dispatch(
    method: &Method,
    uri: &http::Uri,
    headers: &HeaderMap,
    state: &AppState,
    context: &SessionContext,
    body: &[u8],
    request_id: &str,
) -> Option<Result<Response, ApiError>> {
    let decoded = decode_path(uri.path());
    let (v2, route) = if let Some(route) = decoded.strip_prefix("/api/v2/") {
        (true, route)
    } else if let Some(route) = decoded.strip_prefix("/api/") {
        (false, route)
    } else {
        return None;
    };
    let parts: Vec<_> = route.split('/').collect();
    let operation = match parts.as_slice() {
        ["experiments"] if *method == Method::POST => "create",
        ["experiments"] if !v2 && *method == Method::GET => "list",
        ["experiments", "history"] if !v2 && *method == Method::GET => "history",
        ["experiments", "active"] if !v2 && *method == Method::GET => "active",
        ["experiments", _] if !v2 && *method == Method::GET => "get",
        ["experiments", _, "results"] if !v2 && *method == Method::GET => "get",
        ["experiments", _, "run"] if !v2 && *method == Method::POST => "run",
        ["experiments", _, "stop"] if !v2 && *method == Method::POST => "stop",
        ["experiments", _, "document-reference"] if *method == Method::GET => "document",
        ["experiments", _, "instruments"] if !v2 && *method == Method::POST => "instrument",
        ["experiments", _, "instruments", "access"] if !v2 && *method == Method::GET => "access",
        ["experiments", _, "instruments", "generator"] if !v2 && *method == Method::POST => {
            "generator"
        }
        ["experiments", _, "instruments", "commands", _] if !v2 && *method == Method::GET => {
            "command"
        }
        ["operations", _] if !v2 && *method == Method::GET => "operation",
        ["captures", _, "payload"] if !v2 && *method == Method::GET => "capture",
        ["captures", _, "payload"] if !v2 && *method == Method::DELETE => "delete_capture",
        _ => return None,
    };
    Some(
        async {
            let manager = state
                .manager
                .as_ref()
                .ok_or_else(|| ApiError::new("UNAVAILABLE", 503))?;
            let owner = context
                .owner_id
                .as_deref()
                .ok_or_else(|| ApiError::new("UNAUTHENTICATED", 401))?;
            let value = match operation {
                "create" => {
                    let body = contract_body_profile(
                        &state.registry,
                        if v2 {
                            "ExperimentCreateV2"
                        } else {
                            "ExperimentCreate"
                        },
                        if v2 { "structural" } else { "transport" },
                        body,
                    )?;
                    let key = header(headers, "Idempotency-Key", false, false)?;
                    manager
                        .create(context, &body, key, Some(request_id), v2)
                        .await?
                }
                "list" => manager.list(owner).await?,
                "history" | "active" => {
                    let (limit, cursor) = history_query(uri, operation == "active")?;
                    manager
                        .history(owner, limit, cursor.as_deref(), operation == "active")
                        .await?
                }
                "get" => manager.get(owner, parts[1]).await?,
                "run" => {
                    let client = header(headers, "X-Control-Client", true, true)?;
                    let key = header(headers, "Idempotency-Key", false, false)?;
                    manager
                        .run(context, parts[1], key, client, Some(request_id))
                        .await?
                }
                "stop" => {
                    let key = header(headers, "Idempotency-Key", false, false)?;
                    let phases = key.and_then(|_| manager.stop_phase_trace(parts[1]));
                    let value = manager
                        .stop_observed(context, parts[1], key, Some(request_id), phases.clone())
                        .await?;
                    let response = (StatusCode::OK, axum::Json(value)).into_response();
                    mark_stop_phase(phases.as_ref(), Phase::ResponseConstructed);
                    return Ok(response);
                }
                "document" => {
                    let mut value = manager.document_reference(owner, parts[1]).await?;
                    if !v2 && value["graph_schema_version"] == "1.2" {
                        return Err(ApiError::new("UNSUPPORTED_DOCUMENT_VERSION", 422));
                    }
                    if v2 {
                        value["schema_version"] = json!("2.0");
                    }
                    value
                }
                "access" => {
                    manager
                        .instrument_access(
                            context,
                            parts[1],
                            header(headers, "X-Control-Client", false, true)?,
                        )
                        .await?
                }
                "instrument" => {
                    let body = contract_body_profile(
                        &state.registry,
                        "InstrumentConfigureRequest",
                        "transport",
                        body,
                    )?;
                    let client =
                        header(headers, "X-Control-Client", true, true)?.expect("required header");
                    manager
                        .configure_instrument(context, parts[1], &body, client)
                        .await?
                }
                "generator" => {
                    let body = contract_body_profile(
                        &state.registry,
                        "InstrumentGeneratorCommand",
                        "transport",
                        body,
                    )?;
                    let client =
                        header(headers, "X-Control-Client", true, true)?.expect("required header");
                    let key =
                        header(headers, "Idempotency-Key", true, true)?.expect("required header");
                    manager
                        .configure_generator(context, parts[1], &body["configuration"], client, key)
                        .await?
                }
                "command" => manager.generator_command(owner, parts[1], parts[4]).await?,
                "operation" => {
                    let query = query(uri);
                    let kind = query.get("kind").map(String::as_str).unwrap_or("create");
                    if !matches!(kind, "create" | "run" | "stop") {
                        return Err(field_error("query", "kind", "literal_error"));
                    }
                    manager
                        .operation(
                            owner,
                            kind,
                            query.get("experiment_id").map(String::as_str),
                            parts[1],
                        )
                        .await?
                }
                "capture" => {
                    let bytes = manager.capture_payload(context, parts[1]).await?;
                    let accept = headers
                        .get("accept")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("");
                    let media = if !accept.contains("application/vnd.cirnet.capture")
                        && accept.contains("application/vnd.netcircuit.capture")
                    {
                        "application/vnd.netcircuit.capture; version=1"
                    } else {
                        "application/vnd.cirnet.capture; version=1"
                    };
                    let mut response = Response::new(Body::from(bytes));
                    response
                        .headers_mut()
                        .insert("content-type", HeaderValue::from_static(media));
                    response.headers_mut().insert(
                        "cache-control",
                        HeaderValue::from_static("private, no-store"),
                    );
                    response.headers_mut().insert(
                        "x-content-type-options",
                        HeaderValue::from_static("nosniff"),
                    );
                    return Ok(response);
                }
                "delete_capture" => manager.delete_capture(context, parts[1]).await?,
                _ => unreachable!(),
            };
            Ok((
                if operation == "create" {
                    StatusCode::CREATED
                } else {
                    StatusCode::OK
                },
                axum::Json(value),
            )
                .into_response())
        }
        .await,
    )
}
