"""Curation use cases — Athena CTAS edition.

``CtasCurateAndRegisterUseCase`` orchestrates the full curation pipeline:

1. Run Athena CTAS query → curated Parquet lands at the target S3 partition.
2. Optionally register the new ``dt``-partition via :class:`PartitionRegistrarPort`.

Prerequisites (caller's responsibility):
- Raw JSONL.GZ files already written to S3 for the requested ``dt``.
- Raw external tables already exist in Glue Catalog (one per dataset_id).
"""
from __future__ import annotations

from datetime import datetime, timezone

from report_system.domain.curation.ports import CuratedWriteResult, PartitionRegistrarPort
from report_system.infrastructure.athena.ctas import AthenaCtasRunner


class CtasCurateAndRegisterUseCase:
    """Run Athena CTAS then register the resulting partition.

    Args:
        ctas_runner: Configured :class:`~report_system.infrastructure.athena.ctas.AthenaCtasRunner`.
        registrar:   Optional :class:`PartitionRegistrarPort` implementation.
                     When ``None`` the partition registration step is skipped
                     (useful when running locally or when the curated table
                     already uses ``MSCK REPAIR TABLE`` for discovery).
    """

    def __init__(
        self,
        ctas_runner: AthenaCtasRunner,
        registrar: PartitionRegistrarPort | None = None,
    ) -> None:
        self._runner = ctas_runner
        self._registrar = registrar

    def execute(self, dataset_id: str, dt: str) -> CuratedWriteResult:
        """Run CTAS for *dataset_id* on *dt*, then register the partition.

        Args:
            dataset_id: Logical table name — must be a key in
                        :data:`~report_system.infrastructure.athena.ctas.REGISTRY`.
            dt:         Partition date string in ``YYYY-MM-DD`` format.

        Returns:
            :class:`CuratedWriteResult` with ``location`` set to the curated
            S3 directory URI (trailing slash).
            ``row_count`` is ``-1`` — Athena CTAS does not expose row count
            without a separate ``SELECT COUNT(*)`` query.

        Raises:
            ValueError:   *dataset_id* is not registered.
            RuntimeError: CTAS query FAILED / CANCELLED, timed out, or
                          partition registration failed.
        """
        query_id, curated_location = self._runner.run(dataset_id, dt)

        if self._registrar is not None:
            self._registrar.add_partition(
                table=dataset_id,
                dt=dt,
                location=curated_location,
            )

        return CuratedWriteResult(
            location=curated_location,
            dataset_id=dataset_id,
            dt=dt,
            row_count=-1,  # not available from CTAS; run COUNT(*) separately if needed
            status="SUCCESS",
            generated_at=datetime.now(tz=timezone.utc),
        )
