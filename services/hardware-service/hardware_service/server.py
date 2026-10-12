"""gRPC service entrypoint scaffold.

Generated Protobuf modules are intentionally not committed at this stage. Generate them from
`contracts/hardware/*.proto` once the RPC surface is stabilized. The station implementation is
usable and testable independently of generated transport code.
"""
from concurrent import futures
import grpc
import ipaddress


def build_server() -> grpc.Server:
    """Create an empty gRPC server shell.

    Service handlers are added when generated bindings become part of the build workflow.
    Keeping this server handler-free prevents the scaffold from pretending a hardware RPC is
    available before its generated contract and service implementation exist.
    """
    return grpc.server(futures.ThreadPoolExecutor(max_workers=4))


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
