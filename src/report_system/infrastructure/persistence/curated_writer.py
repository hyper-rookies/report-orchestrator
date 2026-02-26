from __future__ import annotations

import gzip
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from report_system.domain.curation.ports import CuratedWriteResult
from report_system.infrastructure.persistence.s3_key_builder import build_curated_prefix


# ---------------------------------------------------------------------------
# Raw-reader utility  (lives here for proximity with the curation pipeline)
# ---------------------------------------------------------------------------


def read_raw_jsonl_gz(path: Path) -> list[dict[str, Any]]:
    """Read a gzip-compressed JSONL file and return a list of parsed dicts.

    Returns an empty list for empty files.
    """
    with gzip.open(path, "rb") as f:
        content = f.read().decode("utf-8")
    if not content.strip():
        return []
    return [json.loads(line) for line in content.splitlines() if line.strip()]


# ---------------------------------------------------------------------------
# Shared manifest helper
# ---------------------------------------------------------------------------


def _build_curated_manifest(
    dataset_id: str,
    dt: str,
    row_count: int,
    generated_at: datetime,
    writer: str,
) -> bytes:
    manifest = {
        "schema_version": "v1",
        "dataset_id": dataset_id,
        "dt": dt,
        "generated_at": generated_at.isoformat(),
        "row_count": row_count,
        "status": "SUCCESS",
        "writer": writer,
    }
    return json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")


# ---------------------------------------------------------------------------
# Local filesystem writer
# ---------------------------------------------------------------------------


class LocalCuratedWriter:
    """Writes curated Parquet partitions to a local directory tree.

    Implements :class:`~report_system.domain.curation.ports.CuratedStoragePort`.

    Requires ``pyarrow``::

        pip install pyarrow

    Output path::

        {base_dir}/curated/{dataset_id}/dt={dt}/part-0000.parquet

    Overwrites existing files on each run (idempotent).
    """

    def __init__(self, base_dir: str) -> None:
        try:
            import pyarrow.parquet  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "pyarrow is required for curated Parquet output. "
                "Install it with: pip install pyarrow"
            ) from exc
        self._base = Path(base_dir)

    def write_parquet(
        self,
        dataset_id: str,
        dt: str,
        table: Any,
    ) -> CuratedWriteResult:
        """Write a pyarrow Table as a single Parquet file.

        Returns a :class:`CuratedWriteResult` describing what was written.
        """
        import pyarrow.parquet as pq

        key = build_curated_prefix(dataset_id, dt) + "part-0000.parquet"
        path = self._base / key
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(table, str(path))

        generated_at = datetime.now(tz=timezone.utc)
        return CuratedWriteResult(
            location=str(path),
            dataset_id=dataset_id,
            dt=dt,
            row_count=table.num_rows,
            status="SUCCESS",
            generated_at=generated_at,
        )


# ---------------------------------------------------------------------------
# S3 writer  (requires boto3 — lazy import; skipped entirely in dry-run mode)
# ---------------------------------------------------------------------------


class S3CuratedWriter:
    """Writes curated Parquet partitions to an S3 bucket.

    Implements :class:`~report_system.domain.curation.ports.CuratedStoragePort`.

    Requires ``pyarrow`` and ``boto3``::

        pip install pyarrow boto3

    S3 key layout::

        {prefix}/{dataset_id}/dt={dt}/part-0000.parquet
        {prefix}/{dataset_id}/dt={dt}/_manifest.json

    ``prefix`` defaults to ``"curated"``, matching the local writer's
    folder convention.

    Pass ``dry_run=True`` to print what *would* be uploaded without making
    any S3 API calls (boto3 is not imported in this mode).

    Any extra keyword arguments are forwarded to ``boto3.client("s3", ...)``,
    e.g. ``region_name``, ``endpoint_url`` for LocalStack.
    """

    def __init__(
        self,
        bucket: str,
        prefix: str = "curated",
        dry_run: bool = False,
        **boto3_kwargs: Any,
    ) -> None:
        # pyarrow is always needed (we serialise even in dry-run)
        try:
            import pyarrow.parquet  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "pyarrow is required for curated Parquet output. "
                "Install it with: pip install pyarrow"
            ) from exc

        self._bucket = bucket
        self._prefix = prefix.rstrip("/")
        self._dry_run = dry_run

        if not dry_run:
            try:
                import boto3  # noqa: PLC0415
            except ImportError as exc:
                raise RuntimeError(
                    "boto3 is required for S3 curated output. "
                    "Install it with: pip install boto3"
                ) from exc
            self._s3 = boto3.client("s3", **boto3_kwargs)
        else:
            self._s3 = None

    def write_parquet(
        self,
        dataset_id: str,
        dt: str,
        table: Any,
    ) -> CuratedWriteResult:
        """Serialise *table* to Parquet bytes and upload to S3.

        Also uploads a ``_manifest.json`` alongside the data file.
        In ``dry_run`` mode both uploads are skipped and the method prints
        what *would* have been written.
        """
        import pyarrow.parquet as pq

        parquet_key = f"{self._prefix}/{dataset_id}/dt={dt}/part-0000.parquet"
        manifest_key = f"{self._prefix}/{dataset_id}/dt={dt}/_manifest.json"
        location = f"s3://{self._bucket}/{parquet_key}"
        generated_at = datetime.now(tz=timezone.utc)

        # Serialise Parquet to an in-memory buffer (no temp files)
        buf = io.BytesIO()
        pq.write_table(table, buf)
        parquet_bytes = buf.getvalue()

        manifest_bytes = _build_curated_manifest(
            dataset_id=dataset_id,
            dt=dt,
            row_count=table.num_rows,
            generated_at=generated_at,
            writer="s3",
        )

        if self._dry_run:
            print(
                f"  [DRY-RUN] PUT s3://{self._bucket}/{parquet_key}"
                f"  ({len(parquet_bytes):,} bytes)"
            )
            print(f"  [DRY-RUN] PUT s3://{self._bucket}/{manifest_key}")
        else:
            try:
                self._s3.put_object(
                    Bucket=self._bucket, Key=parquet_key, Body=parquet_bytes
                )
                self._s3.put_object(
                    Bucket=self._bucket, Key=manifest_key, Body=manifest_bytes
                )
            except Exception as exc:
                raise RuntimeError(
                    f"S3 upload failed for {location}: {exc}"
                ) from exc

        return CuratedWriteResult(
            location=location,
            dataset_id=dataset_id,
            dt=dt,
            row_count=table.num_rows,
            status="SUCCESS",
            generated_at=generated_at,
        )
