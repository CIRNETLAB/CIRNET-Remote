//! Versioned assignment authoring, disclosure and admission fences.
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use cirnet_contracts_native::validation::{Registry, ValidationError};
use serde_json::{Map, Value, json};
use sqlx::types::Json;

use crate::auth::{self, SessionContext};
use crate::config::Config;
use crate::db::write::{Tx, tx_execute, tx_query};
use crate::db::{WriteDb, WriteTx};
use crate::error::ApiError;

const MAX_REVISION: i64 = 9_007_199_254_740_991;
const MAX_DEFINITION_BYTES: usize = 2_000_000;
const HEAD_COLUMNS: &str = "CAST(d.sequence AS BIGINT) AS sequence, d.assignment_id, a.owner_id,
    d.revision, d.published_revision, a.published, a.feedback_policy, d.created_at, d.updated_at";
const HEAD_JOIN: &str =
    "FROM assignment_documents d JOIN lab_assignment_access a ON a.assignment_id = d.assignment_id";

#[derive(Clone)]
pub struct AssignmentService {
    db: WriteDb,
    config: Config,
    registry: Arc<Registry>,
}

#[derive(Debug)]
pub struct AssignmentSnapshot {
    pub definition: Value,
    pub revision: i64,
}

#[derive(sqlx::FromRow)]
struct Head {
    sequence: i64,
    assignment_id: String,
    owner_id: String,
    revision: i64,
    published_revision: Option<i64>,
    published: bool,
    feedback_policy: String,
    created_at: f64,
    updated_at: f64,
}

#[derive(sqlx::FromRow)]
struct ListedHead {
    #[sqlx(flatten)]
    head: Head,
    title: Option<String>,
    definition_version: Option<String>,
    graph_version: Option<String>,
}

#[derive(Clone, Copy)]
struct Actor<'a> {
    principal: &'a str,
    authenticated: bool,
    role: &'a str,
}

impl<'a> Actor<'a> {
    fn from_context(context: &'a SessionContext) -> Result<Self, ApiError> {
        Ok(Self {
            principal: context.principal_id.as_deref().ok_or_else(forbidden)?,
            authenticated: context.authenticated,
            role: &context.role,
        })
    }

    fn is_author(self, head: &Head) -> bool {
        self.authenticated
            && (self.role == "ADMIN"
                || (self.role == "INSTRUCTOR" && self.principal == head.owner_id))
    }

    fn selected_revision(self, head: &Head) -> Option<i64> {
        if self.is_author(head) {
            Some(head.revision)
        } else if head.published {
            head.published_revision
        } else {
            None
        }
    }
}

#[derive(Clone, Copy)]
enum Change {
    Save,
    Publish,
    LegacyPublish,
}

impl Change {
    fn publication(self) -> bool {
        !matches!(self, Self::Save)
    }

    fn contract(self, v2: bool) -> &'static str {
        match (self, v2) {
            (Self::Save, false) => "AssignmentAuthoringSave",
            (Self::Save, true) => "AssignmentAuthoringSaveV2",
            (Self::Publish, false) => "AssignmentAuthoringPublication",
            (Self::Publish, true) => "AssignmentAuthoringPublicationV2",
            (Self::LegacyPublish, _) => "AssignmentPublication",
        }
    }
}

impl AssignmentService {
    pub fn new(db: WriteDb, config: Config, registry: Arc<Registry>) -> Self {
        Self {
            db,
            config,
            registry,
        }
    }

    pub async fn create(
        &self,
        context: &SessionContext,
        definition: &Value,
        v2: bool,
    ) -> Result<Value, ApiError> {
        let contract = if v2 {
            "AssignmentAuthoringCreateV2"
        } else {
            "AssignmentAuthoringCreate"
        };
        let value = self.request(contract, &json!({"definition": definition}))?;
        let definition = &value["definition"];
        let id = required_text(definition, "assignment_id")?;
        let time = now()?;
        let (mut tx, current) = self.begin_actor(context, true).await?;
        let actor = Actor::from_context(&current)?;
        tx_execute!(
            &mut tx,
            "INSERT INTO lab_assignments (assignment_id, payload) VALUES ($1, $2)",
            id,
            Json(definition),
        )
        .map_err(|error| {
            if error
                .as_database_error()
                .is_some_and(|e| e.is_unique_violation())
            {
                ApiError::new("ASSIGNMENT_EXISTS", 409)
            } else {
                internal(error)
            }
        })?;
        tx_execute!(
            &mut tx, "INSERT INTO lab_assignment_access (assignment_id, owner_id, published, feedback_policy)
             VALUES ($1, $2, FALSE, 'observed_only')",
            id, actor.principal,
        ).map_err(internal)?;
        insert_revision(&mut tx, id, 1, definition, actor.principal, time).await?;
        tx_execute!(
            &mut tx,
            "INSERT INTO assignment_documents
                 (assignment_id, revision, published_revision, created_at, updated_at)
             VALUES ($1, 1, NULL, $2, $2)",
            id,
            time,
        )
        .map_err(internal)?;
        audit(&mut tx, actor.principal, "ASSIGNMENT_CREATED", id).await?;
        let row = head(&mut tx, id, false).await?;
        let result = document(&mut tx, &row, v2).await?;
        finish(tx, result).await
    }

