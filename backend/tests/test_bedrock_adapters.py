"""
Bedrock Action Group adapter tests.

Each Lambda must:
- Detect Bedrock invocation (actionGroup + function in event)
- Parse Bedrock parameter list (type-casting string/integer/array/object)
- Return Bedrock response envelope (messageVersion, response.functionResponse.responseBody.TEXT.body)
- Not break existing non-Bedrock invocations (covered by other test files)
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


# ── Module loaders ────────────────────────────────────────────────────────────

def _load_query_handler():
    svc = Path(__file__).resolve().parents[1] / "services" / "query-lambda"
    sys.path.insert(0, str(svc))
    spec = importlib.util.spec_from_file_location("query_handler_bedrock", svc / "handler.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_analysis_app():
    path = Path(__file__).resolve().parents[1] / "services" / "analysis-lambda" / "app.py"
    spec = importlib.util.spec_from_file_location("analysis_app_bedrock", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_viz_app():
    path = Path(__file__).resolve().parents[1] / "services" / "viz-lambda" / "app.py"
    spec = importlib.util.spec_from_file_location("viz_app_bedrock", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


query_handler = _load_query_handler()
analysis_app = _load_analysis_app()
viz_app = _load_viz_app()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _param(name: str, type_: str, value: Any) -> dict:
    return {"name": name, "type": type_, "value": value}


def _assert_bedrock_envelope(response: dict, action_group: str, function: str) -> dict:
    """Assert Bedrock response envelope shape and return the parsed TEXT body."""
    assert response["messageVersion"] == "1.0"
    r = response["response"]
    assert r["actionGroup"] == action_group
    assert r["function"] == function
    body_str = r["functionResponse"]["responseBody"]["TEXT"]["body"]
    return json.loads(body_str)


# ── query-lambda: buildSQL ────────────────────────────────────────────────────

def test_query_buildsql_bedrock_returns_bedrock_envelope():
    event = {
        "actionGroup": "query",
        "function": "buildSQL",
        "parameters": [
            _param("version", "string", "v1"),
            _param("view", "string", "v_latest_ga4_acquisition_daily"),
            _param("dateRangeStart", "string", "2026-01-01"),
            _param("dateRangeEnd", "string", "2026-01-31"),
            _param("dimensions", "array", json.dumps(["channel_group"])),
            _param("metrics", "array", json.dumps(["sessions"])),
        ],
    }
    response = query_handler.lambda_handler(event, None)
    body = _assert_bedrock_envelope(response, "query", "buildSQL")
    assert "sql" in body
    assert "v_latest_ga4_acquisition_daily" in body["sql"]
    assert "channel_group" in body["sql"]
    assert "sessions" in body["sql"]


def test_query_buildsql_bedrock_respects_date_range():
    event = {
        "actionGroup": "query",
        "function": "buildSQL",
        "parameters": [
            _param("version", "string", "v1"),
            _param("view", "string", "v_latest_ga4_acquisition_daily"),
            _param("dateRangeStart", "string", "2026-02-01"),
            _param("dateRangeEnd", "string", "2026-02-28"),
            _param("dimensions", "array", json.dumps(["channel_group"])),
            _param("metrics", "array", json.dumps(["sessions"])),
        ],
    }
    body = _assert_bedrock_envelope(query_handler.lambda_handler(event, None), "query", "buildSQL")
    assert "2026-02-01" in body["sql"]
    assert "2026-02-28" in body["sql"]


def test_query_buildsql_bedrock_invalid_view_returns_error_in_envelope():
    event = {
        "actionGroup": "query",
        "function": "buildSQL",
        "parameters": [
            _param("version", "string", "v1"),
            _param("view", "string", "raw_table_not_allowed"),
            _param("dateRangeStart", "string", "2026-01-01"),
            _param("dateRangeEnd", "string", "2026-01-31"),
            _param("dimensions", "array", json.dumps(["col"])),
            _param("metrics", "array", json.dumps(["val"])),
        ],
    }
    body = _assert_bedrock_envelope(query_handler.lambda_handler(event, None), "query", "buildSQL")
    assert "error" in body
    assert body["error"]["actionGroup"] == "query"


# ── analysis-lambda: computeDelta ────────────────────────────────────────────

_BASELINE = [
    {"channel_group": "organic", "sessions": 10000},
    {"channel_group": "paid_search", "sessions": 8000},
]
_COMPARISON = [
    {"channel_group": "organic", "sessions": 12000},
    {"channel_group": "paid_search", "sessions": 7500},
]


def test_analysis_computedelta_bedrock_returns_bedrock_envelope():
    event = {
        "actionGroup": "analysis",
        "function": "computeDelta",
        "parameters": [
            _param("version", "string", "v1"),
            _param("baseline", "array", json.dumps(_BASELINE)),
            _param("comparison", "array", json.dumps(_COMPARISON)),
            _param("groupBy", "array", json.dumps(["channel_group"])),
            _param("metrics", "array", json.dumps(["sessions"])),
        ],
    }
    response = analysis_app.lambda_handler(event, None)
    body = _assert_bedrock_envelope(response, "analysis", "computeDelta")
    assert "deltas" in body
    assert len(body["deltas"]) == 2


def test_analysis_computedelta_bedrock_computes_correct_delta():
    event = {
        "actionGroup": "analysis",
        "function": "computeDelta",
        "parameters": [
            _param("version", "string", "v1"),
            _param("baseline", "array", json.dumps(_BASELINE)),
            _param("comparison", "array", json.dumps(_COMPARISON)),
            _param("groupBy", "array", json.dumps(["channel_group"])),
            _param("metrics", "array", json.dumps(["sessions"])),
        ],
    }
    body = _assert_bedrock_envelope(analysis_app.lambda_handler(event, None), "analysis", "computeDelta")
    organic = next(d for d in body["deltas"] if d["key"]["channel_group"] == "organic")
    assert organic["delta"]["sessions"] == 2000
    assert abs(organic["pctChange"]["sessions"] - 0.2) < 1e-9


def test_analysis_computedelta_bedrock_invalid_payload_returns_error_in_envelope():
    event = {
        "actionGroup": "analysis",
        "function": "computeDelta",
        "parameters": [
            _param("version", "string", "v1"),
            _param("baseline", "array", json.dumps(_BASELINE)),
            _param("comparison", "array", json.dumps(_COMPARISON)),
            _param("groupBy", "array", json.dumps(["channel_group"])),
            # metrics missing
        ],
    }
    body = _assert_bedrock_envelope(analysis_app.lambda_handler(event, None), "analysis", "computeDelta")
    assert "error" in body


# ── viz-lambda: buildChartSpec ────────────────────────────────────────────────

_ROWS = [
    {"channel_group": "organic", "sessions": 12000, "conversions": 600},
    {"channel_group": "paid_search", "sessions": 7500, "conversions": 300},
]


def test_viz_buildchartspec_bedrock_returns_bedrock_envelope():
    event = {
        "actionGroup": "viz",
        "function": "buildChartSpec",
        "parameters": [
            _param("version", "string", "v1"),
            _param("rows", "array", json.dumps(_ROWS)),
            _param("chartType", "string", "bar"),
            _param("title", "string", "Sessions by Channel"),
            _param("xAxis", "string", "channel_group"),
            _param("yAxis", "array", json.dumps(["sessions", "conversions"])),
        ],
    }
    response = viz_app.lambda_handler(event, None)
    body = _assert_bedrock_envelope(response, "viz", "buildChartSpec")
    assert "spec" in body
    assert body["spec"]["type"] == "bar"
    assert body["spec"]["xAxis"] == "channel_group"
    assert len(body["spec"]["series"]) == 2


def test_viz_buildchartspec_bedrock_table_type_omits_series():
    event = {
        "actionGroup": "viz",
        "function": "buildChartSpec",
        "parameters": [
            _param("version", "string", "v1"),
            _param("rows", "array", json.dumps(_ROWS)),
            _param("chartType", "string", "table"),
        ],
    }
    body = _assert_bedrock_envelope(viz_app.lambda_handler(event, None), "viz", "buildChartSpec")
    assert body["spec"]["type"] == "table"
    assert "series" not in body["spec"]


def test_viz_buildchartspec_bedrock_invalid_chart_type_returns_error_in_envelope():
    event = {
        "actionGroup": "viz",
        "function": "buildChartSpec",
        "parameters": [
            _param("version", "string", "v1"),
            _param("rows", "array", json.dumps(_ROWS)),
            _param("chartType", "string", "pie"),
        ],
    }
    body = _assert_bedrock_envelope(viz_app.lambda_handler(event, None), "viz", "buildChartSpec")
    assert "error" in body
    assert body["error"]["code"] == "INVALID_CHART_TYPE"
