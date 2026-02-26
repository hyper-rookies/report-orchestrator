from __future__ import annotations

import requests

from report_system.domain.ingestion.models import (
    DimensionValue,
    MetricValue,
    ReportDataset,
    ReportRow,
)
from report_system.domain.shared.time import utcnow

_BASE_URL = "https://hq1.appsflyer.com/api/raw-data/export/app"

# Short keys → AppsFlyer Pull API report-type path segments
_ENDPOINT_MAP: dict[str, str] = {
    "installs": "installs_report/v5",
    "events": "in_app_events_report/v5",
    "uninstalls": "uninstall_events_report/v5",
    "retargeting": "retargeting/installs_report/v5",
}

_PREVIEW_MAX = 200


class AppsFlyerConnector:
    """Infrastructure adapter that satisfies AppsFlyerPort.

    Args:
        api_token: AppsFlyer API token used for authentication.
        auth_header: HTTP header name carrying the Bearer token.
                     Defaults to ``"Authorization"``. Pass an alternative
                     (e.g. ``"authentication-token"``) when required by
                     specific AppsFlyer endpoint variants.
    """

    def __init__(
        self,
        api_token: str,
        auth_header: str = "Authorization",
    ) -> None:
        self._token = api_token
        self._auth_header = auth_header
        self._session = requests.Session()
        self._session.headers.update(
            {self._auth_header: f"Bearer {self._token}"}
        )

    # ------------------------------------------------------------------
    # AppsFlyerPort
    # ------------------------------------------------------------------

    def pull_report(
        self,
        app_id: str,
        start_date: str,
        end_date: str,
        endpoint: str,
    ) -> ReportDataset:
        url = self._resolve_url(app_id, endpoint)
        params = {"from": start_date, "to": end_date}

        try:
            response = self._session.get(url, params=params, timeout=60)
        except requests.RequestException as exc:
            raise RuntimeError(f"AppsFlyer request failed: {exc}") from exc

        if not response.ok:
            snippet = response.text[:300].strip()
            raise RuntimeError(
                f"AppsFlyer returned HTTP {response.status_code} "
                f"for endpoint '{endpoint}': {snippet}"
            )

        content_type = response.headers.get("Content-Type", "")
        if "json" in content_type:
            return self._parse_json(response, endpoint)
        return self._parse_text(response, endpoint)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _resolve_url(self, app_id: str, endpoint: str) -> str:
        if endpoint.startswith("http"):
            return endpoint
        path = _ENDPOINT_MAP.get(endpoint)
        if path is None:
            raise RuntimeError(
                f"Unknown AppsFlyer endpoint key '{endpoint}'. "
                f"Known keys: {sorted(_ENDPOINT_MAP)}"
            )
        return f"{_BASE_URL}/{app_id}/{path}"

    def _parse_json(
        self, response: requests.Response, endpoint: str
    ) -> ReportDataset:
        data = response.json()
        rows_raw: list = data if isinstance(data, list) else data.get("data", [data])
        row_count = len(rows_raw)

        row = ReportRow(
            dimensions=[DimensionValue(name="endpoint", value=endpoint)],
            metrics=[MetricValue(name="row_count", value=row_count)],
        )
        return ReportDataset(source="appsflyer", rows=[row], generated_at=utcnow())

    def _parse_text(
        self, response: requests.Response, endpoint: str
    ) -> ReportDataset:
        payload = response.text
        preview = payload[:_PREVIEW_MAX]

        row = ReportRow(
            dimensions=[DimensionValue(name="endpoint", value=endpoint)],
            metrics=[
                MetricValue(name="payload_size", value=len(payload)),
                MetricValue(name="preview", value=preview),
            ],
        )
        return ReportDataset(source="appsflyer", rows=[row], generated_at=utcnow())
