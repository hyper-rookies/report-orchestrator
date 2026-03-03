"""Unit tests for AppsFlyerConnector (no network calls).

All HTTP interactions are mocked via unittest.mock so these tests run
fully offline.
"""
from __future__ import annotations

import csv
import io
from unittest.mock import MagicMock, patch

import pytest

from report_system.infrastructure.connectors.appsflyer.appsflyer_connector import (
    AppsFlyerConnector,
    _INSTALLS_ANCHOR,
    _EVENTS_ANCHOR,
    _parse_header,
)

# ---------------------------------------------------------------------------
# Fixtures — CSV bodies
# ---------------------------------------------------------------------------

_INSTALLS_HEADER = (
    "Media Source (pid),Campaign (c),Keyword (kw),Adset (adset),Ad (ad),"
    "Channel,App Version,Campaign Type,Match Type,Store Reinstall"
)
_INSTALLS_ROW1 = "googleadwords_int,summer_promo,,ad_group_1,ad_1,,,User Acquisition,srn,false"
_INSTALLS_ROW2 = "organic,,,,,,,,,false"

_EVENTS_HEADER = (
    "Media Source (pid),Campaign (c),Event Name,Keyword (kw),Adset (adset),"
    "Ad (ad),Channel,App Version,Campaign Type,Match Type,Store Reinstall,Event Revenue"
)
_EVENTS_ROW1 = "googleadwords_int,summer_promo,purchase,,,,,,,,,9.99"
_EVENTS_ROW2 = "organic,,view_item,,,,,,,,, "

_ERROR_BODY = "Unauthorized: invalid API token"


def _make_csv(*lines: str) -> str:
    return "\n".join(lines)


def _mock_response(text: str, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.ok = status_code < 400
    resp.status_code = status_code
    resp.text = text
    # iter_lines for streaming tests
    resp.iter_lines.return_value = iter(text.splitlines())
    return resp


# ---------------------------------------------------------------------------
# _parse_header
# ---------------------------------------------------------------------------


def test_parse_header_returns_index():
    col_index = _parse_header(_INSTALLS_HEADER, _INSTALLS_ANCHOR)
    assert col_index["Media Source (pid)"] == 0
    assert col_index["Store Reinstall"] == 9


def test_parse_header_missing_anchor_raises():
    with pytest.raises(RuntimeError, match="Media Source"):
        _parse_header(_ERROR_BODY, _INSTALLS_ANCHOR)


# ---------------------------------------------------------------------------
# pull_report — installs (in-memory)
# ---------------------------------------------------------------------------


def _connector(**kw) -> AppsFlyerConnector:
    return AppsFlyerConnector(api_token="tok", **kw)


def test_pull_report_wrong_endpoint_raises():
    c = _connector()
    with pytest.raises(ValueError, match="pull_report\\(\\) only supports"):
        c.pull_report("app123", "2024-01-01", "2024-01-01", "events")


def test_pull_report_installs_parses_rows():
    body = _make_csv(_INSTALLS_HEADER, _INSTALLS_ROW1, _INSTALLS_ROW2)
    c = _connector()
    with patch.object(c._session, "get", return_value=_mock_response(body)):
        ds = c.pull_report("app1", "2024-01-01", "2024-01-01", "installs")

    assert ds.source == "appsflyer"
    assert len(ds.rows) == 2

    row0_dims = {d.name: d.value for d in ds.rows[0].dimensions}
    assert row0_dims["media_source"] == "googleadwords_int"
    assert row0_dims["campaign"] == "summer_promo"
    assert row0_dims["store_reinstall"] == "false"


def test_pull_report_http_error_raises():
    c = _connector()
    with patch.object(c._session, "get", return_value=_mock_response("Forbidden", 403)):
        with pytest.raises(RuntimeError, match="HTTP 403"):
            c.pull_report("app1", "2024-01-01", "2024-01-01", "installs")


def test_pull_report_error_payload_raises():
    """HTTP 200 but body is an error string, not CSV."""
    c = _connector()
    with patch.object(c._session, "get", return_value=_mock_response(_ERROR_BODY)):
        with pytest.raises(RuntimeError, match="Media Source"):
            c.pull_report("app1", "2024-01-01", "2024-01-01", "installs")


def test_pull_report_zero_rows_warns_by_default(caplog):
    body = _INSTALLS_HEADER  # header only, no data rows
    c = _connector(fail_on_zero_rows=False)
    import logging
    with caplog.at_level(logging.WARNING):
        with patch.object(c._session, "get", return_value=_mock_response(body)):
            ds = c.pull_report("app1", "2024-01-01", "2024-01-01", "installs")

    assert len(ds.rows) == 0
    assert any("0 rows" in rec.message for rec in caplog.records)


def test_pull_report_zero_rows_fails_when_configured():
    body = _INSTALLS_HEADER  # header only, no data rows
    c = _connector(fail_on_zero_rows=True)
    with patch.object(c._session, "get", return_value=_mock_response(body)):
        with pytest.raises(RuntimeError, match="0 rows"):
            c.pull_report("app1", "2024-01-01", "2024-01-01", "installs")


# ---------------------------------------------------------------------------
# iter_events_report — streaming
# ---------------------------------------------------------------------------


def _streaming_response(text: str, status_code: int = 200) -> MagicMock:
    resp = MagicMock()
    resp.ok = status_code < 400
    resp.status_code = status_code
    resp.text = text
    resp.iter_lines.return_value = iter(text.splitlines())
    return resp


def test_iter_events_report_yields_rows():
    body = _make_csv(_EVENTS_HEADER, _EVENTS_ROW1, _EVENTS_ROW2)
    c = _connector()
    with patch.object(c._session, "get", return_value=_streaming_response(body)):
        rows = list(c.iter_events_report("app1", "2024-01-01", "2024-01-01"))

    assert len(rows) == 2
    row0_dims = {d.name: d.value for d in rows[0].dimensions}
    assert row0_dims["event_name"] == "purchase"
    assert row0_dims["media_source"] == "googleadwords_int"

    row0_metrics = {m.name: m.value for m in rows[0].metrics}
    assert row0_metrics["event_revenue"] == "9.99"


def test_iter_events_report_http_error_raises():
    c = _connector()
    with patch.object(
        c._session, "get", return_value=_streaming_response("Forbidden", 403)
    ):
        with pytest.raises(RuntimeError, match="HTTP 403"):
            c.iter_events_report("app1", "2024-01-01", "2024-01-01")


def test_iter_events_report_empty_response_raises():
    c = _connector()
    with patch.object(c._session, "get", return_value=_streaming_response("")):
        with pytest.raises(RuntimeError, match="empty"):
            c.iter_events_report("app1", "2024-01-01", "2024-01-01")


def test_iter_events_report_error_payload_raises():
    c = _connector()
    with patch.object(
        c._session, "get", return_value=_streaming_response(_ERROR_BODY)
    ):
        with pytest.raises(RuntimeError, match="Event Name"):
            c.iter_events_report("app1", "2024-01-01", "2024-01-01")


def test_iter_events_report_response_closed_after_exhaustion():
    """HTTP response must be closed after the generator is exhausted."""
    body = _make_csv(_EVENTS_HEADER, _EVENTS_ROW1)
    mock_resp = _streaming_response(body)
    c = _connector()
    with patch.object(c._session, "get", return_value=mock_resp):
        rows = list(c.iter_events_report("app1", "2024-01-01", "2024-01-01"))

    assert len(rows) == 1
    mock_resp.close.assert_called_once()
