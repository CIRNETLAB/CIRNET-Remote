"""Shared server concurrency settings for the API and Hardware Service."""
import os


def simulation_worker_count(value: int | str | None = None) -> int:
    """Read or validate the positive simulation worker count, defaulting to four."""
    if value is None:
        value = os.getenv('NETCIRCUIT_SIMULATION_WORKERS', '4')
    if type(value) is int:
        workers = value
    elif isinstance(value, str) and value.strip().isascii() and value.strip().isdigit():
        workers = int(value.strip())
    else:
        raise ValueError('NETCIRCUIT_SIMULATION_WORKERS must be a positive integer')
    if workers <= 0:
        raise ValueError('NETCIRCUIT_SIMULATION_WORKERS must be a positive integer')
    return workers