    pub async fn legacy_create(
        &self,
        context: &SessionContext,
        definition: &Value,
    ) -> Result<Value, ApiError> {
        let created = self.create(context, definition, false).await?;
        self.legacy_view(context, required_text(&created, "assignment_id")?, false)
            .await
    }

    pub async fn get_document(
        &self,
        context: &SessionContext,
        id: &str,
        v2: bool,
    ) -> Result<Value, ApiError> {
        let (mut tx, current) = self.begin_actor(context, true).await?;
        let actor = Actor::from_context(&current)?;
        let row = head(&mut tx, id, false).await?;
        if !actor.is_author(&row) {
            return Err(forbidden());
        }
        admin_audit(&mut tx, actor, &row, "ASSIGNMENT_ADMIN_READ").await?;
        let result = document(&mut tx, &row, v2).await?;
        finish(tx, result).await
    }

    pub async fn list_documents(
        &self,
        context: &SessionContext,
        limit: usize,
        cursor: Option<&str>,
        v2: bool,
    ) -> Result<Value, ApiError> {
        if !(1..=100).contains(&limit) {
            return Err(ApiError::new("INVALID_PAGE_LIMIT", 422));
        }
        let (mut tx, current) = self.begin_actor(context, true).await?;
        let actor = Actor::from_context(&current)?;
        let after = decode_cursor(cursor, actor.principal)?;
        let fields = match &tx.inner {
            Tx::Postgres(_) => "
                r.definition->>'title' AS title,
                r.definition->>'schema_version' AS definition_version,
                r.definition->'reference_design_graph'->>'schema_version' AS graph_version",
            Tx::Sqlite(_) => "
                json_extract(r.definition, '$.title') AS title,
                json_extract(r.definition, '$.schema_version') AS definition_version,
                json_extract(r.definition, '$.reference_design_graph.schema_version') AS graph_version",
        };
        let sql = format!(
            "SELECT {HEAD_COLUMNS}, {fields} {HEAD_JOIN}
             JOIN assignment_revisions r ON r.assignment_id = d.assignment_id AND r.revision = d.revision
             WHERE d.sequence > $1 AND ($2 OR a.owner_id = $3)
             ORDER BY d.sequence LIMIT $4"
        );
        let rows: Vec<ListedHead> = tx_query!(
            &mut tx,
            query_as,
            fetch_all,
            &sql,
            after,
            actor.role == "ADMIN",
            actor.principal,
            (limit + 1) as i64,
        )
        .map_err(internal)?;
        let cursor = (rows.len() > limit)
            .then(|| encode_cursor(actor.principal, rows[limit - 1].head.sequence));
        let mut items = Vec::with_capacity(rows.len().min(limit));
        for row in rows.into_iter().take(limit) {
            if !v2 {
                require_legacy_version(
                    row.definition_version.as_deref(),
                    row.graph_version.as_deref(),
                )?;
            }
            let title = row.title.as_deref().ok_or_else(response_mismatch)?;
            admin_audit(&mut tx, actor, &row.head, "ASSIGNMENT_ADMIN_READ").await?;
            items.push(summary(&row.head, title, v2));
        }
        finish(
            tx,
            json!({"schema_version": version(v2), "items": items, "next_cursor": cursor}),
        )
        .await
    }

    pub async fn save(
        &self,
        context: &SessionContext,
        id: &str,
        payload: &Value,
        v2: bool,
    ) -> Result<Value, ApiError> {
        self.replace(context, id, payload, Change::Save, v2).await
    }

