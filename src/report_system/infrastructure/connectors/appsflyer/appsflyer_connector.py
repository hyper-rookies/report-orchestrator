"""Production AppsFlyer Pull API connector.

Design
------
* **installs_report/v5** — in-memory CSV parsing → :class:`ReportDataset`.
  Each row = one raw install event (no pre-aggregation in Lambda).
* **in_app_events_report/v5** — streaming CSV → ``Iterator[ReportRow]``.
  Caller writes rows to a temp file; no full payload is held in memory.

Aggregation (COUNT, SUM) is performed at the CTAS curated layer.

Zero-rows policy
-----------------
* WARN by default (``fail_on_zero_rows=False``).
* FAIL immediately if the response contains no CSV headers at all.
* FAIL if ``fail_on_zero_rows=True`` and the data section is empty.
"""
from __future__ import annotations

import csv
import io
import logging
from typing import Iterator

import requests

from report_system.domain.ingestion.models import (
    DimensionValue,
    MetricValue,
    ReportDataset,
    ReportRow,
)
from report_system.domain.shared.time import utcnow

_log = logging.getLogger(__name__)

_BASE_URL = "https://hq1.appsflyer.com/api/raw-data/export/app"

# Short keys → AppsFlyer Pull API report-type path segments
_ENDPOINT_MAP: dict[str, str] = {
    "installs": "installs_report/v5",
    "events": "in_app_events_report/v5",
    "uninstalls": "uninstall_events_report/v5",
    "retargeting": "retargeting/installs_report/v5",
}

# ---------------------------------------------------------------------------
# CSV column → canonical name maps
# ---------------------------------------------------------------------------

# Dimension columns shared by installs and events
_SHARED_DIM_MAP: dict[str, str] = {
    "Media Source (pid)": "media_source",
    "Campaign (c)": "campaign",
    "Keyword (kw)": "keyword",
    "Adset (adset)": "adset",
    "Ad (ad)": "ad",
    "Channel": "channel",
    "App Version": "app_version",
    "Campaign Type": "campaign_type",
    "Match Type": "match_type",
    "Store Reinstall": "store_reinstall",
}

_INSTALLS_DIM_MAP: dict[str, str] = _SHARED_DIM_MAP.copy()
# Column whose presence confirms a valid installs CSV (error payload detection)
_INSTALLS_ANCHOR = "Media Source (pid)"

_EVENTS_DIM_MAP: dict[str, str] = {
    **_SHARED_DIM_MAP,
    "Event Name": "event_name",
}
_EVENTS_METRIC_MAP: dict[str, str] = {
    "Event Revenue": "event_revenue",
}
# Column whose presence confirms a valid events CSV
_EVENTS_ANCHOR = "Event Name"


# ---------------------------------------------------------------------------
# Internal CSV helpers
# ---------------------------------------------------------------------------


def _parse_header(header_line: str, anchor: str) -> dict[str, int]:
    """Parse a CSV header line and return ``{column_name: index}``.

    Raises :class:`RuntimeError` if *anchor* column is absent — this signals
    an AppsFlyer error payload masquerading as a successful HTTP 200 response.
    """
    reader = csv.reader([header_line])
    columns = next(reader)
    col_index = {col.strip(): idx for idx, col in enumerate(columns)}

    if anchor not in col_index:
        raise RuntimeError(
            f"AppsFlyer response does not contain expected column '{anchor}'. "
            f"Likely an error payload. First 300 chars of header: "
            f"{header_line[:300]!r}"
        )
    return col_index


def _build_row(
    values: list[str],
    col_index: dict[str, int],
    dim_map: dict[str, str],
    metric_map: dict[str, str],
) -> ReportRow:
    """Convert a parsed CSV row (list of strings) into a :class:`ReportRow`."""
    dimensions = [
        DimensionValue(name=canonical, value=values[col_index[csv_col]])
        for csv_col, canonical in dim_map.items()
        if col_index.get(csv_col, len(values)) < len(values)
    ]
    metrics = [
        MetricValue(name=canonical, value=values[col_index[csv_col]])
        for csv_col, canonical in metric_map.items()
        if col_index.get(csv_col, len(values)) < len(values)
    ]
    return ReportRow(dimensions=dimensions, metrics=metrics)


# ---------------------------------------------------------------------------
# Connector
# ---------------------------------------------------------------------------


