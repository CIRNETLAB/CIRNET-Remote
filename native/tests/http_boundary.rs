use super::*;

fn config() -> Config {
    Config::from_vars(&Default::default()).unwrap()
}

#[test]
fn request_ids_are_bounded_ascii_and_reused_only_when_valid() {
    let mut headers = HeaderMap::new();
    headers.insert("x-request-id", HeaderValue::from_static("abc_0-X:Y.Z"));
    assert_eq!(request_id(&headers), "abc_0-X:Y.Z");
    for invalid in ["", "has space", "bad/slash", &"a".repeat(129)] {
        headers.insert("x-request-id", invalid.parse().unwrap());
        let selected = request_id(&headers);
        assert_eq!(selected.len(), 32);
        assert!(selected.bytes().all(|byte| byte.is_ascii_hexdigit()));
    }
}

#[test]
fn json_scan_ignores_quoted_delimiters_and_honors_exact_boundaries() {
    assert!(json_complexity(
        "{\"nested\":\"[\\\\\\\"{]}\",\"unicode\":\"é\"}".as_bytes(),
        1,
        8
    ));
    assert!(json_complexity(b"[[0]]", 2, 2));
    assert!(!json_complexity(b"[[0]]", 1, 99));
    assert!(!json_complexity(b"[0,1,2]", 1, 2));
}

#[tokio::test]
async fn enormous_declared_length_and_false_length_never_bypass_budget() {
    let mut request = Request::builder()
        .header("content-length", "9".repeat(5000))
        .uri("/api/projects")
        .body(Body::from("{}"))
        .unwrap();
    assert_eq!(
        body_bytes(&mut request, &config()).await.unwrap_err().code,
        "REQUEST_TOO_LARGE"
    );
    let mut request = Request::builder()
        .header("content-length", "2")
        .uri("/api/projects")
        .body(Body::from(vec![b' '; 4_194_305]))
        .unwrap();
    assert_eq!(
        body_bytes(&mut request, &config()).await.unwrap_err().code,
        "REQUEST_TOO_LARGE"
    );
    let mut request = Request::builder()
        .header("content-length", "-1")
        .uri("/api/projects")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        body_bytes(&mut request, &config()).await.unwrap_err().code,
        "INVALID_REQUEST_FRAMING"
    );
}

#[tokio::test]
async fn auth_body_uses_its_smaller_budget_and_json_rejects_non_utf8() {
    let mut request = Request::builder()
        .uri("/api/auth/login")
        .body(Body::from(vec![b' '; 16_385]))
        .unwrap();
    assert_eq!(
        body_bytes(&mut request, &config()).await.unwrap_err().code,
        "REQUEST_TOO_LARGE"
    );
    for bytes in [vec![0xff], vec![b'{', 0, b'}']] {
        let mut request = Request::builder()
            .uri("/api/projects")
            .body(Body::from(bytes))
            .unwrap();
        assert_eq!(
            body_bytes(&mut request, &config()).await.unwrap_err().code,
            "INVALID_REQUEST_FRAMING"
        );
    }
}

#[tokio::test]
async fn never_ending_body_is_cancelled_at_deadline() {
    let mut config = config();
    config.request_body_seconds = 0.01;
    let stream = futures_util::stream::pending::<Result<axum::body::Bytes, std::io::Error>>();
    let mut request = Request::builder()
        .uri("/api/projects")
        .body(Body::from_stream(stream))
        .unwrap();
    assert_eq!(
        body_bytes(&mut request, &config).await.unwrap_err().code,
        "REQUEST_TIMEOUT"
    );
}

#[test]
fn pagination_cursor_matches_legacy_bytes_and_rejects_other_scope() {
    let cursor = next_cursor(1, "projects", "");
    assert_eq!(
        cursor,
        "eyJ2ZXJzaW9uIjoxLCJraW5kIjoicHJvamVjdHMiLCJzY29wZSI6IiIsImFmdGVyIjoxfQ"
    );
    assert_eq!(
        page(Some(&format!("limit=1&cursor={cursor}")), "projects", "").unwrap(),
        (1, 1)
    );
    assert_eq!(
        page(Some(&format!("cursor={cursor}")), "circuits", "p")
            .unwrap_err()
            .code,
        "INVALID_CURSOR"
    );
    let bad = URL_SAFE_NO_PAD.encode(br#"{"version":1,"kind":"projects","scope":"","after":true}"#);
    assert!(page(Some(&format!("cursor={bad}")), "projects", "").is_err());
}

#[tokio::test]
async fn public_error_envelope_preserves_request_and_operation_identity() {
    let mut headers = HeaderMap::new();
    headers.insert("idempotency-key", HeaderValue::from_static("run-1"));
    let response = error(ApiError::new("FORBIDDEN", 403), "request-1", &headers);
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let body: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
    assert_eq!(
        body,
        json!({"code":"FORBIDDEN","message":"This resource is not available to the current principal.","request_id":"request-1","operation_key":"run-1"})
    );
}

#[tokio::test]
async fn revision_conflict_exposes_current_revision_without_driver_details() {
    let response = error(
        ApiError::new("REVISION_CONFLICT", 409).with_revision(7),
        "request-2",
        &HeaderMap::new(),
    );
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let value: Value =
        serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
    assert_eq!(value["current_revision"], 7);
    assert_eq!(value["code"], "REVISION_CONFLICT");
}
