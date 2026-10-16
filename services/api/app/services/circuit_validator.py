from pydantic import ValidationError
from typing import Any
from app.models.circuit import CircuitGraph
from contracts.physical_mounting import validate_physical_design


def validate_circuit_graph(payload: Any) -> tuple[bool, str, str]:
    if isinstance(payload, dict) and isinstance(payload.get('schema_version'), str) and payload['schema_version'] not in ('1.0', '1.1'):
        return False, "UNSUPPORTED_SCHEMA_VERSION", f"Unsupported Circuit Graph schema: {payload['schema_version']}"
    try:
        graph = CircuitGraph.model_validate(payload)
    except ValidationError as exc:
        first = exc.errors()[0]
        location = ".".join(str(part) for part in first.get("loc", ()))
        return False, "SCHEMA_VALIDATION_ERROR", f"{location}: {first.get('msg', 'invalid value')}"
    if graph.schema_version not in ("1.0", "1.1"):
        return False, "UNSUPPORTED_SCHEMA_VERSION", f"Unsupported Circuit Graph schema: {graph.schema_version}"
    try:
        validate_physical_design(graph.model_dump(exclude_unset=True))
    except (ValueError, TypeError, KeyError) as exc:
        return False, "SCHEMA_VALIDATION_ERROR", str(exc)
    return True, "OK", "Circuit Graph is structurally valid."
