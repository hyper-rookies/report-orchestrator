from __future__ import annotations

import os
import time
from unittest.mock import MagicMock, patch

import pytest

# Set required env vars before importing handler
os.environ.setdefault("DATA_BUCKET", "test-bucket")
os.environ.setdefault("DDB_TABLE", "test-table")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-unit-tests!!")

import jwt  # noqa: E402 - must come after env var setup

from handler import (  # noqa: E402
    _build_queries,
    _get_report,
    lambda_handler,
)


# ── _build_queries ────────────────────────────────────────────────


def test_build_queries_returns_three_sections():
    queries = _build_queries("2024-11-01", "2024-11-07", "11/01 ~ 11/07")
    assert len(queries) == 3


def test_build_queries_injects_date_range_into_sql():
    queries = _build_queries("2024-11-01", "2024-11-07", "11/01 ~ 11/07")
    for q in queries:
        assert "2024-11-01" in q["sql"]
        assert "2024-11-07" in q["sql"]


def test_build_queries_injects_period_label_into_title():
    queries = _build_queries("2024-11-01", "2024-11-07", "11/01 ~ 11/07")
    for q in queries:
        assert "11/01 ~ 11/07" in q["title"]


def test_build_queries_date_range_is_not_hardcoded():
    queries_a = _build_queries("2025-01-01", "2025-01-07", "A")
    queries_b = _build_queries("2025-03-01", "2025-03-07", "B")
    assert queries_a[0]["sql"] != queries_b[0]["sql"]


# ── _get_report ───────────────────────────────────────────────────


def test_get_report_empty_token_returns_400():
    report, status = _get_report("")
    assert status == 400
    assert "error" in report


def test_get_report_invalid_token_returns_400():
    report, status = _get_report("not.a.valid.jwt")
    assert status == 400
    assert "error" in report


def test_get_report_expired_token_returns_401():
    expired_token = jwt.encode(
        {"report_id": "test-id", "exp": int(time.time()) - 3600},
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )
    report, status = _get_report(expired_token)
    assert status == 401
    assert "error" in report


def test_get_report_missing_report_in_ddb_returns_404():
    valid_token = jwt.encode(
        {"report_id": "nonexistent-id", "exp": int(time.time()) + 86400},
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )
    mock_ddb = MagicMock()
    mock_ddb.get_item.return_value = {}  # no "Item" key
    with patch("handler.boto3") as mock_boto3:
        mock_boto3.resource.return_value.Table.return_value = mock_ddb
        report, status = _get_report(valid_token)
    assert status == 404
    assert "error" in report


def test_get_report_ddb_client_error_returns_500():
    from botocore.exceptions import ClientError

    valid_token = jwt.encode(
        {"report_id": "some-id", "exp": int(time.time()) + 86400},
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )
    mock_ddb = MagicMock()
    mock_ddb.get_item.side_effect = ClientError(
        {"Error": {"Code": "InternalServerError", "Message": "DDB down"}},
        "GetItem",
    )
    with patch("handler.boto3") as mock_boto3:
        mock_boto3.resource.return_value.Table.return_value = mock_ddb
        report, status = _get_report(valid_token)
    assert status == 500
    assert "error" in report


# ── lambda_handler routing ────────────────────────────────────────


def _http_event(method: str, params: dict | None = None) -> dict:
    return {
        "requestContext": {"http": {"method": method}},
        "queryStringParameters": params or {},
    }


def test_lambda_handler_options_returns_200_without_executing_queries():
    result = lambda_handler(_http_event("OPTIONS"), None)
    assert result["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in result["headers"]


def test_lambda_handler_get_with_empty_token_returns_400():
    result = lambda_handler(_http_event("GET", {"token": ""}), None)
    assert result["statusCode"] == 400


def test_lambda_handler_get_with_invalid_token_returns_400():
    result = lambda_handler(_http_event("GET", {"token": "bad.token"}), None)
    assert result["statusCode"] == 400


# ── _run_athena timeout branch ────────────────────────────────────


def test_run_athena_raises_on_timeout():
    from handler import _run_athena

    mock_athena = MagicMock()
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-1"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {"Status": {"State": "RUNNING"}}
    }

    with patch("handler.time.sleep"):  # skip actual sleeping
        with pytest.raises(TimeoutError):
            _run_athena(mock_athena, "SELECT 1")


def test_run_athena_raises_on_failed_state():
    from handler import _run_athena

    mock_athena = MagicMock()
    mock_athena.start_query_execution.return_value = {"QueryExecutionId": "qid-2"}
    mock_athena.get_query_execution.return_value = {
        "QueryExecution": {
            "Status": {"State": "FAILED", "StateChangeReason": "Syntax error"}
        }
    }

    with pytest.raises(RuntimeError, match="Athena query failed"):
        _run_athena(mock_athena, "BAD SQL")
