//! Durable operation identity and atomic experiment creation.
use serde_json::Value;
use sqlx::types::Json;

use super::{Cas, ExperimentRepository, MAX_REVISION, RuntimeError, revision, write_projection};
use crate::db::write::{Tx, tx_execute, tx_query};
use crate::db::{DbError, Pool, WriteTx};

#[derive(Debug, Clone, Copy)]
pub struct OperationKey<'a> {
    pub owner_id: &'a str,
    pub kind: &'a str,
    pub scope: &'a str,
    pub key: &'a str,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OperationRow {
    pub fingerprint: String,
    #[sqlx(json)]
    pub payload: Value,
}

#[derive(Debug, Clone, Copy)]
pub struct OperationInsert<'a> {
    pub identity: OperationKey<'a>,
    pub fingerprint: &'a str,
    pub payload: &'a Value,
}

#[derive(Debug, Clone, Copy)]
pub struct OperationUpdate<'a> {
    pub identity: OperationKey<'a>,
    pub expected_revision: i64,
    pub payload: &'a Value,
}

#[derive(Debug, Clone, Copy)]
pub struct Create<'a> {
    pub owner_id: &'a str,
    pub payload: &'a Value,
    pub operation: Option<OperationInsert<'a>>,
}

const OPERATION_SELECT: &str = "SELECT fingerprint, payload FROM lab_operations
    WHERE owner_id = $1 AND kind = $2 AND scope = $3 AND operation_key = $4";

impl ExperimentRepository {
    pub async fn operation(
        &self,
        key: OperationKey<'_>,
    ) -> Result<Option<OperationRow>, RuntimeError> {
        Ok(read_rows!(
            self.db.reads(),
            fetch_optional,
            OPERATION_SELECT,
            key.owner_id,
            key.kind,
            key.scope,
            key.key,
        )?)
    }

    pub async fn operation_in(
        &self,
        tx: &mut WriteTx,
        key: OperationKey<'_>,
    ) -> Result<Option<OperationRow>, RuntimeError> {
        let sql = match &tx.inner {
            Tx::Postgres(_) => format!("{OPERATION_SELECT} FOR NO KEY UPDATE"),
            Tx::Sqlite(_) => OPERATION_SELECT.to_owned(),
        };
        Ok(tx_query!(
            tx,
            query_as,
            fetch_optional,
            &sql,
            key.owner_id,
            key.kind,
            key.scope,
            key.key,
        )?)
    }

    pub async fn insert_operation_in(
        &self,
        tx: &mut WriteTx,
        operation: OperationInsert<'_>,
    ) -> Result<bool, RuntimeError> {
        let key = operation.identity;
        let payload = clean_operation(key, operation.payload)?;
        let changed = tx_execute!(
            tx,
            "INSERT INTO lab_operations (owner_id, kind, scope, operation_key, fingerprint, payload)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (owner_id, kind, scope, operation_key) DO NOTHING",
            key.owner_id, key.kind, key.scope, key.key, operation.fingerprint, Json(&payload),
        )?;
        Ok(changed == 1)
    }

    pub async fn update_operation_in(
        &self,
        tx: &mut WriteTx,
        update: OperationUpdate<'_>,
    ) -> Result<Cas, RuntimeError> {
        let key = update.identity;
        let Some(current) = self.operation_in(tx, key).await? else {
            return Ok(Cas::Missing);
        };
        if operation_revision(&current.payload)? != update.expected_revision {
            return Ok(Cas::Stale);
        }
        let payload = clean_operation(key, update.payload)?;
        if operation_revision(&payload)? <= update.expected_revision {
            return Err(RuntimeError::InvalidOperation);
        }
        let rows = tx_execute!(
            tx,
            "UPDATE lab_operations SET payload = $5
             WHERE owner_id = $1 AND kind = $2 AND scope = $3 AND operation_key = $4",
            key.owner_id,
            key.kind,
            key.scope,
            key.key,
            Json(&payload),
        )?;
        if rows != 1 {
            return Err(RuntimeError::InvalidOperation);
        }
        Ok(Cas::Applied)
    }

