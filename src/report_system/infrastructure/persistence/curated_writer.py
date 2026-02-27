"""Curated-layer utilities.

Parquet serialisation has moved to Athena CTAS
(:mod:`report_system.infrastructure.athena.ctas`).

This module retains only :func:`read_raw_jsonl_gz`, which is used by local
smoke-test scripts to inspect or validate raw files without an API call.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any


def read_raw_jsonl_gz(path: Path) -> list[dict[str, Any]]:
    """Read a gzip-compressed JSONL file and return a list of parsed dicts.

    Returns an empty list for empty files.
    """
    with gzip.open(path, "rb") as f:
        content = f.read().decode("utf-8")
    if not content.strip():
        return []
    return [json.loads(line) for line in content.splitlines() if line.strip()]
