//! Station discovery and owner-scoped queue projection.
use std::{future::Future, sync::Arc};

use cirnet_contracts_native::validation::{Registry, ValidationError};
use serde_json::{Value, json};

use crate::{
    compiler::capabilities_json,
    db::{Db, StationLease},
    error::ApiError,
    hardware::HardwareClient,
};

const TARGETS: [(&str, &str); 2] = [
    ("virtual-station-01", "simulation"),
    ("physical-station-01", "hardware"),
];
const PUBLIC_SCHEMA: &str =
    "https://cirnet.local/contracts/public/api/1.0/schema.json#/$defs/PublicStationCapabilities";

type Result<T> = std::result::Result<T, ApiError>;

pub struct StationService {
    registry: Arc<Registry>,
    hardware: HardwareClient,
    db: Db,
    public_fields: Vec<String>,
}

impl StationService {
    pub fn new(registry: Arc<Registry>, hardware: HardwareClient, db: Db) -> Result<Self> {
        let schema = registry
            .load_schema(PUBLIC_SCHEMA)
            .map_err(|_| internal())?;
        let fields = schema["properties"].as_object().ok_or_else(internal)?;
        let public_fields = fields.keys().cloned().collect();
        Ok(Self {
            registry,
            hardware,
            db,
            public_fields,
        })
    }

    pub async fn list(&self) -> Result<Value> {
        // Observe both targets before one shared durable lease snapshot.
        let virtual_capabilities = self.observe(TARGETS[0].0).await?;
        let physical_capabilities = self.observe(TARGETS[1].0).await?;
        let leases = self.leases([TARGETS[0].0, TARGETS[1].0]).await?;
        let mut stations = Vec::with_capacity(TARGETS.len());
        for ((station, _), raw) in TARGETS
            .into_iter()
            .zip([virtual_capabilities, physical_capabilities])
        {
            let capabilities = self.public_capabilities(station, raw, &leases)?;
            let state = if capabilities["available"] != true {
                "unavailable"
            } else if busy(station, &leases) {
                "busy"
            } else {
                "ready"
            };
            stations.push(self.response(
                "StationDescriptor",
                &json!({
                    "station_id": station, "mode": capabilities["mode"], "state": state,
                    "capabilities": capabilities,
                }),
            )?);
        }
        Ok(Value::Array(stations))
    }

    pub async fn capabilities(&self, station: &str) -> Result<Value> {
        let raw = self.observe(station).await?;
        let leases = self.leases([station, station]).await?;
        self.public_capabilities(station, raw, &leases)
    }

    pub async fn queue(
        &self,
        station: &str,
        owner: &str,
        snapshot: impl Future<Output = Result<Vec<String>>>,
    ) -> Result<Value> {
        // Keep the reference order of authority: reject unknown targets before
        // sampling scheduler state. Only expose IDs verified against the owner
        // in the live database, including after guest claim or ownership change.
        self.capabilities(station).await?;
        let queue = snapshot.await?;
        let own = self
            .db
            .owned_experiment_ids(owner, &queue)
            .await
            .map_err(|_| unavailable())?;
        let leases = self.leases([station, station]).await?;
        let own_positions: Vec<_> = queue
            .iter()
            .enumerate()
            .filter(|(_, id)| own.contains(*id))
            .map(|(index, id)| json!({"experiment_id": id, "position": index + 1}))
            .collect();
        self.response(
            "QueueState",
            &json!({
                "schema_version": "1.0", "station_id": station, "queued_count": queue.len(),
                "busy": busy(station, &leases), "own_positions": own_positions,
            }),
        )
    }

    async fn observe(&self, station: &str) -> Result<Value> {
        let (_, mode) = TARGETS
            .into_iter()
            .find(|(id, _)| *id == station)
            .ok_or_else(|| ApiError::new("NOT_FOUND", 404))?;
        match self.hardware.capabilities(station).await {
            Ok(caps) => self
                .registry
                .validate(
                    "StationCapabilities",
                    "transport",
                    &capabilities_json(&caps),
                )
                .map_err(invalid_capabilities),
            Err(_) => Ok(unavailable_capabilities(station, mode)),
        }
    }

    async fn leases(&self, stations: [&str; 2]) -> Result<Vec<StationLease>> {
        self.db
            .station_lease_snapshot(stations)
            .await
            .map_err(|_| unavailable())
    }

    fn public_capabilities(
        &self,
        station: &str,
        value: Value,
        leases: &[StationLease],
    ) -> Result<Value> {
        let mut public: serde_json::Map<String, Value> = self
            .public_fields
            .iter()
            .filter_map(|name| value.get(name).map(|field| (name.clone(), field.clone())))
            .collect();
        if leases
            .iter()
            .any(|lease| lease.station_id == station && lease.quarantined)
        {
            public.insert("available".into(), json!(false));
        }
        self.registry
            .validate(
                "PublicStationCapabilities",
                "transport",
                &Value::Object(public),
            )
            .map_err(invalid_capabilities)
    }

    fn response(&self, contract: &str, value: &Value) -> Result<Value> {
        self.registry
            .validate(contract, "transport", value)
            .map_err(|_| ApiError::new("RESPONSE_CONTRACT_MISMATCH", 500))
    }
}

fn busy(station: &str, leases: &[StationLease]) -> bool {
    leases.iter().any(|lease| lease.station_id == station)
}

fn unavailable_capabilities(station: &str, mode: &str) -> Value {
    let instrument = json!({"channels": 0, "runtime_reconfiguration_supported": false});
    json!({
        "schema_version": "1.0", "station_id": station, "mode": mode,
        "available": false, "virtual_digital": false, "virtual_analog": false,
        "physical_digital": false, "physical_analog_routing": false, "physical_execution_slots": 0,
        "topology_scan_supported": false, "safety_gate_supported": false, "guarded_run_supported": false,
        "component_resolution_modes": [],
        "instrument_capabilities": {"logic_analyzer": instrument, "oscilloscope": instrument, "generator": instrument},
        "routing_resources": [],
        "hardware_rpc_version": "2.0", "fpga_protocol_version": "UNAVAILABLE",
        "firmware_version": "UNAVAILABLE", "hardware_profile_version": "UNAVAILABLE",
    })
}

fn invalid_capabilities(error: ValidationError) -> ApiError {
    match error {
        ValidationError::Invalid(mut issue) => {
            issue.message = "The field does not match its declared contract.".into();
            ApiError::new("INVALID_CONTRACT", 422).with_issues(vec![json!(issue)])
        }
        _ => internal(),
    }
}

fn unavailable() -> ApiError {
    ApiError::new("UNAVAILABLE", 503)
}

fn internal() -> ApiError {
    ApiError::new("INTERNAL_ERROR", 500)
}
