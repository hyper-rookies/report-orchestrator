from __future__ import annotations

import importlib.util
import json
from pathlib import Path


def _load_module():
    module_path = Path(__file__).resolve().parents[1] / "services" / "viz-lambda" / "app.py"
    spec = importlib.util.spec_from_file_location("viz_lambda_app", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


viz_app = _load_module()


def test_build_chart_spec_bar_includes_x_axis_series_and_data():
    rows = [
        {"channel_group": "organic", "sessions": 12450, "conversions": 610},
        {"channel_group": "paid_search", "sessions": 7900, "conversions": 315},
    ]

    result = viz_app.build_chart_spec(
        {
            "version": "v1",
            "rows": rows,
            "chartType": "bar",
            "title": "Sessions and Conversions by Channel",
            "xAxis": "channel_group",
            "yAxis": ["sessions", "conversions"],
        }
    )

    assert result == {
        "version": "v1",
        "spec": {
            "type": "bar",
            "title": "Sessions and Conversions by Channel",
            "xAxis": "channel_group",
            "series": [
                {"metric": "sessions", "label": "Sessions"},
                {"metric": "conversions", "label": "Conversions"},
            ],
            "data": rows,
        },
    }


def test_build_chart_spec_line_requires_same_shape_as_bar():
    rows = [{"date": "2026-03-01", "sessions": 100}, {"date": "2026-03-02", "sessions": 150}]

    result = viz_app.build_chart_spec(
        {
            "version": "v1",
            "rows": rows,
            "chartType": "line",
            "xAxis": "date",
            "yAxis": ["sessions"],
        }
    )

    assert result == {
        "version": "v1",
        "spec": {
            "type": "line",
            "xAxis": "date",
            "series": [{"metric": "sessions", "label": "Sessions"}],
            "data": rows,
        },
    }


def test_build_chart_spec_table_omits_x_axis_and_series_and_preserves_rows():
    rows = [
        {"channel_group": "organic", "sessions": 12450, "conversions": 610},
        {"channel_group": "paid_search", "sessions": 7900, "conversions": 315},
    ]

    result = viz_app.build_chart_spec(
        {
            "version": "v1",
            "rows": rows,
            "chartType": "table",
            "title": "Performance Table",
            "xAxis": "channel_group",
            "yAxis": ["sessions"],
        }
    )

    assert result == {
        "version": "v1",
        "spec": {
            "type": "table",
            "title": "Performance Table",
            "data": rows,
        },
    }


def test_lambda_handler_returns_invalid_chart_type_error():
    response = viz_app.lambda_handler(
        {
            "version": "v1",
            "rows": [],
            "chartType": "pie",
        },
        None,
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {
        "version": "v1",
        "error": {
            "code": "INVALID_CHART_TYPE",
            "message": "chartType must be one of bar, line, or table.",
            "retryable": False,
            "actionGroup": "viz",
        },
    }


def test_lambda_handler_returns_missing_axis_error_for_bar_and_line():
    response = viz_app.lambda_handler(
        {
            "version": "v1",
            "rows": [{"channel_group": "organic", "sessions": 10}],
            "chartType": "bar",
            "xAxis": "",
            "yAxis": [],
        },
        None,
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {
        "version": "v1",
        "error": {
            "code": "MISSING_AXIS",
            "message": "xAxis is required for bar and line charts.",
            "retryable": False,
            "actionGroup": "viz",
        },
    }


def test_lambda_handler_returns_missing_axis_error_for_empty_y_axis():
    response = viz_app.lambda_handler(
        {
            "version": "v1",
            "rows": [{"date": "2026-03-01", "sessions": 10}],
            "chartType": "line",
            "xAxis": "date",
            "yAxis": [],
        },
        None,
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {
        "version": "v1",
        "error": {
            "code": "MISSING_AXIS",
            "message": "yAxis must be a non-empty string array for bar and line charts.",
            "retryable": False,
            "actionGroup": "viz",
        },
    }
