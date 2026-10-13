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


def test_rpc_control_remains_available_while_configured_simulations_wait(monkeypatch):
    import grpc
    from threading import Event
    from contracts.generated import rpc_v2_pb2 as pb
    from contracts.generated import rpc_v2_pb2_grpc as rpc
    from hardware_service.station.virtual import VirtualHardwareStation

    monkeypatch.setenv('NETCIRCUIT_SIMULATION_WORKERS', '8')
    finish = Event()

    class WaitingSimulation(VirtualHardwareStation):
        def __init__(self, station_id):
            super().__init__(station_id)
            self.entered = Event()

        def start_execution(self, *, experiment_id=None):
            self.entered.set()
            if not finish.wait(5):
                raise RuntimeError('test request not released')
            return self._reply()

    waiting = [WaitingSimulation(f'v{index}') for index in range(8)]
    control = VirtualHardwareStation('control')
    server = entrypoint.build_server({station.station_id: station for station in [*waiting, control]})
    port = server.add_insecure_port('127.0.0.1:0')
    server.start()
    calls = []
    try:
        with grpc.insecure_channel(f'127.0.0.1:{port}') as channel:
            client = rpc.HardwareServiceStub(channel)
            for station in waiting:
                calls.append(client.StartExecution.future(pb.Target(station_id=station.station_id), timeout=6))
            assert all(station.entered.wait(2) for station in waiting)
            stopped = client.StopExecution(pb.Target(station_id='control'), timeout=1)
            assert stopped.accepted is True
            assert stopped.state == 'SAFE_STATE'
    finally:
        finish.set()
        for call in calls:
            try:
                call.result(timeout=6)
            except grpc.RpcError:
                pass  # A failed assertion closes the channel before cleanup.
        server.stop(0).wait()