    pub async fn publish(
        &self,
        context: &SessionContext,
        id: &str,
        payload: &Value,
        v2: bool,
    ) -> Result<Value, ApiError> {
        self.replace(context, id, payload, Change::Publish, v2)
            .await
    }

    pub async fn legacy_publish(
        &self,
        context: &SessionContext,
        id: &str,
        payload: &Value,
    ) -> Result<Value, ApiError> {
        self.replace(context, id, payload, Change::LegacyPublish, false)
            .await?;
        self.legacy_view(context, id, false).await
    }

    async fn replace(
        &self,
        context: &SessionContext,
        id: &str,
        payload: &Value,
        change: Change,
        v2: bool,
    ) -> Result<Value, ApiError> {
        let value = self.request(change.contract(v2), payload)?;
        if !change.publication() && value["definition"]["assignment_id"].as_str() != Some(id) {
            return Err(ApiError::new("ASSIGNMENT_ID_MISMATCH", 422));
        }
        let (mut tx, current) = self.begin_actor(context, true).await?;
        let actor = Actor::from_context(&current)?;
        let old = head(&mut tx, id, true).await?;
        if !actor.is_author(&old) {
            return Err(forbidden());
        }
        let existing = if !v2 || change.publication() {
            Some(definition(&mut tx, id, old.revision).await?)
        } else {
            None
        };
        if !v2 {
            require_legacy(existing.as_ref().ok_or_else(response_mismatch)?)?;
        }
        let base = if matches!(change, Change::LegacyPublish) {
            old.revision
        } else {
            crate::numeric::bounded_integer(&value["base_revision"], 1, MAX_REVISION)
                .ok_or_else(|| ApiError::new("INVALID_CONTRACT", 422))?
        };
        if base != old.revision {
            return Err(revision_conflict(old.revision));
        }
        if old.revision >= MAX_REVISION {
            return Err(ApiError::new("REVISION_LIMIT_REACHED", 422));
        }
        let revision = old.revision + 1;
        let time = now()?;
        let published = value.get("published").and_then(Value::as_bool);
        let definition = if change.publication() {
            existing.as_ref().ok_or_else(response_mismatch)?
        } else {
            &value["definition"]
        };
        let selection = match published {
            Some(true) => Some(revision),
            Some(false) => None,
            None => old.published_revision,
        };
        let matched: Option<i64> = tx_query!(
            &mut tx, query_scalar, fetch_optional,
            "UPDATE assignment_documents SET revision = $1, published_revision = $2, updated_at = $3
             WHERE assignment_id = $4 AND revision = $5 RETURNING revision",
            revision, selection, time, id, base,
        )
        .map_err(internal)?;
        if matched.is_none() {
            return Err(revision_conflict(head(&mut tx, id, false).await?.revision));
        }
        insert_revision(&mut tx, id, revision, definition, actor.principal, time).await?;
        let (action, admin_action) = if let Some(published) = published {
            let policy = value
                .get("feedback_policy")
                .and_then(Value::as_str)
                .unwrap_or(&old.feedback_policy);
            tx_execute!(
                &mut tx,
                "UPDATE lab_assignment_access SET published = $1, feedback_policy = $2 WHERE assignment_id = $3",
                published, policy, id,
            ).map_err(internal)?;
            if published {
                tx_execute!(
                    &mut tx,
                    "UPDATE lab_assignments SET payload = $1 WHERE assignment_id = $2",
                    Json(definition),
                    id,
                )
                .map_err(internal)?;
            }
            ("ASSIGNMENT_PUBLICATION", "ASSIGNMENT_ADMIN_PUBLICATION")
        } else {
            ("ASSIGNMENT_UPDATED", "ASSIGNMENT_ADMIN_UPDATED")
        };
        audit(&mut tx, actor.principal, action, id).await?;
        admin_audit(&mut tx, actor, &old, admin_action).await?;
        let updated = head(&mut tx, id, false).await?;
        let result = document(&mut tx, &updated, v2).await?;
        finish(tx, result).await
    }

    pub async fn legacy_view(
        &self,
        context: &SessionContext,
        id: &str,
        v2: bool,
    ) -> Result<Value, ApiError> {
        let (mut tx, current) = self.begin_actor(context, false).await?;
        let actor = Actor::from_context(&current)?;
        let row = head(&mut tx, id, false).await?;
        let result = legacy_value(&mut tx, actor, &row, v2).await?;
        finish(tx, result).await
    }

