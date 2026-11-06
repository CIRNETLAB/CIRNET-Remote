//! Bounded, read-only public station authority queries.
use std::collections::BTreeSet;

use sqlx::{Postgres, QueryBuilder, Sqlite};

use super::{Db, DbError, Pool};

// The scheduler admits at most 50 queued experiments for a station. Keep the
// read bounded even if an invalid snapshot arrives before route validation.
const MAX_QUEUE_IDS: usize = 50;

#[derive(sqlx::FromRow)]
pub(crate) struct StationLease {
    pub station_id: String,
    pub quarantined: bool,
}

impl Db {
    pub(crate) async fn station_lease_snapshot(
        &self,
        stations: [&str; 2],
    ) -> Result<Vec<StationLease>, DbError> {
        // Only presence and quarantine are needed; never load private lease IDs
        // or treat an expired lease as released without the safety path.
        read_rows!(
            self,
            fetch_all,
            "SELECT DISTINCT station_id, quarantined FROM lab_leases WHERE station_id IN ($1, $2)",
            stations[0],
            stations[1],
        )
    }

    pub(crate) async fn owned_experiment_ids(
        &self,
        owner: &str,
        ids: &[String],
    ) -> Result<BTreeSet<String>, DbError> {
        if ids.is_empty() {
            return Ok(BTreeSet::new());
        }
        if ids.len() > MAX_QUEUE_IDS || owner.is_empty() {
            return Err(DbError::QueryFailed);
        }
        macro_rules! fetch {
            ($database:ty, $pool:expr) => {{
                let mut query = QueryBuilder::<$database>::new(
                    "SELECT experiment_id FROM lab_experiments WHERE owner_id = ",
                );
                query.push_bind(owner).push(" AND experiment_id IN (");
                let mut items = query.separated(", ");
                for id in ids {
                    items.push_bind(id.as_str());
                }
                items.push_unseparated(")");
                query.build_query_scalar().fetch_all($pool).await
            }};
        }
        let owned: Vec<String> = match &self.pool {
            Pool::Postgres(pool) => fetch!(Postgres, pool),
            Pool::Sqlite(pool) => fetch!(Sqlite, pool),
        }
        .map_err(|_| DbError::QueryFailed)?;
        Ok(owned.into_iter().collect())
    }
}
