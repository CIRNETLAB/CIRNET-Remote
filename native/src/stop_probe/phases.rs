//! Bounded, opt-in QPC timings for keyed HTTP Stop.

use std::{
    collections::HashMap,
    io::{self, Write},
    sync::{Arc, Mutex},
};

use serde::Serialize;
#[cfg(test)]
use serde_json::Value;

use super::{CLOCK, identity, qpc_ns};

const PHASES_ENV: &str = "CIRNET_NATIVE_REMOTE_STOP_PHASES";
const MAX_PHASE_RECORDS: usize = 1024;
const VERSION: &str = "stage4-explicit-stop-phases-v1";

pub(super) fn enabled(
    variables: &HashMap<String, String>,
    stop_probe: bool,
) -> Result<bool, &'static str> {
    match variables.get(PHASES_ENV).map(String::as_str) {
        None | Some("0") => Ok(false),
        Some("1") if stop_probe => Ok(true),
        Some("1") => Err("Loaded Stop phase diagnostics require the Stop probe"),
        _ => Err("Invalid loaded Stop phase diagnostics setting"),
    }
}

#[derive(Clone, Copy)]
pub(crate) enum Phase {
    PostAckReadStart,
    PostAckReadEnd,
    CommandReturned,
    SnapshotStart,
    SnapshotEnd,
    OperationSaveStart,
    OperationBeginReturned,
    OperationCasReturned,
    OperationCommitReturned,
    ResponseConstructed,
}

#[derive(Clone, Default, Serialize)]
struct Record {
    experiment_id: String,
    started_ns: u64,
    post_ack_read_start_ns: Option<u64>,
    post_ack_read_end_ns: Option<u64>,
    command_returned_ns: Option<u64>,
    snapshot_start_ns: Option<u64>,
    snapshot_end_ns: Option<u64>,
    operation_save_start_ns: Option<u64>,
    operation_begin_returned_ns: Option<u64>,
    operation_cas_returned_ns: Option<u64>,
    operation_commit_returned_ns: Option<u64>,
    response_constructed_ns: Option<u64>,
}

#[derive(Clone)]
pub(crate) struct StopPhaseTrace(Arc<Mutex<Record>>);

impl StopPhaseTrace {
    fn mark_at(&self, phase: Phase, timestamp: Option<u64>) {
        let Some(timestamp) = timestamp.filter(|value| *value > 0) else {
            return;
        };
        let Ok(mut record) = self.0.lock() else {
            return;
        };
        let field = match phase {
            Phase::PostAckReadStart => &mut record.post_ack_read_start_ns,
            Phase::PostAckReadEnd => &mut record.post_ack_read_end_ns,
            Phase::CommandReturned => &mut record.command_returned_ns,
            Phase::SnapshotStart => &mut record.snapshot_start_ns,
            Phase::SnapshotEnd => &mut record.snapshot_end_ns,
            Phase::OperationSaveStart => &mut record.operation_save_start_ns,
            Phase::OperationBeginReturned => &mut record.operation_begin_returned_ns,
            Phase::OperationCasReturned => &mut record.operation_cas_returned_ns,
            Phase::OperationCommitReturned => &mut record.operation_commit_returned_ns,
            Phase::ResponseConstructed => &mut record.response_constructed_ns,
        };
        field.get_or_insert(timestamp);
    }
}

pub(crate) fn mark(trace: Option<&StopPhaseTrace>, phase: Phase) {
    if let Some(trace) = trace {
        trace.mark_at(phase, qpc_ns());
    }
}

#[derive(Default)]
pub(super) struct PhaseBuffer(Mutex<Pending>);

#[derive(Default)]
struct Pending {
    records: Vec<StopPhaseTrace>,
    discarded: u64,
    closed: bool,
}

#[derive(Serialize)]
struct Receipt {
    version: &'static str,
    clock: &'static str,
    discarded: u64,
    records: Vec<Record>,
}

impl PhaseBuffer {
    pub(super) fn begin(&self, experiment_id: &str) -> Option<StopPhaseTrace> {
        self.begin_at(experiment_id, qpc_ns())
    }