    pub async fn legacy_list(&self, context: &SessionContext, v2: bool) -> Result<Value, ApiError> {
        let (mut tx, current) = self.begin_actor(context, false).await?;
        let actor = Actor::from_context(&current)?;
        let sql = format!("SELECT {HEAD_COLUMNS} {HEAD_JOIN} ORDER BY d.assignment_id");
        let rows: Vec<Head> = tx_query!(&mut tx, query_as, fetch_all, &sql).map_err(internal)?;
        let mut result = Vec::new();
        for row in rows
            .iter()
            .filter(|row| actor.selected_revision(row).is_some())
        {
            result.push(legacy_value(&mut tx, actor, row, v2).await?);
        }
        finish(tx, Value::Array(result)).await
    }

    pub async fn resolve_snapshot(
        &self,
        owner: &str,
        id: &str,
    ) -> Result<AssignmentSnapshot, ApiError> {
        let mut tx = self.db.begin().await.map_err(internal)?;
        let user: Option<(String, bool)> = tx_query!(
            &mut tx,
            query_as,
            fetch_optional,
            "SELECT role, active FROM auth_users WHERE principal_id = $1",
            owner,
        )
        .map_err(internal)?;
        let (role, authenticated) = match &user {
            Some((role, true)) => (role.as_str(), true),
            Some((_, false)) => return Err(forbidden()),
            None => ("STUDENT", false),
        };
        let actor = Actor {
            principal: owner,
            authenticated,
            role,
        };
        let row = head(&mut tx, id, false).await?;
        let revision = actor.selected_revision(&row).ok_or_else(forbidden)?;
        let definition = definition(&mut tx, id, revision).await?;
        tx.commit().await.map_err(internal)?;
        Ok(AssignmentSnapshot {
            definition,
            revision,
        })
    }

    /// Call with the live actor returned by authorize_session on this same
    /// transaction, before inserting the experiment or its operation.
    pub async fn authorize_snapshot(
        &self,
        tx: &mut WriteTx,
        current: &SessionContext,
        id: &str,
        expected: i64,
        expected_definition: &Value,
    ) -> Result<Value, ApiError> {
        let actor = Actor::from_context(current)?;
        let row = head(tx, id, true).await?;
        let selected = actor.selected_revision(&row).ok_or_else(forbidden)?;
        if selected != expected || definition(tx, id, selected).await? != *expected_definition {
            return Err(ApiError::new("ASSIGNMENT_CHANGED", 409));
        }
        admin_audit(tx, actor, &row, "ASSIGNMENT_ADMIN_EXECUTION").await?;
        Ok(json!({"assignment_id": id, "revision": selected}))
    }

    fn request(&self, contract: &str, payload: &Value) -> Result<Value, ApiError> {
        let value = self
            .registry
            .validate(contract, "structural", payload)
            .map_err(contract_error)?;
        if let Some(definition) = value.get("definition") {
            let title = required_text(definition, "title")?;
            if title
                .chars()
                .all(|c| c.is_whitespace() || matches!(c, '\u{001c}'..='\u{001f}'))
            {
                return Err(ApiError::new("INVALID_TITLE", 422));
            }
            let bytes = serde_json::to_vec(definition)
                .map_err(|_| ApiError::new("INVALID_ASSIGNMENT_JSON", 422))?;
            if bytes.len() > MAX_DEFINITION_BYTES {
                return Err(ApiError::new("DOCUMENT_TOO_LARGE", 422));
            }
        }
        Ok(value)
    }

    async fn begin_actor(
        &self,
        context: &SessionContext,
        author: bool,
    ) -> Result<(WriteTx, SessionContext), ApiError> {
        let owner = context
            .owner_id
            .as_deref()
            .ok_or_else(|| ApiError::new("SESSION_EXPIRED", 401))?;
        let mut tx = self.db.begin().await.map_err(internal)?;
        let current =
            auth::authorize_session(&mut tx, &context.session_id, owner, &self.config).await?;
        if author
            && (!current.authenticated || !matches!(current.role.as_str(), "INSTRUCTOR" | "ADMIN"))
        {
            return Err(forbidden());
        }
        Ok((tx, current))
    }
}

