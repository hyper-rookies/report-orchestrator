from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class CuratedWriteResult:
    """Value object returned by every curation operation.

    Attributes:
        location:     S3 directory URI of the curated partition
                      (e.g. ``s3://bucket/curated/ga4_acquisition_daily/dt=2026-02-25/``).
                      Always ends with a trailing slash.
        dataset_id:   Logical table name (e.g. ``ga4_acquisition_daily``).
        dt:           Partition date string in ``YYYY-MM-DD``.
        row_count:    Number of rows written.  ``-1`` when not available
                      (e.g. Athena CTAS does not expose row count directly).
        status:       ``"SUCCESS"`` or ``"ERROR"``.
        generated_at: UTC timestamp of when the operation completed.
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
    method signature stays engine-agnostic.  The concrete implementation
    (Athena, Glue, …) is injected at the use-case level.
    """

    def add_partition(self, table: str, dt: str, location: str) -> None:
        """Register a single dt-partition for *table*.

        *location* must be the S3 prefix of the partition directory with a
        trailing slash (e.g. ``s3://bucket/curated/table/dt=2026-02-25/``).
        Blocks until the operation completes.

        Raises:
            RuntimeError: On Athena / Glue failure or timeout.
        """
        ...