    fn begin_at(&self, experiment_id: &str, timestamp: Option<u64>) -> Option<StopPhaseTrace> {
        let mut pending = self.0.lock().ok()?;
        if pending.closed {
            return None;
        }
        let started_ns = timestamp.filter(|value| *value > 0);
        let Some(started_ns) = started_ns
            .filter(|_| identity(experiment_id) && pending.records.len() < MAX_PHASE_RECORDS)
        else {
            pending.discarded = pending.discarded.saturating_add(1);
            return None;
        };
        let trace = StopPhaseTrace(Arc::new(Mutex::new(Record {
            experiment_id: experiment_id.to_owned(),
            started_ns,
            ..Record::default()
        })));
        pending.records.push(trace.clone());
        Some(trace)
    }

    fn take(&self) -> io::Result<Receipt> {
        let (records, discarded) = {
            let mut pending = self
                .0
                .lock()
                .map_err(|_| io::Error::other("Stop phase buffer"))?;
            if pending.closed {
                return Err(io::Error::other("Stop phase buffer already closed"));
            }
            pending.closed = true;
            (std::mem::take(&mut pending.records), pending.discarded)
        };
        let records = records
            .iter()
            .map(|trace| {
                trace
                    .0
                    .lock()
                    .map(|record| record.clone())
                    .map_err(|_| io::Error::other("Stop phase record"))
            })
            .collect::<io::Result<_>>()?;
        Ok(Receipt {
            version: VERSION,
            clock: CLOCK,
            discarded,
            records,
        })
    }

    pub(super) fn write(&self, mut writer: impl Write) -> io::Result<()> {
        let receipt = self.take()?;
        serde_json::to_writer(&mut writer, &receipt).map_err(io::Error::other)?;
        writer.write_all(b"\n")?;
        writer.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "11111111111111111111111111111111";

    #[test]
    fn explicit_phase_config_requires_loaded_stop_probe() {
        let mut variables = HashMap::new();
        assert!(!enabled(&variables, false).unwrap());
        assert!(!enabled(&variables, true).unwrap());
        variables.insert(PHASES_ENV.into(), "0".into());
        assert!(!enabled(&variables, true).unwrap());
        variables.insert(PHASES_ENV.into(), "1".into());
        assert!(enabled(&variables, false).is_err());
        assert!(enabled(&variables, true).unwrap());
        variables.insert(PHASES_ENV.into(), "true".into());
        assert!(enabled(&variables, true).is_err());
    }

    #[test]
    fn phase_receipt_has_no_samples_for_missing_or_invalid_start_and_keeps_missing_fields() {
        let buffer = PhaseBuffer::default();
        assert!(buffer.begin_at(ID, None).is_none());
        assert!(buffer.begin_at(ID, Some(0)).is_none());
        assert!(buffer.begin_at("invalid", Some(1)).is_none());
        let trace = buffer.begin_at(ID, Some(10)).unwrap();
        trace.mark_at(Phase::SnapshotStart, None);
        trace.mark_at(Phase::SnapshotStart, Some(0));
        trace.mark_at(Phase::SnapshotStart, Some(11));
        trace.mark_at(Phase::SnapshotStart, Some(12));
        let mut output = Vec::new();
        buffer.write(&mut output).unwrap();
        let receipt: Value = serde_json::from_slice(&output).unwrap();
        assert_eq!(receipt["version"], "stage4-explicit-stop-phases-v1");
        assert_eq!(receipt["clock"], CLOCK);
        assert_eq!(receipt["discarded"], 3);
        assert_eq!(receipt["records"][0]["experiment_id"], ID);
        assert_eq!(receipt["records"][0]["started_ns"], 10);
        assert_eq!(receipt["records"][0]["snapshot_start_ns"], 11);
        assert!(receipt["records"][0]["response_constructed_ns"].is_null());
        assert!(buffer.begin_at(ID, Some(20)).is_none());
    }

    #[test]
    fn phase_buffer_is_bounded_and_exposes_writer_failure() {
        struct Broken;
        impl Write for Broken {
            fn write(&mut self, _: &[u8]) -> io::Result<usize> {
                Err(io::ErrorKind::BrokenPipe.into())
            }
            fn flush(&mut self) -> io::Result<()> {
                Ok(())
            }
        }
        let buffer = PhaseBuffer::default();
        for _ in 0..MAX_PHASE_RECORDS {
            assert!(buffer.begin_at(ID, Some(1)).is_some());
        }
        assert!(buffer.begin_at(ID, Some(1)).is_none());
        assert_eq!(buffer.take().unwrap().discarded, 1);
        let broken = PhaseBuffer::default();
        assert!(broken.begin_at(ID, Some(1)).is_some());
        assert!(broken.write(Broken).is_err());
    }
}
