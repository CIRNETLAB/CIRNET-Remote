"""Local-only hardware RPC v2 server. Generate bindings before startup."""
from concurrent import futures
import grpc
import ipaddress


def build_server(stations=None) -> grpc.Server:
    from hardware_service.generated import rpc_v2_pb2 as pb
    from hardware_service.generated import rpc_v2_pb2_grpc as rpc
    from hardware_service.rpc import LifecycleRpc
    from hardware_service.station.virtual import VirtualHardwareStation
    from hardware_service.station.physical import PhysicalHardwareStation
    if stations is None:
        stations = {'virtual-station-01': VirtualHardwareStation('virtual-station-01'),
                    'physical-station-01': PhysicalHardwareStation('physical-station-01')}
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    rpc.add_HardwareServiceServicer_to_server(LifecycleRpc(stations, pb), server)
    return server


def serve(address: str = "127.0.0.1:50051") -> None:
    if not address.startswith('unix:'):
        host = address.rsplit(':', 1)[0].strip('[]')
        if host != 'localhost':
            try:
                local = ipaddress.ip_address(host).is_loopback
            except ValueError:
                local = False
            if not local:
                raise ValueError('Hardware RPC must bind to a local-only address')
    server = build_server()
    try:
        server.add_insecure_port(address)
        server.start()
        server.wait_for_termination()
    finally:
        server.stop(0).wait()

if __name__ == "__main__":
    serve()
