"""Keep allocator output state local to each verification test."""
import os

import pytest


@pytest.fixture(autouse=True)
def preserve_artifact_environment():
    prefixes = ('CIRNET_', 'NETCIRCUIT_')
    before = {key: value for key, value in os.environ.items() if key.startswith(prefixes)}
    yield
    for key in list(os.environ):
        if key.startswith(prefixes) and key not in before:
            os.environ.pop(key, None)
    os.environ.update(before)
