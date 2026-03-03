from __future__ import annotations

from typing import Any, Iterator, Protocol

from report_system.domain.ingestion.models import ReportDataset, ReportRow


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


class AppsFlyerStreamingPort(Protocol):
    """Port for the streaming events path (no full payload in memory)."""

    def iter_events_report(
        self,
        app_id: str,
        start_date: str,
        end_date: str,
    ) -> Iterator[ReportRow]: ...


class RawStoragePort(Protocol):
    """Persistence port for writing raw ingestion results (in-memory path)."""

    def write_raw(
        self,
        dataset_id: str,
        dt: str,
        ds: ReportDataset,
        start_date: str,
        end_date: str,
    ) -> None: ...


class StreamingRawStoragePort(Protocol):
    """Persistence port for the streaming write path (events)."""

    def write_raw_stream(
        self,
        dataset_id: str,
        dt: str,
        rows_iter: Iterator[ReportRow],
        start_date: str,
        end_date: str,
    ) -> dict[str, Any]: ...
