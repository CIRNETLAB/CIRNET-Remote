//! Immutable DDL for the legacy Alembic revisions.
//! The sequence placeholder is INTEGER on SQLite and SERIAL on PostgreSQL.

pub(super) struct LegacyTable {
    pub name: &'static str,
    pub columns: &'static [&'static str],
    pub statement: &'static str,
}

pub(super) const LEGACY: &[LegacyTable] = &[
    LegacyTable {
        name: "lab_assignments",
        columns: &["assignment_id", "payload"],
        statement: r#"CREATE TABLE lab_assignments (
    assignment_id VARCHAR NOT NULL,
    payload JSON NOT NULL,
    PRIMARY KEY (assignment_id)
)"#,
    },
    LegacyTable {
        name: "lab_experiments",
        columns: &["sequence", "experiment_id", "owner_id", "payload"],
        statement: r#"CREATE TABLE lab_experiments (
    sequence __CIRNET_SEQUENCE__ NOT NULL,
    experiment_id VARCHAR NOT NULL,
    owner_id VARCHAR NOT NULL,
    payload JSON NOT NULL,
    PRIMARY KEY (sequence),
    UNIQUE (experiment_id)
)"#,
    },
    LegacyTable {
        name: "lab_leases",
        columns: &[
            "station_id",
            "slot",
            "experiment_id",
            "expires_at",
            "quarantined",
        ],
        statement: r#"CREATE TABLE lab_leases (
    station_id VARCHAR NOT NULL,
    slot INTEGER NOT NULL,
    experiment_id VARCHAR NOT NULL,
    expires_at FLOAT NOT NULL,
    quarantined BOOLEAN NOT NULL,
    PRIMARY KEY (station_id, slot),
    UNIQUE (experiment_id)
)"#,
    },
    LegacyTable {
        name: "lab_sessions",
        columns: &["session_id", "expires_at"],
        statement: r#"CREATE TABLE lab_sessions (
    session_id VARCHAR NOT NULL,
    expires_at FLOAT NOT NULL,
    PRIMARY KEY (session_id)
)"#,
    },
    LegacyTable {
        name: "lab_operations",
        columns: &[
            "owner_id",
            "kind",
            "scope",
            "operation_key",
            "fingerprint",
            "payload",
        ],
        statement: r#"CREATE TABLE lab_operations (
    owner_id VARCHAR NOT NULL,
    kind VARCHAR NOT NULL,
    scope VARCHAR NOT NULL,
    operation_key VARCHAR NOT NULL,
    fingerprint VARCHAR NOT NULL,
    payload JSON NOT NULL,
    PRIMARY KEY (owner_id, kind, scope, operation_key)
)"#,
    },
];

pub(super) const V0002: &[&str] = &[
    r#"CREATE TABLE auth_principals (
    principal_id VARCHAR NOT NULL,
    kind VARCHAR NOT NULL,
    created_at FLOAT NOT NULL,
    PRIMARY KEY (principal_id)
)"#,
    r#"CREATE TABLE auth_users (
    principal_id VARCHAR NOT NULL,
    username VARCHAR NOT NULL,
    username_key VARCHAR NOT NULL,
    display_name VARCHAR NOT NULL,
    password_hash VARCHAR NOT NULL,
    role VARCHAR NOT NULL,
    active BOOLEAN NOT NULL,
    auth_revision INTEGER NOT NULL,
    PRIMARY KEY (principal_id),
    FOREIGN KEY(principal_id) REFERENCES auth_principals (principal_id),
    UNIQUE (username_key)
)"#,
    r#"CREATE TABLE auth_sessions (
    session_id VARCHAR NOT NULL,
    token_hash VARCHAR NOT NULL,
    principal_id VARCHAR,
    csrf_token VARCHAR NOT NULL,
    expires_at FLOAT NOT NULL,
    revoked BOOLEAN NOT NULL,
    auth_revision INTEGER NOT NULL,
    claimable_guest_id VARCHAR,
    PRIMARY KEY (session_id),
    UNIQUE (token_hash),
    FOREIGN KEY(principal_id) REFERENCES auth_principals (principal_id),
    FOREIGN KEY(claimable_guest_id) REFERENCES auth_principals (principal_id)
)"#,
    r#"CREATE TABLE lab_assignment_access (
    assignment_id VARCHAR NOT NULL,
    owner_id VARCHAR NOT NULL,
    published BOOLEAN NOT NULL,
    feedback_policy VARCHAR NOT NULL,
    PRIMARY KEY (assignment_id),
    FOREIGN KEY(assignment_id) REFERENCES lab_assignments (assignment_id),
    FOREIGN KEY(owner_id) REFERENCES auth_principals (principal_id)
)"#,
    r#"CREATE TABLE auth_audit (
    sequence __CIRNET_SEQUENCE__ NOT NULL,
    occurred_at FLOAT NOT NULL,
    actor_id VARCHAR,
    action VARCHAR NOT NULL,
    subject_id VARCHAR NOT NULL,
    PRIMARY KEY (sequence),
    FOREIGN KEY(actor_id) REFERENCES auth_principals (principal_id)
)"#,
    r#"CREATE TABLE auth_rate_limits (
    bucket VARCHAR NOT NULL,
    window_start FLOAT NOT NULL,
    attempts INTEGER NOT NULL,
    PRIMARY KEY (bucket)
)"#,
];

