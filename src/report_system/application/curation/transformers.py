"""Dataset registry — thin shim kept for import compatibility.

The transform logic (pyarrow) has been removed.
SQL SELECT bodies and the full dataset registry now live in:

    report_system.infrastructure.athena.ctas  (REGISTRY, _SELECT_REGISTRY)

This module re-exports :data:`REGISTRY` so existing imports continue to work.
"""
from report_system.infrastructure.athena.ctas import REGISTRY  # noqa: F401

__all__ = ["REGISTRY"]
