from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


def _load_handler_module():
    service_dir = Path(__file__).resolve().parents[1] / "services" / "query-lambda"
    sys.path.insert(0, str(service_dir))
    module_path = service_dir / "handler.py"
    spec = importlib.util.spec_from_file_location("query_lambda_handler", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


query_handler = _load_handler_module()


def _base_event() -> dict[str, object]:
    return {
        "version": "v1",
        "view": "v_latest_ga4_acquisition_daily",
        "dateRange": {"start": "2026-01-01", "end": "2026-01-31"},
        "dimensions": ["channel_group", "source"],
        "metrics": ["sessions", "conversions"],
    }


def test_build_sql_success_injects_dt_and_default_limit():
    response = query_handler.lambda_handler(_base_event(), None)

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {
        "version": "v1",
        "sql": (
            "SELECT channel_group, source, sessions, conversions "
            "FROM hyper_intern_m1c.v_latest_ga4_acquisition_daily "
            "WHERE dt BETWEEN '2026-01-01' AND '2026-01-31' LIMIT 1000"
        ),
    }


def test_build_sql_rejects_view_not_in_allowed_views():
    event = _base_event()
    event["view"] = "ga4_acquisition_daily"

    body = json.loads(query_handler.lambda_handler(event, None)["body"])

    assert body["error"]["code"] == "SCHEMA_VIOLATION"


def test_build_sql_rejects_denied_columns_global():
    event = _base_event()
    event["dimensions"] = ["channel_group", "run_id"]

    body = json.loads(query_handler.lambda_handler(event, None)["body"])

    assert body["error"]["code"] == "SCHEMA_VIOLATION"
    assert "denied" in body["error"]["message"]


def test_build_sql_rejects_columns_missing_from_catalog():
    event = _base_event()
    event["metrics"] = ["sessions", "missing_metric"]

    body = json.loads(query_handler.lambda_handler(event, None)["body"])

    assert body["error"]["code"] == "SCHEMA_VIOLATION"
    assert "catalog_discovered" in body["error"]["message"]


def test_build_sql_rejects_dml_keywords():
    event = _base_event()
    event["filters"] = [{"column": "channel_group", "op": "=", "value": "organic DROP"}]

    body = json.loads(query_handler.lambda_handler(event, None)["body"])

    assert body["error"]["code"] == "DML_REJECTED"


def test_build_sql_clamps_limit_to_contract_max():
    event = _base_event()
    event["limit"] = 50000

    response = query_handler.lambda_handler({"body": json.dumps(event)}, None)
    body = json.loads(response["body"])

    assert body["sql"].endswith("LIMIT 10000")


def test_build_sql_accepts_proxy_event_with_dict_body():
    response = query_handler.lambda_handler({"body": _base_event()}, None)
    body = json.loads(response["body"])

    assert body["sql"].endswith("LIMIT 1000")


# --- Task 1: _load_json errors must surface as QueryError with filename ---


def test_missing_policy_file_returns_unknown_with_filename(monkeypatch):
    import policy_guard as pg  # available on sys.path after _load_handler_module()
    from pathlib import Path

    monkeypatch.setattr(pg, "SHARED_DIR", Path("/nonexistent/__test__"))

    response = query_handler.lambda_handler(_base_event(), None)
    body = json.loads(response["body"])

    assert body["error"]["code"] == "UNKNOWN"
    assert "reporting_policy.json" in body["error"]["message"]


def test_invalid_json_policy_file_returns_unknown_with_filename(monkeypatch, tmp_path):
    import policy_guard as pg

    (tmp_path / "reporting_policy.json").write_text("{ invalid json", encoding="utf-8")
    (tmp_path / "catalog_discovered.json").write_text("{ invalid json", encoding="utf-8")
    monkeypatch.setattr(pg, "SHARED_DIR", tmp_path)

    response = query_handler.lambda_handler(_base_event(), None)
    body = json.loads(response["body"])

    assert body["error"]["code"] == "UNKNOWN"
    assert "reporting_policy.json" in body["error"]["message"]
