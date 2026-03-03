from __future__ import annotations

import gzip
import json
from typing import Any, Iterator

from report_system.domain.ingestion.models import ReportDataset, ReportRow


# ---------------------------------------------------------------------------
# jsonl.gz serialiser
# ---------------------------------------------------------------------------


def _row_to_dict(row: ReportRow) -> dict[str, Any]:
    return {
        "dimensions": {d.name: d.value for d in row.dimensions},
        "metrics": {m.name: m.value for m in row.metrics},
    }


def write_jsonl_gz_stream(rows_iter: Iterator[ReportRow], dest_path: str) -> int:
    """Write rows from an iterator to a gzip-compressed JSONL file on disk.

    Each row is serialised as one JSON line.  The file is written
    incrementally so the full payload is never held in memory simultaneously.

    Args:
        rows_iter: Iterator of :class:`~report_system.domain.ingestion.models.ReportRow`.
        dest_path: Destination file path (overwritten if it exists).

    Returns:
        Total number of rows written.
    """
    count = 0
    with gzip.open(dest_path, "wb") as gz:
        for row in rows_iter:
            line = json.dumps(_row_to_dict(row), ensure_ascii=False) + "\n"
            gz.write(line.encode("utf-8"))
            count += 1
    return count


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


def build_stream_manifest(
    source: str,
    dataset_id: str,
    dt: str,
    start_date: str,
    end_date: str,
    row_count: int,
    generated_at_iso: str,
    writer: str = "s3_stream",
) -> dict[str, Any]:
    """Build a manifest dict for a streaming write (no ReportDataset available).

    Args:
        generated_at_iso: ISO-format timestamp string (UTC).
        row_count:        Number of rows written.
    """
    status = "SUCCESS" if row_count > 0 else "WARN_ZERO_ROWS"
    return {
        "schema_version": "v1",
        "source": source,
        "dataset_id": dataset_id,
        "dt": dt,
        "start_date": start_date,
        "end_date": end_date,
        "generated_at": generated_at_iso,
        "row_count": row_count,
        "status": status,
        "writer": writer,
    }


def manifest_to_bytes(manifest: dict[str, Any]) -> bytes:
    """Serialise a manifest dict to UTF-8 JSON bytes."""
    return json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
