"""Unit tests for the deterministic chart selector."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from chart_selector import (  # noqa: E402
    MAX_BAR_CATEGORIES,
    MAX_BAR_COMPARISON,
    MAX_METRIC_FOR_CHART,
    MAX_PIE_CATEGORIES,
    MAX_ROWS_FOR_CHART,
    MAX_ROWS_FOR_TIME_SERIES,
    _count_categories,
    _count_metrics,
    select_chart_type,
)


def _rows(n: int, metrics: int = 1) -> list[dict]:
    rows: list[dict] = []
    for index in range(n):
        row: dict[str, object] = {"dim": f"item-{index}"}
        for metric_index in range(metrics):
            row[f"metric_{metric_index}"] = metric_index * 10
        rows.append(row)
    return rows


def test_raw_detail_returns_table() -> None:
    chart, reason = select_chart_type({"questionIntent": "raw_detail"}, _rows(5))
    assert chart == "table"
    assert "raw_detail" in reason


def test_single_kpi_intent_returns_table() -> None:
    chart, _ = select_chart_type({"questionIntent": "single_kpi"}, _rows(5))
    assert chart == "table"


def test_rowcount_one_hint_returns_table() -> None:
    chart, _ = select_chart_type({"rowCount": 1}, _rows(5))
    assert chart == "table"


def test_single_row_returns_table() -> None:
    chart, _ = select_chart_type({}, _rows(1))
    assert chart == "table"


def test_time_series_intent_returns_line() -> None:
    chart, _ = select_chart_type({"questionIntent": "time_series"}, _rows(7))
    assert chart == "line"


def test_is_time_series_flag_returns_line() -> None:
    chart, _ = select_chart_type({"isTimeSeries": True}, _rows(7))
    assert chart == "line"


def test_time_series_under_threshold_returns_line() -> None:
    chart, _ = select_chart_type({"isTimeSeries": True, "rowCount": 90}, _rows(90))
    assert chart == "line"


def test_time_series_over_threshold_returns_table() -> None:
    chart, _ = select_chart_type(
        {"isTimeSeries": True, "rowCount": MAX_ROWS_FOR_TIME_SERIES + 1},
        _rows(MAX_ROWS_FOR_TIME_SERIES + 1),
    )
    assert chart == "table"


def test_composition_with_multiple_metrics_returns_stacked_bar() -> None:
    chart, _ = select_chart_type(
        {"compositionMode": True, "metricCount": 2},
        _rows(4, metrics=2),
    )
    assert chart == "stackedBar"


def test_composition_small_category_count_returns_pie() -> None:
    chart, _ = select_chart_type(
        {"compositionMode": True, "shareMode": True, "categoryCount": 4},
        _rows(4),
    )
    assert chart == "pie"


def test_composition_boundary_at_six_returns_pie() -> None:
    chart, _ = select_chart_type(
        {"compositionMode": True, "shareMode": True, "categoryCount": MAX_PIE_CATEGORIES},
        _rows(MAX_PIE_CATEGORIES),
    )
    assert chart == "pie"


def test_composition_large_category_count_returns_bar() -> None:
    chart, _ = select_chart_type(
        {"compositionMode": True, "shareMode": True, "categoryCount": MAX_PIE_CATEGORIES + 1},
        _rows(MAX_PIE_CATEGORIES + 1),
    )
    assert chart == "bar"


def test_generic_composition_without_share_mode_returns_bar() -> None:
    chart, _ = select_chart_type(
        {"compositionMode": True, "categoryCount": 4},
        _rows(4),
    )
    assert chart == "bar"


def test_comparison_with_delta_returns_table() -> None:
    chart, _ = select_chart_type(
        {"comparisonMode": True, "deltaIncluded": True},
        _rows(5),
    )
    assert chart == "table"


def test_funnel_returns_table() -> None:
    chart, _ = select_chart_type({"questionIntent": "funnel"}, _rows(4))
    assert chart == "table"


def test_retention_returns_table() -> None:
    chart, _ = select_chart_type({"questionIntent": "retention"}, _rows(4))
    assert chart == "table"


def test_metric_explosion_returns_table() -> None:
    chart, _ = select_chart_type(
        {"metricCount": MAX_METRIC_FOR_CHART + 1},
        _rows(5, metrics=4),
    )
    assert chart == "table"


def test_row_explosion_returns_table() -> None:
    chart, _ = select_chart_type(
        {"rowCount": MAX_ROWS_FOR_CHART + 1},
        _rows(MAX_ROWS_FOR_CHART + 1),
    )
    assert chart == "table"


def test_ranking_small_category_count_returns_bar() -> None:
    chart, _ = select_chart_type(
        {"questionIntent": "ranking", "categoryCount": 10},
        _rows(10),
    )
    assert chart == "bar"


def test_ranking_boundary_at_fifteen_returns_bar() -> None:
    chart, _ = select_chart_type(
        {"questionIntent": "ranking", "categoryCount": MAX_BAR_CATEGORIES},
        _rows(MAX_BAR_CATEGORIES),
    )
    assert chart == "bar"


def test_ranking_large_category_count_returns_table() -> None:
    chart, _ = select_chart_type(
        {"questionIntent": "ranking", "categoryCount": MAX_BAR_CATEGORIES + 1},
        _rows(MAX_BAR_CATEGORIES + 1),
    )
    assert chart == "table"


def test_comparison_small_category_count_returns_bar() -> None:
    chart, _ = select_chart_type(
        {"comparisonMode": True, "categoryCount": 5},
        _rows(5),
    )
    assert chart == "bar"


def test_comparison_boundary_at_ten_returns_bar() -> None:
    chart, _ = select_chart_type(
        {"comparisonMode": True, "categoryCount": MAX_BAR_COMPARISON},
        _rows(MAX_BAR_COMPARISON),
    )
    assert chart == "bar"


def test_comparison_large_category_count_returns_table() -> None:
    chart, _ = select_chart_type(
        {"comparisonMode": True, "categoryCount": MAX_BAR_COMPARISON + 1},
        _rows(MAX_BAR_COMPARISON + 1),
    )
    assert chart == "table"


def test_generic_small_category_count_returns_bar() -> None:
    chart, _ = select_chart_type({}, _rows(5))
    assert chart == "bar"


def test_generic_large_category_count_falls_back_to_table() -> None:
    chart, _ = select_chart_type({}, _rows(9))
    assert chart == "table"


def test_empty_rows_fall_back_to_table() -> None:
    chart, _ = select_chart_type({}, [])
    assert chart == "table"


def test_time_series_priority_beats_composition() -> None:
    chart, _ = select_chart_type(
        {"isTimeSeries": True, "compositionMode": True},
        _rows(5),
    )
    assert chart == "line"


def test_count_metrics_counts_only_numeric_values() -> None:
    rows = [{"name": "A", "sessions": 100, "users": 50}]
    assert _count_metrics(rows) == 2


def test_count_metrics_handles_non_numeric_rows() -> None:
    rows = [{"name": "A", "label": "B"}]
    assert _count_metrics(rows) == 0


def test_count_metrics_handles_empty_rows() -> None:
    assert _count_metrics([]) == 0


def test_count_categories_defaults_to_row_count() -> None:
    rows = [{"channel": "A"}, {"channel": "B"}, {"channel": "C"}]
    assert _count_categories(rows) == 3


def test_count_categories_uses_x_axis_distinct_count() -> None:
    rows = [
        {"channel": "Organic", "sessions": 100},
        {"channel": "Paid", "sessions": 200},
        {"channel": "Organic", "sessions": 150},
    ]
    assert _count_categories(rows, x_axis="channel") == 2


def test_count_categories_handles_empty_rows() -> None:
    assert _count_categories([]) == 0


def test_x_axis_distinct_count_changes_chart_selection() -> None:
    rows = [
        {"channel": "Organic", "sessions": 100},
        {"channel": "Paid", "sessions": 200},
        {"channel": "Organic", "sessions": 150},
    ]
    chart, _ = select_chart_type(
        {"compositionMode": True, "shareMode": True, "xAxis": "channel"},
        rows,
    )
    assert chart == "pie"
