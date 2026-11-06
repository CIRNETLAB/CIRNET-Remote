//! Browser station routes. Auth and the live scheduler are provided by the router.
use std::future::Future;

use axum::response::{IntoResponse, Response};
use http::Method;

use crate::{error::ApiError, http_projects::decode_path, stations::StationService};

pub const STATION_OPERATIONS: &[&str] =
    &["listStations", "getStationCapabilities", "getStationQueue"];

pub async fn dispatch<F>(
    method: &Method,
    raw_path: &str,
    service: &StationService,
    owner: &str,
    queue: impl FnOnce(String) -> F,
) -> Option<Result<Response, ApiError>>
where
    F: Future<Output = Result<Vec<String>, ApiError>>,
{
    if *method != Method::GET {
        return None;
    }
    let path = decode_path(raw_path);
    let result = if path == "/api/stations" {
        service.list().await
    } else {
        let (station, suffix) = path.strip_prefix("/api/stations/")?.split_once('/')?;
        if station.is_empty() {
            return None;
        }
        match suffix {
            "capabilities" => service.capabilities(station).await,
            "queue" => {
                service
                    .queue(station, owner, async { queue(station.to_owned()).await })
                    .await
            }
            _ => return None,
        }
    };
    Some(result.map(|value| axum::Json(value).into_response()))
}

#[cfg(test)]
#[path = "../tests/stations_cases.rs"]
mod tests;
