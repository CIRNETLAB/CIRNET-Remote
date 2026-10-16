"""Shared orchestration cancellation, independent of manager and adapters."""

class Cancelled(Exception):
    pass