    /// The caller holds the live session fence and any assignment snapshot
    /// fence. The caller must roll back this transaction on error.
    pub async fn create_in(
        &self,
        tx: &mut WriteTx,
        request: Create<'_>,
    ) -> Result<(), RuntimeError> {
        let id = request.payload["experiment_id"]
            .as_str()
            .filter(|id| !id.is_empty())
            .ok_or(RuntimeError::InvalidRecord)?;
        if request.owner_id.is_empty() {
            return Err(RuntimeError::InvalidRecord);
        }
        revision(request.payload)?;
        let document = document_reference(request.payload)?;
        if let Some((document_id, revision)) = document {
            lock_live_document(tx, request.owner_id, document_id, revision).await?;
        }
        if let Some(operation) = request.operation {
            let key = operation.identity;
            if key.owner_id != request.owner_id
                || key.kind != "create"
                || !key.scope.is_empty()
                || operation.payload["experiment_id"].as_str() != Some(id)
                || operation.payload["status"] != "APPLIED"
            {
                return Err(RuntimeError::InvalidOperation);
            }
            if !self.insert_operation_in(tx, operation).await? {
                return Err(RuntimeError::OperationConflict);
            }
        }
        tx_execute!(
            tx,
            "INSERT INTO lab_experiments (experiment_id, owner_id, payload) VALUES ($1, $2, $3)",
            id,
            request.owner_id,
            Json(request.payload),
        )
        .map_err(|error| {
            if error
                .as_database_error()
                .is_some_and(|error| error.is_unique_violation())
            {
                RuntimeError::ExperimentConflict
            } else {
                error.into()
            }
        })?;
        write_projection(tx, id, request.payload, true).await?;
        if let Some((document_id, revision)) = document {
            tx_execute!(
                tx,
                "INSERT INTO experiment_document_refs (experiment_id, document_id, revision)
                 VALUES ($1, $2, $3)",
                id,
                document_id,
                revision,
            )?;
        }
        Ok(())
    }
}

fn clean_operation(key: OperationKey<'_>, payload: &Value) -> Result<Value, RuntimeError> {
    let mut data = payload
        .as_object()
        .cloned()
        .ok_or(RuntimeError::InvalidOperation)?;
    if key.owner_id.is_empty()
        || key.kind.is_empty()
        || key.key.is_empty()
        || data.get("operation_key").and_then(Value::as_str) != Some(key.key)
        || data
            .get("kind")
            .is_some_and(|kind| kind.as_str() != Some(key.kind))
        || (!key.scope.is_empty()
            && data.get("experiment_id").and_then(Value::as_str) != Some(key.scope))
    {
        return Err(RuntimeError::InvalidOperation);
    }
    operation_revision(payload)?;
    data.retain(|key, _| !key.starts_with('_') && key != "experiment");
    Ok(Value::Object(data))
}

fn operation_revision(payload: &Value) -> Result<i64, RuntimeError> {
    payload["revision"]
        .as_i64()
        .filter(|revision| (0..=MAX_REVISION).contains(revision))
        .ok_or(RuntimeError::InvalidOperation)
}

fn document_reference(payload: &Value) -> Result<Option<(&str, i64)>, RuntimeError> {
    let Some(reference) = payload
        .get("_document_reference")
        .filter(|value| !value.is_null())
    else {
        return Ok(None);
    };
    let id = reference["document_id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or(RuntimeError::InvalidRecord)?;
    let revision = reference["revision"]
        .as_i64()
        .filter(|revision| (1..=MAX_REVISION).contains(revision))
        .ok_or(RuntimeError::InvalidRecord)?;
    Ok(Some((id, revision)))
}

async fn lock_live_document(
    tx: &mut WriteTx,
    owner: &str,
    id: &str,
    revision: i64,
) -> Result<(), RuntimeError> {
    // Acquire the project before the child, as project retirement does.
    // The document and its immutable revision are then rechecked in this tx.
    let (parent_lock, child_lock) = match &tx.inner {
        Tx::Postgres(_) => (" FOR NO KEY UPDATE OF p", " FOR NO KEY UPDATE OF d"),
        Tx::Sqlite(_) => ("", ""),
    };
    let sql = format!(
        "SELECT p.project_id FROM projects p
         WHERE p.project_id = (SELECT project_id FROM circuit_documents WHERE document_id = $1)
           AND p.owner_id = $2 AND p.deleted = FALSE{parent_lock}"
    );
    let parent: Option<String> = tx_query!(tx, query_scalar, fetch_optional, &sql, id, owner)?;
    let Some(parent) = parent else {
        return Err(RuntimeError::DocumentUnavailable);
    };
    let sql = format!(
        "SELECT d.document_id FROM circuit_documents d
         WHERE d.document_id = $1 AND d.project_id = $2 AND d.owner_id = $3 AND d.deleted = FALSE
           AND EXISTS (
               SELECT 1 FROM circuit_revisions r
               WHERE r.document_id = d.document_id AND r.revision = $4
           ){child_lock}"
    );
    let current: Option<String> = tx_query!(
        tx,
        query_scalar,
        fetch_optional,
        &sql,
        id,
        parent,
        owner,
        revision,
    )?;
    if current.is_none() {
        return Err(RuntimeError::DocumentUnavailable);
    }
    Ok(())
}
