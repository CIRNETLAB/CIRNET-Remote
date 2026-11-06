//! Assignment HTTP contracts; every read retains the service's authority fence.
use crate::{
    auth::SessionContext,
    error::ApiError,
    http_api::AppState,
    http_projects::{contract_body_profile, decode_path},
};
use axum::response::{IntoResponse, Response};
use http::{Method, StatusCode};

fn error(mut error: ApiError) -> ApiError {
    if matches!(
        error.code.as_str(),
        "ASSIGNMENT_NOT_FOUND" | "ASSIGNMENT_REVISION_NOT_FOUND"
    ) {
        error.code = "NOT_FOUND".into();
        error.message = error.code.clone();
    }
    error
}
pub async fn dispatch(
    method: &Method,
    uri: &http::Uri,
    state: &AppState,
    context: &SessionContext,
    body: &[u8],
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
        ["assignments"] if *method == Method::GET => "legacy_list",
        ["assignments"] if !v2 && *method == Method::POST => "legacy_create",
        ["assignments", _] if *method == Method::GET => "legacy_get",
        ["assignments", _, "publication"] if !v2 && *method == Method::PATCH => "legacy_publish",
        ["assignment-documents"] if *method == Method::GET => "list",
        ["assignment-documents"] if *method == Method::POST => "create",
        ["assignment-documents", _] if *method == Method::GET => "get",
        ["assignment-documents", _] if *method == Method::PUT => "save",
        ["assignment-documents", _, "publication"] if *method == Method::PATCH => "publish",
        _ => return None,
    };
    Some(
        async {
            let service = state
                .assignments
                .as_ref()
                .ok_or_else(|| ApiError::new("UNAVAILABLE", 503))?;
            let result = match operation {
                "legacy_list" => service.legacy_list(context, v2).await,
                "legacy_get" => service.legacy_view(context, parts[1], v2).await,
                "legacy_create" => {
                    let value = contract_body_profile(
                        &state.registry,
                        "AssignmentDefinition",
                        "transport",
                        body,
                    )?;
                    service.legacy_create(context, &value).await
                }
                "legacy_publish" => {
                    let value = contract_body_profile(
                        &state.registry,
                        "AssignmentPublication",
                        "transport",
                        body,
                    )?;
                    service.legacy_publish(context, parts[1], &value).await
                }
                "list" => {
                    let (limit, cursor) = crate::http_api::page_query(uri.query())?;
                    service
                        .list_documents(context, limit as usize, cursor.as_deref(), v2)
                        .await
                }
                "get" => service.get_document(context, parts[1], v2).await,
                "create" | "save" | "publish" => {
                    let name = match (operation, v2) {
                        ("create", false) => "AssignmentAuthoringCreate",
                        ("create", true) => "AssignmentAuthoringCreateV2",
                        ("save", false) => "AssignmentAuthoringSave",
                        ("save", true) => "AssignmentAuthoringSaveV2",
                        ("publish", false) => "AssignmentAuthoringPublication",
                        _ => "AssignmentAuthoringPublicationV2",
                    };
                    let value = contract_body_profile(&state.registry, name, "structural", body)?;
                    match operation {
                        "create" => service.create(context, &value["definition"], v2).await,
                        "save" => service.save(context, parts[1], &value, v2).await,
                        _ => service.publish(context, parts[1], &value, v2).await,
                    }
                }
                _ => unreachable!(),
            }
            .map_err(error)?;
            Ok((
                if matches!(operation, "create" | "legacy_create") {
                    StatusCode::CREATED
                } else {
                    StatusCode::OK
                },
                axum::Json(result),
            )
                .into_response())
        }
        .await,
    )
}
