from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(frozen=True)
class CuratedWriteResult:
    """Value object returned by every CuratedStoragePort implementation.

    Attributes:
        location:     Full path or URI of the written Parquet file
                      (e.g. ``/tmp/out/curated/ga4_acquisition_daily/dt=2026-02-25/part-0000.parquet``
                      or ``s3://my-bucket/curated/ga4_acquisition_daily/dt=2026-02-25/part-0000.parquet``).
        dataset_id:   Logical name of the curated table (e.g. ``ga4_acquisition_daily``).
        dt:           Partition date string in YYYY-MM-DD.
        row_count:    Number of rows written.
        status:       ``"SUCCESS"`` or ``"ERROR"``.
        generated_at: UTC timestamp of when the write completed.
    """

    location: str
    dataset_id: str
    dt: str
    row_count: int
    status: str
    generated_at: datetime


class PartitionRegistrarPort(Protocol):
    """Outbound port for registering a Hive-style partition in a query engine.

    ``database`` and ``workgroup`` are configured at construction time so the
    method signature stays engine-agnostic. The concrete implementation
    (Athena, Glue, …) is injected into the use case.
    """

    def add_partition(self, table: str, dt: str, location: str) -> None:
        """Register a single dt-partition for *table*.

        *location* must be the S3 prefix of the partition directory, with a
        trailing slash (e.g. ``s3://bucket/curated/table/dt=2026-02-25/``).
        Blocks until the operation completes.
        Raises :class:`RuntimeError` on failure.
        """
        ...


class CuratedStoragePort(Protocol):
    """Outbound port for writing curated Parquet partitions.

    The application layer depends only on this interface; the concrete
    backend (local filesystem, S3, …) is injected at construction time.
    ``table`` is typed as ``Any`` here so the domain layer has no compile-time
    dependency on pyarrow — concrete implementations declare ``pa.Table``.
    """

    def write_parquet(
        self,
        dataset_id: str,
        dt: str,
        table: Any,
    ) -> CuratedWriteResult: ...
