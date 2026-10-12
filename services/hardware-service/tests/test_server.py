import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from hardware_service import server as entrypoint


class ServerLifecycle:
    """Replace the blocking/native RPC lifecycle while exercising serve's cleanup."""

    def __init__(self, interrupted):
        self.interrupted = interrupted
        self.stop_grace = None
        self.stop_waited = False

    def add_insecure_port(self, address):
        return 50051

    def start(self):
        pass

    def wait_for_termination(self):
        if self.interrupted:
            raise KeyboardInterrupt

    def stop(self, grace):
        self.stop_grace = grace
        return self

    def wait(self):
        self.stop_waited = True


@pytest.mark.parametrize('interrupted', [False, True])
def test_serve_releases_server_after_termination_or_interrupt(monkeypatch, interrupted):
    server = ServerLifecycle(interrupted)
    monkeypatch.setattr(entrypoint, 'build_server', lambda: server)
    if interrupted:
        with pytest.raises(KeyboardInterrupt):
            entrypoint.serve()
    else:
        entrypoint.serve()
    assert server.stop_grace == 0
    assert server.stop_waited is True


def test_rpc_server_refuses_public_bind_before_starting(monkeypatch):
    server = ServerLifecycle(False)
    monkeypatch.setattr(entrypoint, 'build_server', lambda: server)
    with pytest.raises(ValueError, match='local'):
        entrypoint.serve('0.0.0.0:50051')
    assert server.stop_grace is None
