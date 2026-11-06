//! Owner-scoped project documents with session fencing and database CAS.
use crate::db::write::{Tx, tx_execute, tx_query};
use crate::{
    auth::{self, SessionContext},
    config::Config,
    db::{CircuitRevisionRow, CircuitRow, ProjectRow, WriteDb, WriteTx},
    error::ApiError,
};
use cirnet_contracts_native::validation::{Registry, ValidationError};
use serde_json::{Value, json};
use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_REVISION: i64 = 9_007_199_254_740_991;
pub(crate) fn revision(value: &Value) -> Result<i64, ApiError> {
    crate::numeric::bounded_integer(value, 1, MAX_REVISION)
        .ok_or_else(|| ApiError::new("INVALID_CONTRACT", 422))
}
const PROJECT_COLUMNS: &str = "CAST(sequence AS BIGINT) AS sequence,project_id,owner_id,name,description,created_at,updated_at,revision,deleted";
const CIRCUIT_COLUMNS: &str = "CAST(sequence AS BIGINT) AS sequence,document_id,project_id,owner_id,name,graph_schema_version,created_at,updated_at,revision,deleted";
fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock before epoch")
        .as_secs_f64()
}
fn internal(_: impl std::fmt::Display) -> ApiError {
    ApiError::new("INTERNAL_ERROR", 500)
}
fn db_error(error: sqlx::Error) -> ApiError {
    if error
        .as_database_error()
        .is_some_and(|error| error.is_unique_violation() || error.is_foreign_key_violation())
    {
        ApiError::new("RESOURCE_CONFLICT", 409)
    } else {
        internal(error)
    }
}
fn owner(context: &SessionContext) -> Result<&str, ApiError> {
    context
        .owner_id
        .as_deref()
        .ok_or_else(|| ApiError::new("UNAUTHENTICATED", 401))
}
fn owned_project(row: Option<ProjectRow>, owner: &str) -> Result<ProjectRow, ApiError> {
    let row = row
        .filter(|r| !r.deleted)
        .ok_or_else(|| ApiError::new("PROJECT_NOT_FOUND", 404))?;
    if row.owner_id != owner {
        return Err(ApiError::new("FORBIDDEN", 403));
    }
    Ok(row)
}
fn owned_circuit(row: Option<CircuitRow>, owner: &str) -> Result<CircuitRow, ApiError> {
    let row = row
        .filter(|r| !r.deleted)
        .ok_or_else(|| ApiError::new("DOCUMENT_NOT_FOUND", 404))?;
    if row.owner_id != owner {
        return Err(ApiError::new("FORBIDDEN", 403));
    }
    Ok(row)
}
pub fn project_view(row: &ProjectRow) -> Value {
    json!({"schema_version":"1.0","project_id":row.project_id,"owner_id":row.owner_id,"name":row.name,
 "description":row.description,"revision":row.revision,"created_at":row.created_at,"updated_at":row.updated_at,"access_scope":"private"})
}
pub fn circuit_summary(row: &CircuitRow, v2: bool) -> Value {
    json!({"schema_version":if v2{"2.0"}else{"1.0"},"document_id":row.document_id,"project_id":row.project_id,
 "owner_id":row.owner_id,"name":row.name,"graph_schema_version":row.graph_schema_version,"revision":row.revision,
 "created_at":row.created_at,"updated_at":row.updated_at})
}
pub fn circuit_document(row: &CircuitRow, snapshot: CircuitRevisionRow, v2: bool) -> Value {
    let mut value = circuit_summary(row, v2);
    value["revision"] = json!(snapshot.revision);
    value["name"] = json!(snapshot.name);
    value["graph_schema_version"] = json!(snapshot.graph_schema_version);
    value["updated_at"] = json!(snapshot.saved_at);
    value["graph"] = snapshot.graph;
    value
}
fn revision_failure(current: i64, base: i64) -> ApiError {
    if current == base && current >= MAX_REVISION {
        ApiError::new("REVISION_LIMIT_REACHED", 422)
    } else {
        ApiError::new("REVISION_CONFLICT", 409).with_revision(current)
    }
}
async fn project(
    tx: &mut WriteTx,
    id: &str,
    owner: &str,
    lock: bool,
) -> Result<ProjectRow, ApiError> {
    let suffix = if lock && matches!(tx.inner, Tx::Postgres(_)) {
        " FOR UPDATE"
    } else {
        ""
    };
    let sql = format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE project_id=$1{suffix}");
    let row = tx_query!(tx, query_as, fetch_optional, &sql, id).map_err(db_error)?;
    owned_project(row, owner)
}
async fn circuit(tx: &mut WriteTx, id: &str, owner: &str) -> Result<CircuitRow, ApiError> {
    let sql = format!("SELECT {CIRCUIT_COLUMNS} FROM circuit_documents WHERE document_id=$1");
    let row = tx_query!(tx, query_as, fetch_optional, &sql, id).map_err(db_error)?;
    let row = owned_circuit(row, owner)?;
    project(tx, &row.project_id, owner, false).await?;
    Ok(row)
}
async fn audit(tx: &mut WriteTx, owner: &str, action: &str, id: &str) -> Result<(), ApiError> {
    tx_execute!(
        tx,
        "INSERT INTO auth_audit(occurred_at,actor_id,action,subject_id) VALUES($1,$2,$3,$4)",
        now(),
        owner,
        action,
        id
    )
    .map_err(db_error)?;
    Ok(())
}
async fn snapshot(
    tx: &mut WriteTx,
    owner: &str,
    row: &CircuitRow,
    graph: &Value,
) -> Result<(), ApiError> {
    tx_execute!(tx,"INSERT INTO circuit_revisions(document_id,revision,name,graph_schema_version,graph,saved_by,saved_at)
 VALUES($1,$2,$3,$4,$5,$6,$7)",&row.document_id,row.revision,&row.name,&row.graph_schema_version,
 sqlx::types::Json(graph),owner,row.updated_at).map_err(db_error)?;
    Ok(())
}
fn contract_error(error: ValidationError) -> ApiError {
    match error {
        ValidationError::Invalid(mut issue) => {
            issue.message = "The field does not match its declared contract.".into();
            ApiError::new("INVALID_CONTRACT", 422).with_issues(vec![
                serde_json::to_value(issue).expect("issue serializable"),
            ])
        }
        _ => ApiError::new("INTERNAL_ERROR", 500),
    }
}
#[derive(Clone)]
pub struct ProjectService {
    db: WriteDb,
    config: Config,
    registry: Arc<Registry>,
}
impl ProjectService {
    pub fn new(db: WriteDb, config: Config, registry: Arc<Registry>) -> Self {
        Self {
            db,
            config,
            registry,
        }
    }
    fn request(&self, name: &str, payload: &Value, v2: bool) -> Result<Value, ApiError> {
        let value = self
            .registry
            .validate(name, "structural", payload)
            .map_err(contract_error)?;
        if value.get("name").and_then(Value::as_str).is_some_and(|s| {
            s.chars()
                .all(|c| c.is_whitespace() || matches!(c, '\u{001c}'..='\u{001f}'))
        }) {
            return Err(ApiError::new("INVALID_NAME", 422));
        }
        if let Some(graph) = value.get("graph") {
            let raw =
                serde_json::to_vec(graph).map_err(|_| ApiError::new("INVALID_GRAPH_JSON", 422))?;
            if raw.len() > 2_000_000 {
                return Err(ApiError::new("DOCUMENT_TOO_LARGE", 422));
            }
            if v2 {
                self.registry
                    .validate("AnySupportedCircuitGraph", "structural", graph)
                    .map_err(contract_error)?;
                crate::preview::validate_design(&self.registry, graph)
                    .map_err(|_| ApiError::new("INVALID_CONFIGURATION", 422))?;
            }
        }
        Ok(value)
    }
    async fn begin(&self, context: &SessionContext) -> Result<WriteTx, ApiError> {
        let mut tx = self.db.begin().await.map_err(internal)?;
        auth::authorize_session(&mut tx, &context.session_id, owner(context)?, &self.config)
            .await?;
        Ok(tx)
    }
    pub async fn create_project(
        &self,
        ctx: &SessionContext,
        payload: &Value,
    ) -> Result<Value, ApiError> {
        let value = self.request("ProjectCreate", payload, false)?;
        let owner = owner(ctx)?;
        let time = now();
        let id = uuid::Uuid::new_v4().simple().to_string();
        let mut tx = self.begin(ctx).await?;
        let sql=format!("INSERT INTO projects(project_id,owner_id,name,description,created_at,updated_at,revision,deleted)
   VALUES($1,$2,$3,$4,$5,$5,1,FALSE) RETURNING {PROJECT_COLUMNS}");
        let row: ProjectRow = tx_query!(
            &mut tx,
            query_as,
            fetch_one,
            &sql,
            &id,
            owner,
            value["name"].as_str().unwrap(),
            value
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or(""),
            time
        )
        .map_err(db_error)?;
        audit(&mut tx, owner, "PROJECT_CREATED", &id).await?;
        let result = project_view(&row);
        tx.commit().await.map_err(internal)?;
        Ok(result)
    }
    pub async fn update_project(
        &self,
        ctx: &SessionContext,
        id: &str,
        payload: &Value,
    ) -> Result<Value, ApiError> {
        let value = self.request("ProjectUpdate", payload, false)?;
        let owner = owner(ctx)?;
        let base = revision(&value["base_revision"])?;
        let mut tx = self.begin(ctx).await?;
        project(&mut tx, id, owner, false).await?;
        let sql=format!("UPDATE projects SET name=COALESCE($1,name),description=COALESCE($2,description),
   revision=revision+1,updated_at=$3 WHERE project_id=$4 AND owner_id=$5 AND deleted=FALSE AND revision=$6
   AND revision<$7 RETURNING {PROJECT_COLUMNS}");
        let row: Option<ProjectRow> = tx_query!(
            &mut tx,
            query_as,
            fetch_optional,
            &sql,
            value.get("name").and_then(Value::as_str),
            value.get("description").and_then(Value::as_str),
            now(),
            id,
            owner,
            base,
            MAX_REVISION
        )
        .map_err(db_error)?;
        let row = match row {
            Some(row) => row,
            None => {
                return Err(revision_failure(
                    project(&mut tx, id, owner, false).await?.revision,
                    base,
                ));
            }
        };
        audit(&mut tx, owner, "PROJECT_UPDATED", id).await?;
        let result = project_view(&row);
        tx.commit().await.map_err(internal)?;
        Ok(result)
    }
    pub async fn delete_project(
        &self,
        ctx: &SessionContext,
        id: &str,
        base: i64,
    ) -> Result<Value, ApiError> {
        self.request("ProjectDelete", &json!({"base_revision":base}), false)?;
        let owner = owner(ctx)?;
        let mut tx = self.begin(ctx).await?;
        project(&mut tx, id, owner, false).await?;
        let time = now();
        let revision:Option<i64>=tx_query!(&mut tx,query_scalar,fetch_optional,
   "UPDATE projects SET deleted=TRUE,revision=revision+1,updated_at=$1 WHERE project_id=$2 AND owner_id=$3
    AND deleted=FALSE AND revision=$4 AND revision<$5 RETURNING revision",time,id,owner,base,MAX_REVISION).map_err(db_error)?;
        let revision = match revision {
            Some(r) => r,
            None => {
                return Err(revision_failure(
                    project(&mut tx, id, owner, false).await?.revision,
                    base,
                ));
            }
        };
        tx_execute!(
            &mut tx,
            "UPDATE circuit_documents SET deleted=TRUE,revision=revision+1,updated_at=$1
   WHERE project_id=$2 AND deleted=FALSE AND revision<$3",
            time,
            id,
            MAX_REVISION
        )
        .map_err(db_error)?;
        let pending:Option<String>=tx_query!(&mut tx,query_scalar,fetch_optional,
   "SELECT document_id FROM circuit_documents WHERE project_id=$1 AND deleted=FALSE LIMIT 1",id).map_err(db_error)?;
        if pending.is_some() {
            return Err(ApiError::new("REVISION_LIMIT_REACHED", 422));
        }
        audit(&mut tx, owner, "PROJECT_DELETED", id).await?;
        tx.commit().await.map_err(internal)?;
        Ok(json!({"schema_version":"1.0","project_id":id,"deleted":true,"revision":revision}))
    }
    pub async fn create_circuit(
        &self,
        ctx: &SessionContext,
        pid: &str,
        payload: &Value,
        v2: bool,
    ) -> Result<Value, ApiError> {
        let value = self.request(
            if v2 {
                "CircuitCreateV2"
            } else {
                "CircuitCreate"
            },
            payload,
            v2,
        )?;
        let owner = owner(ctx)?;
        let time = now();
        let id = uuid::Uuid::new_v4().simple().to_string();
        let mut tx = self.begin(ctx).await?;
        project(&mut tx, pid, owner, true).await?;
        let sql=format!("INSERT INTO circuit_documents(document_id,project_id,owner_id,name,graph_schema_version,created_at,updated_at,revision,deleted)
   SELECT $1,$2,$3,$4,$5,$6,$6,1,FALSE FROM projects WHERE project_id=$2 AND owner_id=$3 AND deleted=FALSE RETURNING {CIRCUIT_COLUMNS}");
        let row: Option<CircuitRow> = tx_query!(
            &mut tx,
            query_as,
            fetch_optional,
            &sql,
            &id,
            pid,
            owner,
            value["name"].as_str().unwrap(),
            value["graph"]["schema_version"].as_str().unwrap(),
            time
        )
        .map_err(db_error)?;
        let row = match row {
            Some(r) => r,
            None => {
                project(&mut tx, pid, owner, false).await?;
                return Err(ApiError::new("RESOURCE_CONFLICT", 409));
            }
        };
        snapshot(&mut tx, owner, &row, &value["graph"]).await?;
        audit(&mut tx, owner, "CIRCUIT_CREATED", &id).await?;
        let mut result = circuit_summary(&row, v2);
        result["graph"] = value["graph"].clone();
        tx.commit().await.map_err(internal)?;
        Ok(result)
    }
    pub async fn save_circuit(
        &self,
        ctx: &SessionContext,
        id: &str,
        payload: &Value,
        v2: bool,
    ) -> Result<Value, ApiError> {
        let value = self.request(
            if v2 { "CircuitSaveV2" } else { "CircuitSave" },
            payload,
            v2,
        )?;
        let owner = owner(ctx)?;
        let base = revision(&value["base_revision"])?;
        let mut tx = self.begin(ctx).await?;
        let existing = circuit(&mut tx, id, owner).await?;
        if !v2 && existing.graph_schema_version == "1.2" {
            return Err(ApiError::new("UNSUPPORTED_DOCUMENT_VERSION", 422));
        }
        let sql=format!("UPDATE circuit_documents SET name=$1,graph_schema_version=$2,revision=revision+1,updated_at=$3
   WHERE document_id=$4 AND owner_id=$5 AND deleted=FALSE AND revision=$6 AND revision<$7 RETURNING {CIRCUIT_COLUMNS}");
        let row: Option<CircuitRow> = tx_query!(
            &mut tx,
            query_as,
            fetch_optional,
            &sql,
            value["name"].as_str().unwrap(),
            value["graph"]["schema_version"].as_str().unwrap(),
            now(),
            id,
            owner,
            base,
            MAX_REVISION
        )
        .map_err(db_error)?;
        let row = match row {
            Some(r) => r,
            None => {
                return Err(revision_failure(
                    circuit(&mut tx, id, owner).await?.revision,
                    base,
                ));
            }
        };
        snapshot(&mut tx, owner, &row, &value["graph"]).await?;
        audit(&mut tx, owner, "CIRCUIT_SAVED", id).await?;
        let mut result = circuit_summary(&row, v2);
        result["graph"] = value["graph"].clone();
        tx.commit().await.map_err(internal)?;
        Ok(result)
    }
    pub async fn delete_circuit(
        &self,
        ctx: &SessionContext,
        id: &str,
        base: i64,
    ) -> Result<Value, ApiError> {
        self.request("CircuitDelete", &json!({"base_revision":base}), false)?;
        let owner = owner(ctx)?;
        let mut tx = self.begin(ctx).await?;
        circuit(&mut tx, id, owner).await?;
        let revision:Option<i64>=tx_query!(&mut tx,query_scalar,fetch_optional,
   "UPDATE circuit_documents SET deleted=TRUE,revision=revision+1,updated_at=$1
   WHERE document_id=$2 AND owner_id=$3 AND deleted=FALSE AND revision=$4 AND revision<$5 RETURNING revision",
   now(),id,owner,base,MAX_REVISION).map_err(db_error)?;
        let revision = match revision {
            Some(r) => r,
            None => {
                return Err(revision_failure(
                    circuit(&mut tx, id, owner).await?.revision,
                    base,
                ));
            }
        };
        audit(&mut tx, owner, "CIRCUIT_DELETED", id).await?;
        tx.commit().await.map_err(internal)?;
        Ok(json!({"schema_version":"1.0","document_id":id,"deleted":true,"revision":revision}))
    }
    pub async fn get_circuit(
        &self,
        owner: &str,
        id: &str,
        revision: Option<i64>,
        v2: bool,
    ) -> Result<Value, ApiError> {
        if let Some(revision) = revision {
            self.request("CircuitDelete", &json!({"base_revision":revision}), false)?;
        }
        let db = self.db.reads();
        let row = owned_circuit(db.circuit_by_id(id).await.map_err(internal)?, owner)?;
        owned_project(
            db.project_by_id(&row.project_id).await.map_err(internal)?,
            owner,
        )?;
        let snapshot = db
            .circuit_revision(id, revision.unwrap_or(row.revision))
            .await
            .map_err(internal)?
            .ok_or_else(|| ApiError::new("REVISION_NOT_FOUND", 404))?;
        if !v2 && snapshot.graph_schema_version == "1.2" {
            return Err(ApiError::new("UNSUPPORTED_DOCUMENT_VERSION", 422));
        }
        Ok(circuit_document(&row, snapshot, v2))
    }
}