pub(super) const V0003: &[&str] = &[
    r#"CREATE TABLE projects (
    sequence __CIRNET_SEQUENCE__ NOT NULL,
    project_id VARCHAR NOT NULL,
    owner_id VARCHAR NOT NULL,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    created_at FLOAT NOT NULL,
    updated_at FLOAT NOT NULL,
    revision BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL,
    PRIMARY KEY (sequence),
    UNIQUE (project_id, owner_id),
    CONSTRAINT ck_projects_revision CHECK (revision >= 1),
    UNIQUE (project_id),
    FOREIGN KEY(owner_id) REFERENCES auth_principals (principal_id)
)"#,
    r#"CREATE INDEX ix_projects_owner_live_sequence ON projects (owner_id, deleted, sequence)"#,
    r#"CREATE TABLE circuit_documents (
    sequence __CIRNET_SEQUENCE__ NOT NULL,
    document_id VARCHAR NOT NULL,
    project_id VARCHAR NOT NULL,
    owner_id VARCHAR NOT NULL,
    name VARCHAR(128) NOT NULL,
    graph_schema_version VARCHAR NOT NULL,
    created_at FLOAT NOT NULL,
    updated_at FLOAT NOT NULL,
    revision BIGINT NOT NULL,
    deleted BOOLEAN NOT NULL,
    PRIMARY KEY (sequence),
    FOREIGN KEY(project_id, owner_id) REFERENCES projects (project_id, owner_id) ON UPDATE CASCADE,
    CONSTRAINT ck_documents_revision CHECK (revision >= 1),
    UNIQUE (document_id),
    FOREIGN KEY(owner_id) REFERENCES auth_principals (principal_id)
)"#,
    r#"CREATE INDEX ix_documents_project_owner_live_sequence ON circuit_documents (project_id, owner_id, deleted, sequence)"#,
    r#"CREATE TABLE circuit_revisions (
    document_id VARCHAR NOT NULL,
    revision BIGINT NOT NULL,
    name VARCHAR(128) NOT NULL,
    graph_schema_version VARCHAR NOT NULL,
    graph JSON NOT NULL,
    saved_by VARCHAR NOT NULL,
    saved_at FLOAT NOT NULL,
    PRIMARY KEY (document_id, revision),
    CONSTRAINT ck_snapshot_revision CHECK (revision >= 1),
    FOREIGN KEY(document_id) REFERENCES circuit_documents (document_id),
    FOREIGN KEY(saved_by) REFERENCES auth_principals (principal_id)
)"#,
    r#"CREATE TABLE experiment_document_refs (
    experiment_id VARCHAR NOT NULL,
    document_id VARCHAR NOT NULL,
    revision BIGINT NOT NULL,
    PRIMARY KEY (experiment_id),
    FOREIGN KEY(document_id, revision) REFERENCES circuit_revisions (document_id, revision),
    FOREIGN KEY(experiment_id) REFERENCES lab_experiments (experiment_id)
)"#,
];

