use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct Config {
    pub environment: String,
    pub hardware_mode: String,
    pub database_url: String,
    pub hardware_target: String,
    pub capture_dir: String,
    pub capture_max_bytes: usize,
    pub capture_max_files: usize,
    pub capture_retention_seconds: u64,
    pub simulation_workers: usize,
    pub allow_guest: bool,
    pub trusted_origins: Vec<String>,
    pub session_ttl_seconds: u64,
    pub bootstrap_limit: usize,
    pub mutation_limit: usize,
    pub auth_retention_seconds: u64,
    pub auth_maintenance_batch: usize,
    pub websocket_max_subscriptions: usize,
    pub websocket_max_per_owner: usize,
    pub websocket_max_per_session: usize,
    pub websocket_event_bytes: usize,
    pub websocket_queue_bytes: usize,
    pub websocket_total_bytes: usize,
    pub websocket_handshake_seconds: f64,
    pub websocket_send_seconds: f64,
    pub websocket_cleanup_seconds: f64,
    pub websocket_message_limit: usize,
    pub read_only: bool,
    pub request_max_bytes: usize,
    pub auth_request_max_bytes: usize,
    pub request_body_seconds: f64,
    pub request_json_max_depth: usize,
    pub request_json_max_tokens: usize,
}
impl Config {
    pub fn from_vars(values: &HashMap<String, String>) -> Result<Self, String> {
        let get = |suffix: &str, default: &str| -> String {
            values
                .get(&format!("CIRNET_{suffix}"))
                .or_else(|| values.get(&format!("NETCIRCUIT_{suffix}")))
                .map_or_else(|| default.to_owned(), Clone::clone)
        };
        let boolean = |suffix: &str, default: &str| -> Result<bool, String> {
            match get(suffix, default).as_str() {
                "true" => Ok(true),
                "false" => Ok(false),
                _ => Err(format!("CIRNET_{suffix} must be true or false")),
            }
        };
        let positive = |suffix: &str, default: &str| -> Result<usize, String> {
            let raw = get(suffix, default);
            let raw = raw.trim();
            if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
                return Err(format!("CIRNET_{suffix} must be a positive integer"));
            }
            raw.parse::<usize>()
                .ok()
                .filter(|value| *value > 0)
                .ok_or_else(|| format!("CIRNET_{suffix} must be a positive integer"))
        };
        let simulation_workers = positive("SIMULATION_WORKERS", "4")?;
        let allow_guest = boolean("ALLOW_GUEST", "true")?;
        let read_only = boolean("REMOTE_READ_ONLY", "true")?;
        let environment = get("ENV", "development");
        if !["development", "test", "production"].contains(&environment.as_str()) {
            return Err("CIRNET_ENV must be development, test or production".into());
        }
        let hardware_mode = get("HARDWARE_MODE", "simulation");
        if !["simulation", "hardware"].contains(&hardware_mode.as_str()) {
            return Err("CIRNET_HARDWARE_MODE must be simulation or hardware".into());
        }
        let database_url = get("DATABASE_URL", "sqlite:///./cirnet.db");
        let trusted_origins: Vec<String> = get(
            "TRUSTED_ORIGINS",
            "http://testserver,http://localhost:5173,http://127.0.0.1:5173",
        )
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .collect();
        for origin in &trusted_origins {
            let invalid = || "CIRNET_TRUSTED_ORIGINS must contain exact HTTP origins".to_string();
            let parsed = url::Url::parse(origin).map_err(|_| invalid())?;
            let authority = origin
                .split_once("://")
                .map(|(_, value)| value)
                .ok_or_else(invalid)?;
            if !["http", "https"].contains(&parsed.scheme())
                || parsed.host_str().is_none()
                || authority.contains('/')
                || !parsed.username().is_empty()
                || parsed.query().is_some_and(|q| !q.is_empty())
                || parsed.fragment().is_some_and(|f| !f.is_empty())
            {
                return Err(invalid());
            }
        }
        let deadline = |suffix: &str, default: &str| -> Result<f64, String> {
            let invalid = || format!("Invalid CIRNET_{suffix}");
            let value = get(suffix, default).parse::<f64>().map_err(|_| invalid())?;
            if !value.is_finite() || value <= 0.0 || value > 60.0 {
                return Err(invalid());
            }
            Ok(value)
        };
        let request_body_seconds = deadline("REQUEST_BODY_SECONDS", "10")?;
        let auth_retention_seconds = get("AUTH_RETENTION_SECONDS", "86400")
            .trim()
            .parse::<u64>()
            .map_err(|_| "Invalid CIRNET_AUTH_RETENTION_SECONDS".to_string())?;
        let websocket_max_subscriptions = positive("WEBSOCKET_MAX_SUBSCRIPTIONS", "512")?;
        let websocket_total_bytes = 16 * 1024 * 1024;
        if websocket_max_subscriptions
            .checked_mul(512)
            .is_none_or(|bytes| bytes >= websocket_total_bytes)
        {
            return Err("Insufficient realtime resync reserve".into());
        }
        let session_ttl_seconds = positive("SESSION_TTL_SECONDS", "86400")? as u64;
        if !(60..=604800).contains(&session_ttl_seconds) {
            return Err("CIRNET_SESSION_TTL_SECONDS must be 60..604800".into());
        }
        let request_max_bytes = positive("REQUEST_MAX_BYTES", "4194304")?;
        if request_max_bytes < 2_000_000 {
            return Err("CIRNET_REQUEST_MAX_BYTES is too small".into());
        }
        if environment == "production" {
            if allow_guest {
                return Err("Production requires CIRNET_ALLOW_GUEST=false".into());
            }
            if trusted_origins.is_empty()
                || trusted_origins
                    .iter()
                    .any(|value| !value.starts_with("https://"))
            {
                return Err("Production requires explicit HTTPS CIRNET_TRUSTED_ORIGINS".into());
            }
            let url = database_url.replacen("postgresql+psycopg://", "postgresql://", 1);
            let parsed =
                url::Url::parse(&url).map_err(|_| "Production requires PostgreSQL".to_string())?;
            if parsed.scheme() != "postgresql" || parsed.path().trim_matches('/').is_empty() {
                return Err("Production requires PostgreSQL CIRNET_DATABASE_URL".into());
            }
        }
        Ok(Self {
            environment,
            hardware_mode,
            database_url,
            simulation_workers,
            allow_guest,
            trusted_origins,
            session_ttl_seconds,
            read_only,
            request_max_bytes,
            request_body_seconds,
            bootstrap_limit: positive("BOOTSTRAP_LIMIT", "30")?,
            mutation_limit: 120,
            auth_retention_seconds,
            auth_maintenance_batch: positive("AUTH_MAINTENANCE_BATCH", "100")?,
            websocket_max_subscriptions,
            websocket_max_per_owner: positive("WEBSOCKET_MAX_PER_OWNER", "16")?,
            websocket_max_per_session: positive("WEBSOCKET_MAX_PER_SESSION", "8")?,
            websocket_event_bytes: 512 * 1024,
            websocket_queue_bytes: 1024 * 1024,
            websocket_total_bytes,
            websocket_handshake_seconds: deadline("WEBSOCKET_HANDSHAKE_SECONDS", "5")?,
            websocket_send_seconds: deadline("WEBSOCKET_SEND_SECONDS", "5")?,
            websocket_cleanup_seconds: deadline("WEBSOCKET_CLEANUP_SECONDS", "5")?,
            websocket_message_limit: 120,
            hardware_target: get("HARDWARE_GRPC_TARGET", "127.0.0.1:50051"),
            capture_dir: get("CAPTURE_DIR", ".runtime/captures"),
            capture_max_bytes: positive("CAPTURE_MAX_BYTES", "268435456")?,
            capture_max_files: positive("CAPTURE_MAX_FILES", "4096")?,
            capture_retention_seconds: get("CAPTURE_RETENTION_SECONDS", "2592000")
                .trim()
                .parse::<u64>()
                .map_err(|_| "Invalid CIRNET_CAPTURE_RETENTION_SECONDS".to_string())?,
            auth_request_max_bytes: positive("AUTH_REQUEST_MAX_BYTES", "16384")?,
            request_json_max_depth: positive("REQUEST_JSON_MAX_DEPTH", "64")?,
            request_json_max_tokens: positive("REQUEST_JSON_MAX_TOKENS", "2000000")?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn vars(values: &[(&str, &str)]) -> HashMap<String, String> {
        values
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }
    #[test]
    fn development_accepts_an_explicit_isolated_database_and_defaults() {
        let config =
            Config::from_vars(&vars(&[("CIRNET_DATABASE_URL", "sqlite:///fixture.db")])).unwrap();
        assert_eq!(config.simulation_workers, 4);
        assert!(config.allow_guest);
        assert!(config.read_only);
        assert_eq!(config.request_max_bytes, 4_194_304);
        assert_eq!(config.hardware_target, "127.0.0.1:50051");
        assert_eq!(config.capture_max_bytes, 268_435_456);
        assert_eq!(config.capture_max_files, 4096);
        assert_eq!(config.capture_retention_seconds, 2_592_000);
    }
    #[test]
    fn invalid_canonical_settings_never_fall_back_to_valid_legacy() {
        let error = Config::from_vars(&vars(&[
            ("CIRNET_SIMULATION_WORKERS", "0"),
            ("NETCIRCUIT_SIMULATION_WORKERS", "4"),
        ]))
        .unwrap_err();
        assert!(error.contains("SIMULATION_WORKERS"));
        let error = Config::from_vars(&vars(&[
            ("CIRNET_ALLOW_GUEST", "yes"),
            ("NETCIRCUIT_ALLOW_GUEST", "false"),
        ]))
        .unwrap_err();
        assert!(error.contains("ALLOW_GUEST"));
    }
    #[test]
    fn production_requires_authenticated_https_and_postgres() {
        let config = Config::from_vars(&vars(&[
            ("CIRNET_ENV", "production"),
            ("CIRNET_ALLOW_GUEST", "false"),
            ("CIRNET_TRUSTED_ORIGINS", "https://lab.example"),
            (
                "CIRNET_DATABASE_URL",
                "postgresql+psycopg://user:password@localhost/lab",
            ),
        ]))
        .unwrap();
        assert!(!config.allow_guest);
        for (key, value) in [
            ("CIRNET_ALLOW_GUEST", "true"),
            ("CIRNET_TRUSTED_ORIGINS", "http://lab.example"),
            ("CIRNET_DATABASE_URL", "sqlite:///fixture.db"),
        ] {
            let mut input = vars(&[
                ("CIRNET_ENV", "production"),
                ("CIRNET_ALLOW_GUEST", "false"),
                ("CIRNET_TRUSTED_ORIGINS", "https://lab.example"),
                ("CIRNET_DATABASE_URL", "postgresql://localhost/lab"),
            ]);
            input.insert(key.into(), value.into());
            assert!(Config::from_vars(&input).is_err());
        }
    }
    #[test]
    fn rejects_unbounded_body_deadlines_and_ambiguous_origins() {
        for deadline in ["0", "NaN", "inf", "61"] {
            let error =
                Config::from_vars(&vars(&[("CIRNET_REQUEST_BODY_SECONDS", deadline)])).unwrap_err();
            assert!(error.contains("REQUEST_BODY_SECONDS"));
        }
        for origin in [
            "https://lab.example/",
            "https://name@lab.example",
            "https://lab.example?q=x",
            "https://lab.example#x",
        ] {
            let error =
                Config::from_vars(&vars(&[("CIRNET_TRUSTED_ORIGINS", origin)])).unwrap_err();
            assert!(error.contains("TRUSTED_ORIGINS"));
        }
    }
}
