from __future__ import annotations

import importlib.util
import json
from pathlib import Path


def _load_module():
    module_path = (
        Path(__file__).resolve().parents[1] / "services" / "analysis-lambda" / "app.py"
    )
    spec = importlib.util.spec_from_file_location("analysis_lambda_app", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


analysis_app = _load_module()


def test_compute_delta_aligns_rows_and_preserves_order():
    result = analysis_app.compute_delta(
        {
            "version": "v1",
            "baseline": [
                {"channel_group": "organic", "sessions": 10000, "conversions": 500},
                {"channel_group": "paid_search", "sessions": 8000, "conversions": 320},
            ],
            "comparison": [
                {"channel_group": "organic", "sessions": 12450, "conversions": 610},
                {"channel_group": "paid_search", "sessions": 7900, "conversions": 315},
            ],
            "groupBy": ["channel_group"],
            "metrics": ["sessions", "conversions"],
        }
    )

    assert result == {
        "version": "v1",
        "deltas": [
            {
                "key": {"channel_group": "organic"},
                "baseline": {"sessions": 10000, "conversions": 500},
                "comparison": {"sessions": 12450, "conversions": 610},
                "delta": {"sessions": 2450, "conversions": 110},
                "pctChange": {"sessions": 0.245, "conversions": 0.22},
            },
            {
                "key": {"channel_group": "paid_search"},
                "baseline": {"sessions": 8000, "conversions": 320},
                "comparison": {"sessions": 7900, "conversions": 315},
                "delta": {"sessions": -100, "conversions": -5},
                "pctChange": {"sessions": -0.0125, "conversions": -0.015625},
            },
        ],
    }


def test_compute_delta_handles_missing_rows_zero_baseline_and_string_metrics():
    result = analysis_app.compute_delta(
        {
            "version": "v1",
            "baseline": [
                {"channel_group": "organic", "sessions": "0", "conversions": "10.5"},
                {"channel_group": "email", "sessions": 50},
            ],
            "comparison": [
                {"channel_group": "organic", "sessions": "4", "conversions": 11.0},
                {"channel_group": "paid_search", "sessions": "20", "conversions": "2"},
            ],
            "groupBy": ["channel_group"],
            "metrics": ["sessions", "conversions"],
        }
    )

    assert result["deltas"] == [
        {
            "key": {"channel_group": "organic"},
            "baseline": {"sessions": 0.0, "conversions": 10.5},
            "comparison": {"sessions": 4.0, "conversions": 11.0},
            "delta": {"sessions": 4.0, "conversions": 0.5},
            "pctChange": {"sessions": None, "conversions": 0.047619047619047616},
        },
        {
            "key": {"channel_group": "email"},
            "baseline": {"sessions": 50, "conversions": None},
            "comparison": {"sessions": None, "conversions": None},
            "delta": {"sessions": None, "conversions": None},
            "pctChange": {"sessions": None, "conversions": None},
        },
        {
            "key": {"channel_group": "paid_search"},
            "baseline": {"sessions": None, "conversions": None},
            "comparison": {"sessions": 20.0, "conversions": 2.0},
            "delta": {"sessions": None, "conversions": None},
            "pctChange": {"sessions": None, "conversions": None},
        },
    ]


def test_lambda_handler_returns_alignment_error():
    response = analysis_app.lambda_handler(
        {
            "version": "v1",
            "baseline": [{"sessions": 10}],
            "comparison": [],
            "groupBy": ["channel_group"],
            "metrics": ["sessions"],
        },
        None,
    )

    assert response["statusCode"] == 400
    body = json.loads(response["body"])
    assert body == {
        "version": "v1",
        "error": {
            "code": "ALIGNMENT_ERROR",
            "message": "Missing groupBy column(s): channel_group",
            "retryable": False,
            "actionGroup": "analysis",
        },
    }


def test_lambda_handler_returns_invalid_metric_value_error():
    response = analysis_app.lambda_handler(
        {
            "version": "v1",
            "baseline": [{"channel_group": "organic", "sessions": "abc"}],
            "comparison": [{"channel_group": "organic", "sessions": 10}],
            "groupBy": ["channel_group"],
            "metrics": ["sessions"],
        },
        None,
    )

    assert response["statusCode"] == 400
    body = json.loads(response["body"])
    assert body["error"]["code"] == "INVALID_METRIC_VALUE"
    assert body["error"]["message"] == "Metric 'sessions' must be numeric."
