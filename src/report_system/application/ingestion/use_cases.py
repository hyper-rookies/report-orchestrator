from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from report_system.config.settings import Settings
from report_system.domain.ingestion.dataset_id import (
    resolve_appsflyer_dataset_id,
    resolve_ga4_dataset_id,
)
from report_system.domain.ingestion.models import ReportDataset
from report_system.domain.ingestion.ports import (
    AppsFlyerPort,
    AppsFlyerStreamingPort,
    GA4Port,
    RawStoragePort,
    StreamingRawStoragePort,
)


def _backfill_dates(target: date, num_days: int) -> list[date]:
    """Return [target - (num_days-1), ..., target] inclusive."""
    start = target - timedelta(days=num_days - 1)
    return [start + timedelta(days=i) for i in range(num_days)]


# ---------------------------------------------------------------------------
# GA4
# ---------------------------------------------------------------------------


class IngestGA4DailyBatchUseCase:
    """Pull GA4 acquisition report for a rolling backfill window."""

    # Canonical dimension/metric set for ga4_acquisition_daily.
    DIMENSIONS = [
        "sessionDefaultChannelGroup",
        "sessionSource",
        "sessionMedium",
    ]
    METRICS = ["sessions", "totalUsers", "conversions", "totalRevenue"]

    def __init__(
        self,
        ga4_port: GA4Port,
        settings: Settings,
        storage: RawStoragePort | None = None,
    ) -> None:
        self._ga4 = ga4_port
        self._settings = settings
        self._storage = storage
        self._dataset_id = resolve_ga4_dataset_id(self.DIMENSIONS, self.METRICS)

    def execute_for_target_day(self, target_date: str) -> list[ReportDataset]:
        """Return one ReportDataset per day in the backfill window.

        If a RawStoragePort was supplied at construction, each dataset is
        written to raw storage immediately after fetching.

        Args:
            target_date: Business date in YYYY-MM-DD (Asia/Seoul calendar day).
        """
        target = date.fromisoformat(target_date)
        dates = _backfill_dates(target, self._settings.GA4_BACKFILL_DAYS)

        results: list[ReportDataset] = []
        for dt in dates:
            date_str = str(dt)
            ds = self._ga4.run_report(
                property_id=self._settings.GA4_PROPERTY_ID,
                start_date=date_str,
                end_date=date_str,
                dimensions=self.DIMENSIONS,
                metrics=self.METRICS,
            )
            if self._storage is not None:
                self._storage.write_raw(
                    dataset_id=self._dataset_id,
                    dt=date_str,
                    ds=ds,
                    start_date=date_str,
                    end_date=date_str,
                )
            results.append(ds)

        return results


# ---------------------------------------------------------------------------
# AppsFlyer
# ---------------------------------------------------------------------------


class IngestAppsFlyerDailyBatchUseCase:
    """Pull AppsFlyer installs report for a rolling backfill window."""

    ENDPOINT = "installs"

    def __init__(
        self,
        appsflyer_port: AppsFlyerPort,
        settings: Settings,
        storage: RawStoragePort | None = None,
    ) -> None:
        self._appsflyer = appsflyer_port
        self._settings = settings
        self._storage = storage
        self._dataset_id = resolve_appsflyer_dataset_id(self.ENDPOINT)

    def execute_for_target_day(self, target_date: str) -> list[ReportDataset]:
        """Return one ReportDataset per day in the backfill window.

        Args:
            target_date: Business date in YYYY-MM-DD (Asia/Seoul calendar day).
        """
        target = date.fromisoformat(target_date)
        dates = _backfill_dates(target, self._settings.MMP_BACKFILL_DAYS)

        results: list[ReportDataset] = []
        for dt in dates:
            date_str = str(dt)
            ds = self._appsflyer.pull_report(
                app_id=self._settings.APPSFLYER_APP_ID,
                start_date=date_str,
                end_date=date_str,
                endpoint=self.ENDPOINT,
            )
            if self._storage is not None:
                self._storage.write_raw(
                    dataset_id=self._dataset_id,
                    dt=date_str,
                    ds=ds,
                    start_date=date_str,
                    end_date=date_str,
                )
            results.append(ds)

        return results


class IngestAppsFlyerEventsDailyBatchUseCase:
    """Pull AppsFlyer in-app events report (streaming) for a rolling window.

    Events are streamed row-by-row from the API and written directly to a
    temp file then uploaded to S3.  No full payload is held in memory.
    """

    ENDPOINT = "events"

    def __init__(
        self,
        appsflyer_port: AppsFlyerStreamingPort,
        settings: Settings,
        storage: StreamingRawStoragePort | None = None,
    ) -> None:
        self._appsflyer = appsflyer_port
        self._settings = settings
        self._storage = storage
        self._dataset_id = resolve_appsflyer_dataset_id(self.ENDPOINT)

    def execute_for_target_day(self, target_date: str) -> list[dict[str, Any]]:
        """Stream events for each day in the backfill window.

        Args:
            target_date: Business date in YYYY-MM-DD (Asia/Seoul calendar day).

        Returns:
            One manifest dict per day (empty list when no storage port is set).
        """
        target = date.fromisoformat(target_date)
        dates = _backfill_dates(target, self._settings.MMP_BACKFILL_DAYS)

        manifests: list[dict[str, Any]] = []
        for dt in dates:
            date_str = str(dt)
            rows_iter = self._appsflyer.iter_events_report(
                app_id=self._settings.APPSFLYER_APP_ID,
                start_date=date_str,
                end_date=date_str,
            )
            if self._storage is not None:
                manifest = self._storage.write_raw_stream(
                    dataset_id=self._dataset_id,
                    dt=date_str,
                    rows_iter=rows_iter,
                    start_date=date_str,
                    end_date=date_str,
                )
                manifests.append(manifest)
            else:
                # Drain the iterator so the HTTP connection is released
                for _ in rows_iter:
                    pass

        return manifests