async fn head(tx: &mut WriteTx, id: &str, lock: bool) -> Result<Head, ApiError> {
    let suffix = if lock && matches!(&tx.inner, Tx::Postgres(_)) {
        " FOR UPDATE OF d, a"
    } else {
        ""
    };
    let sql = format!("SELECT {HEAD_COLUMNS} {HEAD_JOIN} WHERE d.assignment_id = $1{suffix}");
    tx_query!(tx, query_as, fetch_optional, &sql, id)
        .map_err(internal)?
        .ok_or_else(|| ApiError::new("ASSIGNMENT_NOT_FOUND", 404))
}

async fn definition(tx: &mut WriteTx, id: &str, revision: i64) -> Result<Value, ApiError> {
    let value: Option<Json<Value>> = tx_query!(
        tx,
        query_scalar,
        fetch_optional,
        "SELECT definition FROM assignment_revisions WHERE assignment_id = $1 AND revision = $2",
        id,
        revision,
    )
    .map_err(internal)?;
    value
        .map(|Json(value)| value)
        .ok_or_else(|| ApiError::new("ASSIGNMENT_REVISION_NOT_FOUND", 404))
}

async fn insert_revision(
    tx: &mut WriteTx,
    id: &str,
    revision: i64,
    definition: &Value,
    author: &str,
    time: f64,
) -> Result<(), ApiError> {
    tx_execute!(
        tx,
        "INSERT INTO assignment_revisions (assignment_id, revision, definition, saved_by, saved_at)
         VALUES ($1, $2, $3, $4, $5)",
        id,
        revision,
        Json(definition),
        author,
        time,
    )
    .map_err(internal)?;
    Ok(())
}

async fn audit(tx: &mut WriteTx, actor: &str, action: &str, id: &str) -> Result<(), ApiError> {
    tx_execute!(
        tx, "INSERT INTO auth_audit (occurred_at, actor_id, action, subject_id) VALUES ($1, $2, $3, $4)",
        now()?, actor, action, id,
    ).map_err(internal)?;
    Ok(())
}

async fn admin_audit(
    tx: &mut WriteTx,
    actor: Actor<'_>,
    head: &Head,
    action: &str,
) -> Result<(), ApiError> {
    if actor.role == "ADMIN" && actor.principal != head.owner_id {
        audit(tx, actor.principal, action, &head.assignment_id).await?;
    }
    Ok(())
}

fn summary(head: &Head, title: &str, v2: bool) -> Value {
    json!({
        "schema_version": version(v2),
        "assignment_id": head.assignment_id, "owner_id": head.owner_id,
        "revision": head.revision, "published_revision": head.published_revision,
        "published": head.published, "feedback_policy": head.feedback_policy,
        "created_at": head.created_at, "updated_at": head.updated_at, "title": title,
    })
}

async fn document(tx: &mut WriteTx, head: &Head, v2: bool) -> Result<Value, ApiError> {
    let definition = definition(tx, &head.assignment_id, head.revision).await?;
    if !v2 {
        require_legacy(&definition)?;
    }
    let mut result = summary(head, required_text(&definition, "title")?, v2);
    result["definition"] = definition;
    Ok(result)
}

async fn legacy_value(
    tx: &mut WriteTx,
    actor: Actor<'_>,
    head: &Head,
    v2: bool,
) -> Result<Value, ApiError> {
    let revision = actor.selected_revision(head).ok_or_else(forbidden)?;
    admin_audit(tx, actor, head, "ASSIGNMENT_ADMIN_READ").await?;
    let value = definition(tx, &head.assignment_id, revision).await?;
    if !v2 {
        require_legacy(&value)?;
    }
    if actor.is_author(head) {
        let Value::Object(mut full) = value else {
            return Err(response_mismatch());
        };
        full.insert("document_kind".into(), json!("instructor"));
        full.insert("owner_id".into(), json!(head.owner_id));
        full.insert("published".into(), json!(head.published));
        full.insert("feedback_policy".into(), json!(head.feedback_policy));
        return Ok(Value::Object(full));
    }
    let mut public = Map::new();
    for name in [
        "schema_version",
        "assignment_id",
        "title",
        "assessment_policy",
    ] {
        public.insert(
            name.into(),
            value.get(name).cloned().ok_or_else(response_mismatch)?,
        );
    }
    let endpoints = value
        .get("lab_endpoints")
        .and_then(Value::as_array)
        .ok_or_else(response_mismatch)?;
    let endpoints = endpoints
        .iter()
        .map(|endpoint| {
            Value::Object(
                ["endpoint_id", "role", "channel", "required"]
                    .into_iter()
                    .filter_map(|name| {
                        endpoint
                            .get(name)
                            .map(|value| (name.to_owned(), value.clone()))
                    })
                    .collect(),
            )
        })
        .collect();
    public.insert("lab_endpoints".into(), Value::Array(endpoints));
    public.insert("document_kind".into(), json!("student"));
    public.insert("published".into(), json!(true));
    public.insert("feedback_policy".into(), json!(head.feedback_policy));
    Ok(Value::Object(public))
}

