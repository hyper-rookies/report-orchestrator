from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


def _load_module():
    service_dir = Path(__file__).resolve().parents[1] / "services" / "viz-lambda"
    sys.path.insert(0, str(service_dir))
    module_path = service_dir / "app.py"
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
            "selectionReason": "explicit: bar",
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
            "selectionReason": "explicit: line",
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
            "selectionReason": "explicit: table",
            "data": rows,
        },
    }


def test_lambda_handler_returns_invalid_chart_type_error():
    response = viz_app.lambda_handler(
        {
            "version": "v1",
            "rows": [],
            "chartType": "scatter",
        },
        None,
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body == {
        "version": "v1",
        "error": {
            "code": "INVALID_CHART_TYPE",
            "message": "chartType must be one of auto, bar, line, table, pie, or stackedBar.",
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
            "message": "xAxis is required for bar, line, and stackedBar charts.",
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
            "message": "yAxis must be a non-empty string array for bar, line, and stackedBar charts.",
            "retryable": False,
            "actionGroup": "viz",
        },
    }


def test_build_chart_spec_pie_uses_name_key_and_value_key():
    rows = [
        {"channel_group": "organic", "sessions": 12450},
        {"channel_group": "paid_search", "sessions": 7900},
    ]

    result = viz_app.build_chart_spec(
        {
            "version": "v1",
            "rows": rows,
            "chartType": "pie",
            "title": "Sessions Share by Channel",
            "xAxis": "channel_group",
            "yAxis": ["sessions"],
        }
    )

    assert result == {
        "version": "v1",
        "spec": {
            "type": "pie",
            "title": "Sessions Share by Channel",
            "selectionReason": "explicit: pie",
            "nameKey": "channel_group",
            "valueKey": "sessions",
            "data": rows,
        },
    }


def test_build_chart_spec_stacked_bar_preserves_multi_series():
    rows = [
        {"media_source": "organic", "retained_users": 120, "cohort_size": 300},
        {"media_source": "facebook_ads", "retained_users": 90, "cohort_size": 280},
    ]

    result = viz_app.build_chart_spec(
        {
            "version": "v1",
            "rows": rows,
            "chartType": "stackedBar",
            "title": "Cohort Retention",
            "xAxis": "media_source",
            "yAxis": ["retained_users", "cohort_size"],
        }
    )

    assert result == {
        "version": "v1",
        "spec": {
            "type": "stackedBar",
            "title": "Cohort Retention",
            "selectionReason": "explicit: stackedBar",
            "xAxis": "media_source",
            "series": [
                {"metric": "retained_users", "label": "Retained Users"},
                {"metric": "cohort_size", "label": "Cohort Size"},
            ],
            "data": rows,
        },
    }


def test_whitespace_xaxis_rejected():
    event = {
        "chartType": "bar",
        "rows": [{"date": "2026-01-01", "installs": 100}],
        "xAxis": "   ",
        "yAxis": ["installs"],
    }

    response = viz_app.lambda_handler(event, None)
    body = json.loads(response["body"])
    assert body["error"]["code"] == "MISSING_AXIS"


def test_whitespace_yaxis_rejected():
    event = {
        "chartType": "bar",
        "rows": [{"date": "2026-01-01", "installs": 100}],
        "xAxis": "date",
        "yAxis": ["   "],
    }

    response = viz_app.lambda_handler(event, None)
    body = json.loads(response["body"])
    assert body["error"]["code"] == "MISSING_AXIS"


def test_missing_chart_type():
    event = {
        "rows": [{"date": "2026-01-01", "installs": 100}],
    }

    response = viz_app.lambda_handler(event, None)
    body = json.loads(response["body"])
    assert body["error"]["code"] == "INVALID_CHART_TYPE"


def test_lambda_handler_accepts_proxy_body_shape():
    response = viz_app.lambda_handler(
        {
            "body": json.dumps(
                {
                    "version": "v1",
                    "rows": [{"date": "2026-03-01", "sessions": 10}],
                    "chartType": "line",
                    "xAxis": "date",
                    "yAxis": ["sessions"],
                }
            )
        },
        None,
    )

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["spec"] == {
        "type": "line",
        "selectionReason": "explicit: line",
        "xAxis": "date",
        "series": [{"metric": "sessions", "label": "Sessions"}],
        "data": [{"date": "2026-03-01", "sessions": 10}],
    }


def test_parse_bedrock_params_accepts_non_json_array_and_object_literals():
    event = {
        "actionGroup": "viz",
        "function": "buildChartSpec",
        "parameters": [
            {"name": "rows", "type": "array", "value": "[{channel_group=Organic Search, sessions=80507}]"},
            {"name": "yAxis", "type": "array", "value": "[sessions]"},
            {"name": "chartType", "type": "string", "value": "pie"},
            {"name": "xAxis", "type": "string", "value": "channel_group"},
        ],
    }

    parsed = viz_app._parse_bedrock_params(event)
    assert parsed["chartType"] == "pie"
    assert parsed["xAxis"] == "channel_group"
    assert parsed["yAxis"] == ["sessions"]
    assert parsed["rows"] == [{"channel_group": "Organic Search", "sessions": 80507}]


def test_lambda_handler_bedrock_pie_tolerates_non_json_parameter_literals():
    event = {
        "actionGroup": "viz",
        "function": "buildChartSpec",
        "parameters": [
            {"name": "chartType", "type": "string", "value": "pie"},
            {"name": "xAxis", "type": "string", "value": "channel_group"},
            {"name": "yAxis", "type": "array", "value": "[SUM(sessions)]"},
            {
                "name": "rows",
                "type": "array",
                "value": "[{channel_group=Organic Search, SUM(sessions)=80507}, {channel_group=Direct, SUM(sessions)=69631}]",
            },
        ],
    }

    response = viz_app.lambda_handler(event, None)
    body_text = response["response"]["functionResponse"]["responseBody"]["TEXT"]["body"]
    body = json.loads(body_text)

    assert body["version"] == "v1"
    assert body["spec"]["type"] == "pie"
    assert body["spec"]["selectionReason"] == "explicit: pie"
    assert body["spec"]["nameKey"] == "channel_group"
    assert body["spec"]["valueKey"] == "SUM(sessions)"
    assert len(body["spec"]["data"]) == 2
