"""Validate canonical Lab contracts using explicit, non-coercing profiles."""
from .registry import validate_contract


def validate(name: str, value: dict, *, profile: str = "transport") -> dict:
    """Return detached validated data; structural preserves historical numerics."""
    return validate_contract(name, value, profile)
