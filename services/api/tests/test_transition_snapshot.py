"""Verify the lifecycle event's fresh, owner-scoped persisted snapshot."""

from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, event, update
from sqlalchemy.sql import Select

from app.services.experiments import ExperimentManager
from app.services.persistence import Repository


@pytest.mark.parametrize("claim_after_commit", [False, True])
def test_transition_publishes_one_fresh_owner_and_payload_snapshot(
    tmp_path, monkeypatch, claim_after_commit,
):
    database = "sqlite:///" + (tmp_path / "notification.db").as_posix()
    repository = Repository(database)
    independent = create_engine(database)
    published = []
    reads = []
    identity, previous_owner = "notify-experiment", "guest"
    current_owner = "student" if claim_after_commit else previous_owner
    state = "COMPLETE" if claim_after_commit else "QUEUED"
    manager = ExperimentManager(
        repository, SimpleNamespace(), submit=lambda *_: pytest.fail("unexpected submission"),
        emit=lambda owner, payload: published.append((owner, payload)),
        public_projection=lambda record, owner: {**record, "projected_for": owner},
    )

    def count_reads(_connection, statement, *_):
        if isinstance(statement, Select) and any(
            table is repository.experiments for table in statement.get_final_froms()
        ):
            reads.append(tuple(statement.selected_columns.keys()))

    try:
        repository.create_experiment(previous_owner, {
            "experiment_id": identity, "station_id": "station", "state": "CREATED",
            "state_history": ["CREATED"], "revision": 0, "queue_position": 99,
            "_private": "never published", "capture": {"samples": []},
        })
        if not claim_after_commit:
            manager.queues["station"].extend(("earlier", identity))

        save_experiment = repository.save_experiment

        def save_then_claim(record):
            save_experiment(record)
            with independent.begin() as connection:
                connection.execute(
                    update(repository.experiments)
                    .where(repository.experiments.c.experiment_id == identity)
                    .values(owner_id=current_owner, payload={**record, "revision": 2})
                )

        with monkeypatch.context() as patch:
            if claim_after_commit:
                patch.setattr(repository, "save_experiment", save_then_claim)
            event.listen(repository.engine, "before_execute", count_reads)
            try:
                committed = manager._transition(identity, state)
            finally:
                event.remove(repository.engine, "before_execute", count_reads)

        assert committed["revision"] == 1
        assert len(reads) == 2, reads
        assert reads[-1] == ("owner_id", "payload")
        owner, notice = published.pop()
        assert not published
        assert owner == current_owner and notice["type"] == "experiment.updated"
        expected = manager.get(identity, current_owner)
        assert notice["experiment"] == expected
        assert expected["revision"] == (2 if claim_after_commit else 1)
        assert expected["queue_position"] == (None if claim_after_commit else 2)
        assert expected["projected_for"] == current_owner
        assert expected["capture"] is None and "_private" not in expected
        if claim_after_commit:
            with pytest.raises(PermissionError, match="^FORBIDDEN$"):
                manager.get(identity, previous_owner)
    finally:
        # The view test deliberately leaves one fake queue slot. Retire that
        # fixture before manager shutdown so it cannot start a control RPC.
        record = repository.get_experiment(identity)
        if record["state"] == "QUEUED":
            repository.save_experiment({**record, "state": "COMPLETE"})
        manager.queues.clear()
        manager.close()
        independent.dispose()
        repository.close()