fn require_legacy(definition: &Value) -> Result<(), ApiError> {
    require_legacy_version(
        definition.get("schema_version").and_then(Value::as_str),
        definition
            .pointer("/reference_design_graph/schema_version")
            .and_then(Value::as_str),
    )
}

fn require_legacy_version(definition: Option<&str>, graph: Option<&str>) -> Result<(), ApiError> {
    if definition != Some("1.0") || graph == Some("1.2") {
        Err(ApiError::new("UNSUPPORTED_DOCUMENT_VERSION", 422))
    } else {
        Ok(())
    }
}

fn decode_cursor(cursor: Option<&str>, principal: &str) -> Result<i64, ApiError> {
    let Some(cursor) = cursor else { return Ok(0) };
    let invalid = || ApiError::new("INVALID_CURSOR", 422);
    if cursor.len() > 256 {
        return Err(invalid());
    }
    let mut encoded = cursor.replace('-', "+").replace('_', "/");
    let pad = (4 - encoded.len() % 4) % 4;
    encoded.extend(std::iter::repeat_n('=', pad));
    let bytes = STANDARD.decode(encoded).map_err(|_| invalid())?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    let object = value.as_object().ok_or_else(invalid)?;
    if object.len() != 3
        || object.get("version").and_then(Value::as_i64) != Some(1)
        || object.get("scope").and_then(Value::as_str) != Some(principal)
    {
        return Err(invalid());
    }
    object
        .get("after")
        .and_then(Value::as_i64)
        .filter(|after| (0..=MAX_REVISION).contains(after))
        .ok_or_else(invalid)
}

fn encode_cursor(principal: &str, after: i64) -> String {
    URL_SAFE_NO_PAD.encode(json!({"version": 1, "scope": principal, "after": after}).to_string())
}

fn required_text<'a>(value: &'a Value, name: &str) -> Result<&'a str, ApiError> {
    value
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(response_mismatch)
}

fn version(v2: bool) -> &'static str {
    if v2 { "2.0" } else { "1.0" }
}

fn revision_conflict(revision: i64) -> ApiError {
    ApiError::new("REVISION_CONFLICT", 409).with_revision(revision)
}

fn forbidden() -> ApiError {
    ApiError::new("FORBIDDEN", 403)
}

fn response_mismatch() -> ApiError {
    ApiError::new("RESPONSE_CONTRACT_MISMATCH", 500)
}

fn internal(_: impl std::fmt::Display) -> ApiError {
    ApiError::new("INTERNAL_ERROR", 500)
}

fn now() -> Result<f64, ApiError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_secs_f64())
        .map_err(internal)
}

fn contract_error(error: ValidationError) -> ApiError {
    match error {
        ValidationError::Invalid(mut issue) => {
            issue.message = "The field does not match its declared contract.".into();
            let issue = serde_json::to_value(issue).expect("serializable validation issue");
            ApiError::new("INVALID_CONTRACT", 422).with_issues(vec![issue])
        }
        error => internal(error),
    }
}

async fn finish(tx: WriteTx, result: Value) -> Result<Value, ApiError> {
    tx.commit().await.map_err(internal)?;
    Ok(result)
}

impl AssignmentService {
    pub async fn may_disclose_experiment_feedback(
        &self,
        owner: &str,
        assignment: &str,
    ) -> Result<bool, ApiError> {
        self.db
            .reads()
            .assignment_feedback_allowed(owner, assignment)
            .await
            .map_err(internal)
    }

    pub async fn legacy_assignment_definition(&self, id: &str) -> Result<Value, ApiError> {
        self.db
            .reads()
            .legacy_assignment_value(id)
            .await
            .map_err(internal)?
            .ok_or_else(|| ApiError::new("ASSIGNMENT_NOT_FOUND", 404))
    }
}
