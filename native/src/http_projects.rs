//! HTTP document routes. Write mode is explicit; reads also work on snapshots.
use crate::{auth::SessionContext, error::ApiError, http_api::AppState, projects};
use axum::response::{IntoResponse, Response};
use cirnet_contracts_native::validation::{Registry, ValidationError};
use http::{Method, StatusCode};
use serde_json::{Value, json};

pub fn decode_path(path: &str) -> String {
    let bytes = path.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%' && at + 2 < bytes.len() {
            let digit = |b: u8| char::from(b).to_digit(16);
            if let (Some(a), Some(b)) = (digit(bytes[at + 1]), digit(bytes[at + 2])) {
                output.push((a * 16 + b) as u8);
                at += 3;
                continue;
            }
        }
        output.push(bytes[at]);
        at += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}
fn missing_body() -> ApiError {
    ApiError::new("REQUEST_VALIDATION_ERROR", 422).with_issues(vec![json!({
  "code":"missing","path":"/body","severity":"error","profile":"http-request",
  "message":"The request field does not match its declared contract."})])
}
pub fn contract_body(registry: &Registry, name: &str, body: &[u8]) -> Result<Value, ApiError> {
    contract_body_profile(registry, name, "structural", body)
}
pub fn contract_body_profile(
    registry: &Registry,
    name: &str,
    profile: &str,
    body: &[u8],
) -> Result<Value, ApiError> {
    if body.is_empty() {
        return Err(missing_body());
    }
    let value: Value = crate::http_body::decode(body, profile)?;
    if value.is_null() {
        return Err(missing_body());
    }
    registry
        .validate(name, profile, &value)
        .map_err(|error| match error {
            ValidationError::Invalid(issue) => {
                let mut issue =
                    crate::http_body::schema_first_error(registry, name, profile, &value, issue);
                issue.path = format!("/body{}", issue.path);
                issue.message = "The request field does not match its declared contract.".into();
                ApiError::new("REQUEST_VALIDATION_ERROR", 422)
                    .with_issues(vec![serde_json::to_value(issue).unwrap()])
            }
            _ => ApiError::new("INTERNAL_ERROR", 500),
        })
}
fn error(mut error: ApiError) -> ApiError {
    if matches!(
        error.code.as_str(),
        "PROJECT_NOT_FOUND" | "DOCUMENT_NOT_FOUND" | "REVISION_NOT_FOUND"
    ) {
        error.code = "NOT_FOUND".into();
        error.message = error.code.clone();
    }
    error
}
fn response(value: Value, status: StatusCode, etag: bool) -> Response {
    let revision = value.get("revision").and_then(Value::as_i64);
    let mut response = (status, axum::Json(value)).into_response();
    if etag && let Some(revision) = revision {
        response
            .headers_mut()
            .insert("etag", format!("\"{revision}\"").parse().unwrap());
    }
    response
}
async fn owned_project(
    state: &AppState,
    id: &str,
    owner: &str,
) -> Result<crate::db::ProjectRow, ApiError> {
    let row = state
        .db
        .project_by_id(id)
        .await
        .map_err(|_| ApiError::new("UNAVAILABLE", 503))?
        .filter(|row| !row.deleted)
        .ok_or_else(|| ApiError::new("NOT_FOUND", 404))?;
    if row.owner_id != owner {
        return Err(ApiError::new("FORBIDDEN", 403));
    }
    Ok(row)
}
fn write_service(state: &AppState) -> Result<&projects::ProjectService, ApiError> {
    state
        .projects
        .as_ref()
        .ok_or_else(|| ApiError::new("UNAVAILABLE", 503))
}
pub async fn dispatch(
    method: &Method,
    uri: &http::Uri,
    state: &AppState,
    context: &SessionContext,
    body: &[u8],
) -> Option<Result<Response, ApiError>> {
    let decoded = decode_path(uri.path());
    let path = decoded.as_str();
    let owner = context.owner_id.as_deref().unwrap_or_default();
    let (v2, route) = if let Some(route) = path.strip_prefix("/api/v2/") {
        (true, route)
    } else if let Some(route) = path.strip_prefix("/api/") {
        (false, route)
    } else {
        return None;
    };
    let parts: Vec<_> = route.split('/').collect();
    let kind = match parts.as_slice() {
        ["projects"] if !v2 && *method == Method::POST => Some("create_project"),
        ["projects", _] if !v2 && *method == Method::PATCH => Some("update_project"),
        ["projects", _] if !v2 && *method == Method::DELETE => Some("delete_project"),
        ["projects", _, "circuits"] if *method == Method::GET => Some("list"),
        ["projects", _, "circuits"] if *method == Method::POST => Some("create"),
        ["circuits", _] if *method == Method::GET => Some("get"),
        ["circuits", _] if *method == Method::PUT => Some("save"),
        ["circuits", _] if !v2 && *method == Method::DELETE => Some("delete"),
        _ => None,
    }?;
    Some(async{
  match kind{
   "create_project"=>{
    let value=contract_body(&state.registry,"ProjectCreate",body)?;
    let result=write_service(state)?.create_project(context,&value).await.map_err(error)?;
    Ok(response(result,StatusCode::CREATED,true))
   },
   "update_project"=>{
    let value=contract_body(&state.registry,"ProjectUpdate",body)?;
    let result=write_service(state)?.update_project(context,parts[1],&value).await.map_err(error)?;
    Ok(response(result,StatusCode::OK,true))
   },
   "delete_project"=>{
    let value=contract_body(&state.registry,"ProjectDelete",body)?;
    let result=write_service(state)?.delete_project(context,parts[1],projects::revision(&value["base_revision"])?).await.map_err(error)?;
    Ok(response(result,StatusCode::OK,false))
   },
   "list"=>{
    owned_project(state,parts[1],owner).await?;
    let(limit,after)=crate::http_api::page(uri.query(),"circuits",parts[1])?;
    let rows=state.db.list_circuits(owner,parts[1],after,limit+1).await.map_err(|_|ApiError::new("UNAVAILABLE",503))?;
    let shown:Vec<_>=rows.iter().take(limit as usize).collect();
    if !v2&&shown.iter().any(|row|row.graph_schema_version=="1.2"){return Err(ApiError::new("UNSUPPORTED_DOCUMENT_VERSION",422));}
    let cursor=if rows.len()>limit as usize{Some(crate::http_api::next_cursor(rows[limit as usize-1].sequence,"circuits",parts[1]))}else{None};
    Ok(response(json!({"schema_version":if v2{"2.0"}else{"1.0"},"items":shown.iter().map(|row|projects::circuit_summary(row,v2)).collect::<Vec<_>>(),
     "next_cursor":cursor}),StatusCode::OK,false))
   },
   "get"=>{
    let row=state.db.circuit_by_id(parts[1]).await.map_err(|_|ApiError::new("UNAVAILABLE",503))?
     .filter(|row|!row.deleted).ok_or_else(||ApiError::new("NOT_FOUND",404))?;
    if row.owner_id!=owner{return Err(ApiError::new("FORBIDDEN",403));}
    owned_project(state,&row.project_id,owner).await?;
    let snapshot=state.db.circuit_revision(&row.document_id,row.revision).await.map_err(|_|ApiError::new("UNAVAILABLE",503))?
     .ok_or_else(||ApiError::new("NOT_FOUND",404))?;
    if !v2&&snapshot.graph_schema_version=="1.2"{return Err(ApiError::new("UNSUPPORTED_DOCUMENT_VERSION",422));}
    Ok(response(projects::circuit_document(&row,snapshot,v2),StatusCode::OK,true))
   },
   "create"|"save"=>{
    let contract=match(kind,v2){("create",false)=>"CircuitCreate",("create",true)=>"CircuitCreateV2",("save",true)=>"CircuitSaveV2",_=>"CircuitSave"};
    let value=contract_body(&state.registry,contract,body)?;let writer=write_service(state)?;
    let result=if kind=="create"{writer.create_circuit(context,parts[1],&value,v2).await}
     else{writer.save_circuit(context,parts[1],&value,v2).await}.map_err(error)?;
    Ok(response(result,if kind=="create"{StatusCode::CREATED}else{StatusCode::OK},true))
   },
   "delete"=>{
    let value=contract_body(&state.registry,"CircuitDelete",body)?;
    let result=write_service(state)?.delete_circuit(context,parts[1],projects::revision(&value["base_revision"])?).await.map_err(error)?;
    Ok(response(result,StatusCode::OK,false))
   },
   _=>unreachable!(),
  }
 }.await)
}