class AppsFlyerConnector:
    """Production adapter for the AppsFlyer Pull API.

    Args:
        api_token:        AppsFlyer API token.
        auth_header:      HTTP header name for the Bearer token.
                          Default ``"Authorization"``; pass
                          ``"authentication-token"`` for legacy endpoints.
        timezone:         IANA timezone sent as the ``timezone`` query param
                          (e.g. ``"Asia/Seoul"``).  Defaults to ``"Asia/Seoul"``.
        fail_on_zero_rows: When ``True`` raise :class:`RuntimeError` if a
                          report returns zero data rows.  When ``False``
                          (default) emit a warning and return an empty dataset.
    """

    def __init__(
        self,
        api_token: str,
        auth_header: str = "Authorization",
        timezone: str = "Asia/Seoul",
        fail_on_zero_rows: bool = False,
    ) -> None:
        self._token = api_token
        self._auth_header = auth_header
        self._timezone = timezone
        self._fail_on_zero_rows = fail_on_zero_rows

        self._session = requests.Session()
        self._session.headers.update(
            {
                self._auth_header: f"Bearer {self._token}",
                "Accept": "text/csv",
            }
        )

    # ------------------------------------------------------------------
    # AppsFlyerPort — installs (in-memory)
    # ------------------------------------------------------------------

    def pull_report(
        self,
        app_id: str,
        start_date: str,
        end_date: str,
        endpoint: str,
    ) -> ReportDataset:
        """Pull a report and return a fully materialised :class:`ReportDataset`.

        Only the ``"installs"`` endpoint is supported here (in-memory path).
        For in-app events use :meth:`iter_events_report` (streaming path).

        Raises:
            ValueError:   *endpoint* is not ``"installs"``.
            RuntimeError: HTTP error, empty response, or missing anchor column.
        """
        if endpoint != "installs":
            raise ValueError(
                f"pull_report() only supports endpoint='installs'. "
                f"For '{endpoint}' use the matching streaming method."
            )
        return self._pull_installs(app_id, start_date, end_date)

    def _pull_installs(
        self,
        app_id: str,
        start_date: str,
        end_date: str,
    ) -> ReportDataset:
        url = self._resolve_url(app_id, "installs")
        params = {
            "from": start_date,
            "to": end_date,
            "timezone": self._timezone,
        }

        try:
            response = self._session.get(url, params=params, timeout=60)
        except requests.RequestException as exc:
            raise RuntimeError(f"AppsFlyer installs request failed: {exc}") from exc

        if not response.ok:
            snippet = response.text[:300].strip()
            raise RuntimeError(
                f"AppsFlyer returned HTTP {response.status_code} for installs "
                f"({start_date}→{end_date}): {snippet}"
            )

        text = response.text
        lines = text.splitlines()

        if not lines:
            raise RuntimeError(
                f"AppsFlyer installs response was empty for {start_date}→{end_date}"
            )

        col_index = _parse_header(lines[0], _INSTALLS_ANCHOR)
        dim_map = {c: _INSTALLS_DIM_MAP[c] for c in _INSTALLS_DIM_MAP if c in col_index}

        rows: list[ReportRow] = []
        reader = csv.reader(io.StringIO(text))
        header_skipped = False
        for csv_values in reader:
            if not header_skipped:
                header_skipped = True
                continue
            if not any(v.strip() for v in csv_values):
                continue  # skip blank lines
            rows.append(_build_row(csv_values, col_index, dim_map, metric_map={}))

        if not rows:
            msg = (
                f"AppsFlyer installs returned 0 rows for "
                f"{app_id} {start_date}→{end_date}"
            )
            if self._fail_on_zero_rows:
                raise RuntimeError(msg)
            _log.warning(msg)

        return ReportDataset(source="appsflyer", rows=rows, generated_at=utcnow())

    # ------------------------------------------------------------------
    # AppsFlyerStreamingPort — events (streaming)
    # ------------------------------------------------------------------

    def iter_events_report(
        self,
        app_id: str,
        start_date: str,
        end_date: str,
    ) -> Iterator[ReportRow]:
        """Stream in-app events rows from AppsFlyer Pull API.

        The HTTP response is consumed incrementally; no full payload is held
        in memory.  The response connection is closed when the returned
        iterator is exhausted or garbage-collected.

        Raises:
            RuntimeError: HTTP error, empty response, or missing anchor column.
                          These are raised eagerly (before the first ``next()``
                          call on the returned iterator).

        Yields:
            :class:`ReportRow` — one per raw in-app event.
        """
        url = self._resolve_url(app_id, "events")
        params = {
            "from": start_date,
            "to": end_date,
            "timezone": self._timezone,
        }

        try:
            response = self._session.get(url, params=params, timeout=60, stream=True)
        except requests.RequestException as exc:
            raise RuntimeError(f"AppsFlyer events request failed: {exc}") from exc

        if not response.ok:
            snippet = response.text[:300].strip()
            response.close()
            raise RuntimeError(
                f"AppsFlyer returned HTTP {response.status_code} for events "
                f"({start_date}→{end_date}): {snippet}"
            )

        lines: Iterator[str] = response.iter_lines(decode_unicode=True)

        # Validate header eagerly (before returning the generator)
        try:
            header_line = next(lines)
        except StopIteration:
            response.close()
            raise RuntimeError(
                f"AppsFlyer events response was empty for "
                f"{app_id} {start_date}→{end_date}"
            )

        col_index = _parse_header(header_line, _EVENTS_ANCHOR)
        dim_map = {c: _EVENTS_DIM_MAP[c] for c in _EVENTS_DIM_MAP if c in col_index}
        metric_map = {
            c: _EVENTS_METRIC_MAP[c] for c in _EVENTS_METRIC_MAP if c in col_index
        }

        return self._stream_event_rows(response, lines, col_index, dim_map, metric_map)

    def _stream_event_rows(
        self,
        response: requests.Response,
        lines: Iterator[str],
        col_index: dict[str, int],
        dim_map: dict[str, str],
        metric_map: dict[str, str],
    ) -> Iterator[ReportRow]:
        """Generator that yields rows and closes *response* in a finally block."""
        try:
            for line in lines:
                if not line.strip():
                    continue
                values = next(csv.reader([line]))
                yield _build_row(values, col_index, dim_map, metric_map)
        finally:
            response.close()

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
