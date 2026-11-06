"""Select the configured preview route after the endpoint validates the graph."""
from cirnet_sim.backends import SimulationError, preview_physical_graph

from app.services.hardware_client import GatewayError


def preview_graph(graph, *, configuration, gateway):
    if configuration.hardware_preview:
        try:
            result = gateway.preview(graph)
        except GatewayError as error:
            raise SimulationError(error.code) from None
        if result is not None:
            return result
    return preview_physical_graph(graph, backend_id=configuration.simulation_backend)
