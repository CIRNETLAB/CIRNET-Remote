"""Regression coverage for Hardware RPC admission and cancellation reads."""

from threading import Event
from types import SimpleNamespace

import pytest

from app.services.execution_errors import Cancelled
from app.services.experiments import ExperimentManager
from app.services.hardware_client import GatewayError
from app.services.persistence import Repository


@pytest.mark.parametrize(("scenario", "expected"), [
    ("active", ["read", "session", "rpc", "read", "session"]),
    ("without_session_check", ["read", "rpc"]),
    ("cancel_before", []),
    ("cancel_after", ["read", "session", "rpc"]),
    ("expire_before", ["read", "session", "owner", "stop"]),
    ("expire_after", ["read", "session", "rpc", "read", "session", "owner", "stop"]),
    ("rpc_rejected", ["read", "session", "rpc"]),
])
def test_hardware_call_checks_cancellation_without_a_duplicate_routing_read(
    tmp_path, monkeypatch, scenario, expected,
):
    identity, owner = "rpc-read-test", "student"
    trace = []
    cancel = Event()
    if scenario == "cancel_before":
        cancel.set()
    active = scenario != "expire_before"
    repository = Repository("sqlite:///" + (tmp_path / "rpc-read.db").as_posix())
    reply = {"accepted": True, "status": "SAFE"}

    def session_active(session):
        assert session == "controller"
        trace.append("session")
        return active

    def rpc(station, experiment, method):
        nonlocal active
        assert (station, experiment, method) == ("station", identity, "read_runtime_safety")
        trace.append("rpc")
        if scenario == "cancel_after":
            cancel.set()
        if scenario == "expire_after":
            active = False
        if scenario == "rpc_rejected":
            return {"accepted": False, "code": "PROTOCOL_MISMATCH"}
        return reply

    def stop(experiment, current_owner, code):
        assert (experiment, current_owner, code) == (identity, owner, "SESSION_EXPIRED")
        trace.append("stop")

    manager = ExperimentManager(
        repository, SimpleNamespace(call=rpc),
        control_session_active=None if scenario == "without_session_check" else session_active,
    )
    try:
        repository.create_experiment(owner, {
            "experiment_id": identity, "station_id": "station", "state": "CREATED",
            "_control_session_id": "controller",
        })
        manager.cancel[identity] = cancel
        get_experiment = repository.get_experiment
        get_owner = repository.owner

        def read(experiment):
            trace.append("read")
            return get_experiment(experiment)

        def owner_of(experiment):
            trace.append("owner")
            return get_owner(experiment)

        with monkeypatch.context() as patch:
            patch.setattr(repository, "get_experiment", read)
            patch.setattr(repository, "owner", owner_of)
            patch.setattr(manager, "stop", stop)
            if scenario in {"active", "without_session_check"}:
                assert manager._call(identity, "read_runtime_safety") is reply
            elif scenario == "rpc_rejected":
                with pytest.raises(GatewayError, match="^PROTOCOL_MISMATCH$"):
                    manager._call(identity, "read_runtime_safety")
            else:
                with pytest.raises(Cancelled):
                    manager._call(identity, "read_runtime_safety")
            assert trace == expected
    finally:
        manager.close()
        repository.close()
