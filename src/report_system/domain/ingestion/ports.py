from __future__ import annotations

from typing import Protocol

from report_system.domain.ingestion.models import ReportDataset


class GA4Port(Protocol):
    def run_report(
        self,
        property_id: str,
        start_date: str,
        end_date: str,
        dimensions: list[str],
        metrics: list[str],
    ) -> ReportDataset: ...


class AppsFlyerPort(Protocol):
    def pull_report(
        self,
        app_id: str,
        start_date: str,
        end_date: str,
        endpoint: str,
    ) -> ReportDataset: ...


class RawStoragePort(Protocol):
    """Persistence port for writing raw ingestion results.

    The implementation decides key layout, serialisation format, and
    target storage backend (local filesystem, S3, …).
    """

    def write_raw(
        self,
        dataset_id: str,
        dt: str,
        ds: ReportDataset,
        start_date: str,
        end_date: str,
    ) -> None: ...
