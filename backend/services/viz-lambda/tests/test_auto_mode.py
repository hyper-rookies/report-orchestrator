from __future__ import annotations

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import VizError, build_chart_spec, lambda_handler  # noqa: E402


def test_auto_time_series_returns_line() -> None:
    result = build_chart_spec(
        {
            "version": "v1",
            "chartType": "auto",
            "rows": [
                {"date": "2026-03-01", "sessions": 100},
                {"date": "2026-03-02", "sessions": 120},
            ],
            "xAxis": "date",
            "yAxis": ["sessions"],
            "isTimeSeries": True,
        }
    )

    assert result["spec"]["type"] == "line"
    assert result["spec"]["selectionReason"].startswith("auto:")
    assert result["spec"]["xAxis"] == "date"
    assert result["spec"]["series"] == [{"metric": "sessions", "label": "Sessions"}]


def test_auto_composition_small_category_count_returns_pie() -> None:
    result = build_chart_spec(
        {
            "version": "v1",
            "chartType": "auto",
            "rows": [
                {"channel": "Organic", "sessions": 100},
                {"channel": "Paid", "sessions": 80},
                {"channel": "Referral", "sessions": 20},
            ],
            "xAxis": "channel",
            "yAxis": ["sessions"],
            "compositionMode": True,
            "shareMode": True,
            "categoryCount": 3,
        }
    )

    assert result["spec"]["type"] == "pie"
    assert result["spec"]["selectionReason"].startswith("auto:")
    assert result["spec"]["nameKey"] == "channel"
    assert result["spec"]["valueKey"] == "sessions"


def test_auto_ranking_returns_bar() -> None:
    result = build_chart_spec(
        {
            "version": "v1",
            "chartType": "auto",
            "rows": [
                {"channel": "Organic", "sessions": 100},
                {"channel": "Paid", "sessions": 80},
                {"channel": "Referral", "sessions": 20},
            ],
            "xAxis": "channel",
            "yAxis": ["sessions"],
            "questionIntent": "ranking",
        }
    )

    assert result["spec"]["type"] == "bar"
    assert result["spec"]["xAxis"] == "channel"
    assert result["spec"]["series"] == [{"metric": "sessions", "label": "Sessions"}]


def test_auto_uses_x_axis_distinct_count_for_category_calculation() -> None:
    result = build_chart_spec(
        {
            "version": "v1",
            "chartType": "auto",
            "rows": [
                {"channel": "Organic", "sessions": 100},
                {"channel": "Paid", "sessions": 80},
                {"channel": "Organic", "sessions": 20},
                {"channel": "Paid", "sessions": 15},
                {"channel": "Organic", "sessions": 10},
                {"channel": "Paid", "sessions": 5},
                {"channel": "Organic", "sessions": 1},
            ],
            "xAxis": "channel",
            "yAxis": ["sessions"],
            "compositionMode": True,
            "shareMode": True,
        }
    )

    assert result["spec"]["type"] == "pie"


def test_auto_generic_composition_without_share_mode_returns_bar() -> None:
    result = build_chart_spec(
        {
            "version": "v1",
            "chartType": "auto",
            "rows": [
                {"channel": "Organic", "sessions": 100},
                {"channel": "Paid", "sessions": 80},
                {"channel": "Referral", "sessions": 20},
            ],
            "xAxis": "channel",
            "yAxis": ["sessions"],
            "compositionMode": True,
            "categoryCount": 3,
        }
    )

    assert result["spec"]["type"] == "bar"


def test_auto_string_false_hint_does_not_enable_time_series_mode() -> None:
    result = build_chart_spec(
        {
            "version": "v1",
            "chartType": "auto",
            "rows": [
                {"channel": "Organic", "sessions": 100},
                {"channel": "Paid", "sessions": 80},
            ],
            "xAxis": "channel",
            "yAxis": ["sessions"],
            "isTimeSeries": "false",
        }
    )

    assert result["spec"]["type"] == "bar"


def test_auto_string_count_hints_do_not_crash_json_body_path() -> None:
    response = lambda_handler(
        {
            "body": json.dumps(
                {
                    "version": "v1",
                    "chartType": "auto",
                    "rows": [
                        {"channel": "Organic", "sessions": 100},
                        {"channel": "Paid", "sessions": 80},
                    ],
                    "xAxis": "channel",
                    "yAxis": ["sessions"],
                    "rowCount": "2",
                    "metricCount": "1",
                    "categoryCount": "2",
                }
            )
        },
        None,
    )

    body = json.loads(response["body"])
    assert "error" not in body
    assert body["spec"]["type"] == "bar"
    assert body["spec"]["selectionReason"].startswith("auto:")


def test_missing_chart_type_still_raises_invalid_chart_type() -> None:
    with pytest.raises(VizError) as exc_info:
        build_chart_spec({"version": "v1", "rows": []})

    assert exc_info.value.code == "INVALID_CHART_TYPE"


@pytest.mark.parametrize(
    ("payload", "expected_type"),
    [
        (
            {
                "version": "v1",
                "chartType": "bar",
                "rows": [{"channel": "Organic", "sessions": 100}],
                "xAxis": "channel",
                "yAxis": ["sessions"],
            },
            "bar",
        ),
        (
            {
                "version": "v1",
                "chartType": "table",
                "rows": [{"channel": "Organic", "sessions": 100}],
            },
            "table",
        ),
        (
            {
                "version": "v1",
                "chartType": "pie",
                "rows": [{"channel": "Organic", "sessions": 100}],
                "xAxis": "channel",
                "yAxis": ["sessions"],
            },
            "pie",
        ),
    ],
)
def test_explicit_chart_types_remain_unchanged(
    payload: dict[str, object], expected_type: str
) -> None:
    result = build_chart_spec(payload)
    assert result["spec"]["type"] == expected_type
    assert result["spec"]["selectionReason"] == f"explicit: {expected_type}"


def test_explicit_table_returns_selection_reason() -> None:
    result = build_chart_spec(
        {
            "version": "v1",
            "chartType": "table",
            "rows": [{"channel": "Organic", "sessions": 100}],
        }
    )

    assert result["spec"]["selectionReason"] == "explicit: table"


def test_invalid_chart_type_still_raises_invalid_chart_type() -> None:
    with pytest.raises(VizError) as exc_info:
        build_chart_spec(
            {
                "version": "v1",
                "chartType": "scatter",
                "rows": [],
            }
        )

    assert exc_info.value.code == "INVALID_CHART_TYPE"
