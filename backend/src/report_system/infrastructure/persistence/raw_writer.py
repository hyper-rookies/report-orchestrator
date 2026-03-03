from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any, Callable, Iterator

from report_system.domain.ingestion.models import ReportDataset, ReportRow
from report_system.domain.shared.time import utcnow
from report_system.infrastructure.persistence.s3_key_builder import build_raw_key
from report_system.infrastructure.persistence.serializer import (
    build_manifest,
    build_stream_manifest,
    manifest_to_bytes,
    to_jsonl_gz,
    write_jsonl_gz_stream,
)


# ---------------------------------------------------------------------------
# Shared write logic (backend-agnostic)
# ---------------------------------------------------------------------------


def _write_partition(
    put: Callable[[str, bytes], None],
    source: str,
    dataset_id: str,
    dt: str,
    ds: ReportDataset,
    start_date: str,
    end_date: str,
    writer: str,
) -> None:
    """Write data.jsonl.gz + _manifest.json for one partition (idempotent)."""
    put(build_raw_key(source, dataset_id, dt, "data.jsonl.gz"), to_jsonl_gz(ds))
    put(
        build_raw_key(source, dataset_id, dt, "_manifest.json"),
        manifest_to_bytes(
            build_manifest(
                source=source,
                dataset_id=dataset_id,
                dt=dt,
                start_date=start_date,
                end_date=end_date,
                ds=ds,
                writer=writer,
            )
        ),
    )


# ---------------------------------------------------------------------------
# Local filesystem writer  (no extra dependencies)
# ---------------------------------------------------------------------------


class LocalRawWriter:
    """Writes raw partitions to a local directory tree.

    Useful for development and unit testing without AWS credentials.
    Overwrites existing files on each run (idempotent).
    """

    def __init__(self, base_dir: str, source: str) -> None:
        self._base = Path(base_dir)
        self._source = source

    def _put(self, key: str, body: bytes) -> None:
        path = self._base / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)

    def write_raw(
        self,
        dataset_id: str,
        dt: str,
        ds: ReportDataset,
        start_date: str,
        end_date: str,
    ) -> None:
        _write_partition(self._put, self._source, dataset_id, dt, ds, start_date, end_date, writer="local")


# ---------------------------------------------------------------------------
# S3 writer  (requires boto3 — lazy import so package stays importable
#             without boto3 installed)
# ---------------------------------------------------------------------------


class S3RawWriter:
    """Writes raw partitions to an S3 bucket.

    Requires ``boto3`` which is NOT bundled with this project by default::

        pip install boto3

    Overwrites existing objects on each run (idempotent).
    """

    def __init__(self, bucket: str, source: str, **boto3_kwargs) -> None:
        try:
            import boto3  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for S3 storage. "
                "Install it with: pip install boto3"
            ) from exc

        self._bucket = bucket
        self._source = source
        self._s3 = boto3.client("s3", **boto3_kwargs)

    def _put(self, key: str, body: bytes) -> None:
        self._s3.put_object(Bucket=self._bucket, Key=key, Body=body)

    def write_raw(
        self,
        dataset_id: str,
        dt: str,
        ds: ReportDataset,
        start_date: str,
        end_date: str,
    ) -> None:
        _write_partition(self._put, self._source, dataset_id, dt, ds, start_date, end_date, writer="s3")

    def write_raw_stream(
        self,
        dataset_id: str,
        dt: str,
        rows_iter: Iterator[ReportRow],
        start_date: str,
        end_date: str,
    ) -> dict[str, Any]:
        """Stream rows to a temp file then upload to S3 via ``upload_file``.

        Unlike :meth:`write_raw`, the full payload is never held in memory.
        Use this for large datasets such as in-app events.

        Returns:
            A manifest dict describing the written partition.

        Raises:
            RuntimeError: S3 upload or temp-file I/O failure.
        """
        generated_at = utcnow()

        # Write to a temp file incrementally
        fd, tmp_path = tempfile.mkstemp(suffix=".jsonl.gz")
        os.close(fd)
        try:
            row_count = write_jsonl_gz_stream(rows_iter, tmp_path)

            data_key = build_raw_key(self._source, dataset_id, dt, "data.jsonl.gz")
            self._s3.upload_file(tmp_path, self._bucket, data_key)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        manifest = build_stream_manifest(
            source=self._source,
            dataset_id=dataset_id,
            dt=dt,
            start_date=start_date,
            end_date=end_date,
            row_count=row_count,
            generated_at_iso=generated_at.isoformat(),
        )
        manifest_key = build_raw_key(self._source, dataset_id, dt, "_manifest.json")
        self._put(manifest_key, manifest_to_bytes(manifest))

        return manifest