pub(super) const V0004: &[&str] = &[
    r#"CREATE TABLE assignment_revisions (
    assignment_id VARCHAR NOT NULL,
    revision BIGINT NOT NULL,
    definition JSON NOT NULL,
    saved_by VARCHAR NOT NULL,
    saved_at FLOAT NOT NULL,
    PRIMARY KEY (assignment_id, revision),
    CONSTRAINT ck_assignment_revisions_revision CHECK (revision >= 1),
    FOREIGN KEY(assignment_id) REFERENCES lab_assignments (assignment_id),
    FOREIGN KEY(saved_by) REFERENCES auth_principals (principal_id)
)"#,
    r#"CREATE TABLE assignment_documents (
    sequence __CIRNET_SEQUENCE__ NOT NULL,
    assignment_id VARCHAR NOT NULL,
    revision BIGINT NOT NULL,
    published_revision BIGINT,
    created_at FLOAT NOT NULL,
    updated_at FLOAT NOT NULL,
    PRIMARY KEY (sequence),
    FOREIGN KEY(assignment_id, revision) REFERENCES assignment_revisions (assignment_id, revision) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(assignment_id, published_revision) REFERENCES assignment_revisions (assignment_id, revision) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT ck_assignment_documents_revision CHECK (revision >= 1),
    UNIQUE (assignment_id),
    FOREIGN KEY(assignment_id) REFERENCES lab_assignments (assignment_id)
)"#,
    r#"CREATE INDEX ix_assignment_documents_sequence ON assignment_documents (sequence)"#,
];

pub(super) const V0005: &[&str] = &[
    r#"CREATE TABLE lab_captures (
    capture_id VARCHAR NOT NULL,
    experiment_id VARCHAR NOT NULL,
    metadata JSON NOT NULL,
    created_at FLOAT NOT NULL,
    available BOOLEAN NOT NULL,
    cleanup_pending BOOLEAN NOT NULL,
    PRIMARY KEY (capture_id),
    FOREIGN KEY(experiment_id) REFERENCES lab_experiments (experiment_id)
)"#,
    r#"CREATE INDEX ix_lab_captures_available_created ON lab_captures (available, created_at, capture_id)"#,
    r#"CREATE INDEX ix_lab_captures_cleanup_pending ON lab_captures (cleanup_pending, capture_id)"#,
];

pub(super) const V0006: &[&str] = &[
    r#"CREATE TABLE lab_experiment_runtime (
    experiment_id VARCHAR NOT NULL,
    state VARCHAR NOT NULL,
    active BOOLEAN NOT NULL,
    station_id VARCHAR,
    control_session_id VARCHAR,
    control_client_id VARCHAR,
    queue_sequence BIGINT NOT NULL,
    legacy_capture BOOLEAN NOT NULL,
    PRIMARY KEY (experiment_id),
    FOREIGN KEY(experiment_id) REFERENCES lab_experiments (experiment_id)
)"#,
    r#"CREATE INDEX ix_lab_runtime_active ON lab_experiment_runtime (active, experiment_id)"#,
    r#"CREATE INDEX ix_lab_runtime_legacy_capture ON lab_experiment_runtime (legacy_capture, experiment_id)"#,
    r#"CREATE INDEX ix_lab_runtime_session_active ON lab_experiment_runtime (control_session_id, active, experiment_id)"#,
    r#"CREATE INDEX ix_lab_runtime_state_queue ON lab_experiment_runtime (state, queue_sequence, experiment_id)"#,
];

pub(super) const HISTORY_INDEX: &str =
    r#"CREATE INDEX ix_lab_experiments_owner_sequence ON lab_experiments (owner_id, sequence)"#;

pub(super) const V0007: &[&str] = &[
    "CREATE INDEX ix_auth_sessions_expiry ON auth_sessions (expires_at, session_id)",
    "CREATE INDEX ix_auth_sessions_principal ON auth_sessions (principal_id, revoked)",
    "CREATE INDEX ix_auth_rate_limits_window ON auth_rate_limits (window_start, bucket)",
];
