"""Deterministic chart selection helpers for viz-lambda."""
from __future__ import annotations

FUNNEL_INTENTS = {"funnel", "retention"}
RAW_INTENTS = {"raw_detail"}
TIME_SERIES_INTENTS = {"time_series"}
RANKING_INTENTS = {"ranking"}

MAX_PIE_CATEGORIES = 6
MAX_BAR_CATEGORIES = 15
MAX_BAR_COMPARISON = 10
MAX_METRIC_FOR_CHART = 3
MAX_ROWS_FOR_CHART = 50
MAX_ROWS_FOR_TIME_SERIES = 120


def select_chart_type(hints: dict, rows: list[dict]) -> tuple[str, str]:
    """Return a chart type and an explanation string."""
    intent = hints.get("questionIntent", "generic")
    is_time_series = hints.get("isTimeSeries", False)
    composition = hints.get("compositionMode", False)
    comparison = hints.get("comparisonMode", False)
    delta = hints.get("deltaIncluded", False)
    x_axis = hints.get("xAxis")

    row_count = hints.get("rowCount") or len(rows)
    metric_count = hints.get("metricCount") or _count_metrics(rows)
    category_count = hints.get("categoryCount") or _count_categories(rows, x_axis)

    if intent in RAW_INTENTS:
        return "table", "auto: raw_detail intent -> table"

    if row_count == 0:
        return "table", "auto: rowCount=0 -> table"

    if intent == "single_kpi" or row_count == 1:
        return "table", "auto: single_kpi or rowCount=1 -> table"

    if is_time_series or intent in TIME_SERIES_INTENTS:
        if row_count <= MAX_ROWS_FOR_TIME_SERIES:
            return "line", f"auto: time_series, metricCount={metric_count} -> line"
        return "table", (
            f"auto: time_series but rowCount={row_count}>{MAX_ROWS_FOR_TIME_SERIES} -> table"
        )

    if composition and metric_count > 1:
        return "stackedBar", f"auto: composition + metricCount={metric_count} -> stackedBar"

    if composition:
        if category_count <= MAX_PIE_CATEGORIES:
            return "pie", f"auto: composition, categoryCount={category_count}<=6 -> pie"
        return "bar", f"auto: composition, categoryCount={category_count}>6 -> bar"

    if comparison and delta:
        return "table", "auto: comparison+delta -> table"

    if intent in FUNNEL_INTENTS:
        return "table", f"auto: {intent} not supported -> table"

    if metric_count > MAX_METRIC_FOR_CHART:
        return "table", f"auto: metricCount={metric_count}>3 -> table"

    if row_count > MAX_ROWS_FOR_CHART:
        return "table", f"auto: rowCount={row_count}>50 -> table"

    if intent in RANKING_INTENTS:
        if category_count <= MAX_BAR_CATEGORIES:
            return "bar", f"auto: ranking, categoryCount={category_count}<=15 -> bar"
        return "table", f"auto: ranking, categoryCount={category_count}>15 -> table"

    if comparison:
        if category_count <= MAX_BAR_COMPARISON:
            return "bar", f"auto: comparison, categoryCount={category_count}<=10 -> bar"
        return "table", f"auto: comparison, categoryCount={category_count}>10 -> table"

    if category_count <= 8:
        return "bar", f"auto: generic, categoryCount={category_count}<=8 -> bar"

    return "table", "auto: fallback -> table"


def _count_metrics(rows: list[dict]) -> int:
    if not rows:
        return 0
    sample = rows[0]
    return sum(1 for value in sample.values() if isinstance(value, (int, float)))


def _count_categories(rows: list[dict], x_axis: str | None = None) -> int:
    if x_axis and rows:
        return len({row.get(x_axis) for row in rows})
    return len(rows)
