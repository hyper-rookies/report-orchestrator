from __future__ import annotations

from pathlib import Path

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
)
from google.api_core import exceptions as gexc
from google.oauth2 import service_account

from report_system.domain.ingestion.models import (
    DimensionValue,
    MetricValue,
    ReportDataset,
    ReportRow,
)
from report_system.domain.shared.time import utcnow

_GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]


def _parse_metric(value: str) -> int | float | str:
    """Coerce GA4 string metric values to int or float where possible."""
    try:
        return int(value)
    except ValueError:
        pass
    try:
        return float(value)
    except ValueError:
        return value


class GA4Connector:
    """Infrastructure adapter that satisfies GA4Port."""

    def __init__(self, credentials_path: str) -> None:
        path = Path(credentials_path)
        if not path.exists():
            raise RuntimeError(
                f"GA4 credential file not found: '{credentials_path}'. "
                "Set GOOGLE_APPLICATION_CREDENTIALS to a valid service account JSON path."
            )
        try:
            creds = service_account.Credentials.from_service_account_file(
                str(path), scopes=_GA4_SCOPES
            )
        except (ValueError, KeyError) as exc:
            raise RuntimeError(
                f"GA4 credential file is invalid: {exc}"
            ) from exc

        self._client = BetaAnalyticsDataClient(credentials=creds)

    def run_report(
        self,
        property_id: str,
        start_date: str,
        end_date: str,
        dimensions: list[str],
        metrics: list[str],
    ) -> ReportDataset:
        request = RunReportRequest(
            property=f"properties/{property_id}",
            date_ranges=[DateRange(start_date=start_date, end_date=end_date)],
            dimensions=[Dimension(name=d) for d in dimensions],
            metrics=[Metric(name=m) for m in metrics],
        )

        try:
            response = self._client.run_report(request)
        except gexc.PermissionDenied as exc:
            raise RuntimeError(
                f"GA4 permission denied for property '{property_id}': {exc.message}"
            ) from exc
        except gexc.NotFound as exc:
            raise RuntimeError(
                f"GA4 property '{property_id}' not found: {exc.message}"
            ) from exc
        except gexc.GoogleAPICallError as exc:
            raise RuntimeError(f"GA4 API error: {exc.message}") from exc

        rows = [
            ReportRow(
                dimensions=[
                    DimensionValue(name=dimensions[i], value=dv.value)
                    for i, dv in enumerate(row.dimension_values)
                ],
                metrics=[
                    MetricValue(name=metrics[i], value=_parse_metric(mv.value))
                    for i, mv in enumerate(row.metric_values)
                ],
            )
            for row in response.rows
        ]

        return ReportDataset(source="ga4", rows=rows, generated_at=utcnow())
