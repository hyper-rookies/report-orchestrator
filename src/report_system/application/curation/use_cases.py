from __future__ import annotations

from typing import Any

from report_system.application.curation.transformers import REGISTRY
from report_system.domain.curation.ports import (
    CuratedStoragePort,
    CuratedWriteResult,
    PartitionRegistrarPort,
)


class CurateAndRegisterUseCase:
    """Orchestrates the full curation pipeline for one dataset partition.

    Steps:
    1. Look up the transform callable from REGISTRY.
    2. Call ``transform(records, dt)`` → pyarrow Table.
    3. Write Parquet via the injected *storage* (Local or S3).
    4. If a *registrar* is supplied, derive the partition prefix from
       ``CuratedWriteResult.location`` and register the dt-partition.

    When *storage* is a :class:`LocalCuratedWriter` leave *registrar* as
    ``None`` — the registration step is silently skipped.

    Args:
        storage:    Curated storage backend (Local or S3).
        registrar:  Optional partition registrar (Athena or no-op).
    """

    def __init__(
        self,
        storage: CuratedStoragePort,
        registrar: PartitionRegistrarPort | None = None,
    ) -> None:
        self._storage = storage
        self._registrar = registrar

    def execute(
        self,
        dataset_id: str,
        dt: str,
        records: list[dict[str, Any]],
    ) -> CuratedWriteResult:
        """Transform *records*, write Parquet, optionally register partition.

        Args:
            dataset_id: Logical table name (must be a key in REGISTRY).
            dt:         Partition date string in YYYY-MM-DD.
            records:    Parsed raw JSON rows in ``{"dimensions":…, "metrics":…}``
                        format (output of :func:`read_raw_jsonl_gz`).

        Returns:
            :class:`CuratedWriteResult` from the storage write.

        Raises:
            ValueError:   If *dataset_id* is not in REGISTRY.
            RuntimeError: If the storage write or partition registration fails.
        """
        spec = REGISTRY.get(dataset_id)
        if spec is None:
            raise ValueError(
                f"Unknown dataset_id: {dataset_id!r}. "
                f"Known: {sorted(REGISTRY)}"
            )

        table = spec.transform(records, dt)
        result = self._storage.write_parquet(dataset_id, dt, table)

        if self._registrar is not None:
            # Derive the partition directory from the written file location.
            # S3 URI:  s3://bucket/curated/table/dt=2026-02-25/part-0000.parquet
            #        → s3://bucket/curated/table/dt=2026-02-25/
            # Local:   /tmp/out/curated/table/dt=2026-02-25/part-0000.parquet
            #        → /tmp/out/curated/table/dt=2026-02-25/
            loc = result.location
            if loc.startswith("s3://"):
                partition_location = loc.rsplit("/", 1)[0] + "/"
            else:
                from pathlib import Path
                partition_location = str(Path(loc).parent) + "/"
            self._registrar.add_partition(
                table=dataset_id,
                dt=dt,
                location=partition_location,
            )

        return result
