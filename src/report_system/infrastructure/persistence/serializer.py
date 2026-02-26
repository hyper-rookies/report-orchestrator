from __future__ import annotations

import gzip
import json
from typing import Any

from report_system.domain.ingestion.models import ReportDataset, ReportRow


# ---------------------------------------------------------------------------
# jsonl.gz serialiser
# ---------------------------------------------------------------------------


def _row_to_dict(row: ReportRow) -> dict[str, Any]:
    return {
        "dimensions": {d.name: d.value for d in row.dimensions},
        "metrics": {m.name: m.value for m in row.metrics},
    }


def to_jsonl_gz(ds: ReportDataset) -> bytes:
    """Serialise a ReportDataset to gzip-compressed JSONL bytes.

    Each row becomes one JSON line.  An empty dataset produces an empty file.
    """
    lines = "\n".join(
        json.dumps(_row_to_dict(row), ensure_ascii=False) for row in ds.rows
    )
    return gzip.compress(lines.encode("utf-8"))


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def build_manifest(
    source: str,
    dataset_id: str,
    dt: str,
    start_date: str,
    end_date: str,
    ds: ReportDataset,
    writer: str = "local",
    status: str = "SUCCESS",
    error_message: str | None = None,
) -> dict[str, Any]:
    """Return a manifest dict describing a single raw partition write."""
    manifest: dict[str, Any] = {
        "schema_version": "v1",
        "source": source,
        "dataset_id": dataset_id,
        "dt": dt,
        "start_date": start_date,
        "end_date": end_date,
        "generated_at": ds.generated_at.isoformat(),
        "row_count": len(ds.rows),
        "status": status,
        "writer": writer,
    }
    if error_message is not None:
        manifest["error_message"] = error_message
    return manifest


def manifest_to_bytes(manifest: dict[str, Any]) -> bytes:
    """Serialise a manifest dict to UTF-8 JSON bytes."""
    return json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
