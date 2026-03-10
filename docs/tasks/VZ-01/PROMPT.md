# VZ-01: chart_selector.py — 결정론적 차트 선택 엔진

## 목적

`backend/services/viz-lambda/chart_selector.py` 와 단위 테스트 `backend/services/viz-lambda/tests/test_chart_selector.py` 를 신규 생성한다. 기존 파일은 수정하지 않는다.

---

## 배경

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` §3, §5 — 반드시 읽을 것
- `app.py` 에는 아직 손대지 않는다. 이 태스크는 순수 신규 모듈 생성이다.
- 테스트 실행 디렉터리: `backend/services/viz-lambda/`
- 테스트 실행 명령: `python -m pytest tests/test_chart_selector.py -v`

---

## 생성 파일

| 파일 | 액션 |
|------|------|
| `backend/services/viz-lambda/chart_selector.py` | 신규 생성 |
| `backend/services/viz-lambda/tests/test_chart_selector.py` | 신규 생성 |

---

## 구현 코드

### `backend/services/viz-lambda/chart_selector.py`

```python
"""chart_selector.py — deterministic chart type selection engine for viz-lambda."""
from __future__ import annotations

FUNNEL_INTENTS = {"funnel", "retention"}
RAW_INTENTS = {"raw_detail"}
TIME_SERIES_INTENTS = {"time_series"}
RANKING_INTENTS = {"ranking"}
COMPOSITION_INTENTS = {"composition"}
COMPARISON_INTENTS = {"comparison"}

MAX_PIE_CATEGORIES = 6
MAX_BAR_CATEGORIES = 15
MAX_BAR_COMPARISON = 10
MAX_METRIC_FOR_CHART = 3
MAX_ROWS_FOR_CHART = 50
MAX_ROWS_FOR_TIME_SERIES = 120  # 시계열은 row가 많아도 line이 적절


def select_chart_type(hints: dict, rows: list[dict]) -> tuple[str, str]:
    """Return (chart_type, selection_reason).

    Rules are evaluated in priority order — first match wins.
    hints are optional; missing values are inferred from rows.
    """
    intent = hints.get("questionIntent", "generic")
    is_time_series = hints.get("isTimeSeries", False)
    composition = hints.get("compositionMode", False)
    comparison = hints.get("comparisonMode", False)
    delta = hints.get("deltaIncluded", False)
    x_axis = hints.get("xAxis")  # categoryCount distinct 계산에 사용

    # Infer from rows when hint is absent
    row_count = hints.get("rowCount") or len(rows)
    metric_count = hints.get("metricCount") or _count_metrics(rows)
    # xAxis distinct count 우선, 없으면 row 수로 fallback
    category_count = hints.get("categoryCount") or _count_categories(rows, x_axis)

    # Rule 1: explicit table request
    if intent in RAW_INTENTS:
        return "table", "auto: raw_detail intent → table"

    # Rule 2: single KPI or single row (dashboard KPI card와 별개 — 여기서는 table)
    if intent == "single_kpi" or row_count == 1:
        return "table", f"auto: single_kpi or rowCount=1 → table"

    # Rule 3-4: time series — higher rowCount threshold (120)
    if is_time_series or intent in TIME_SERIES_INTENTS:
        if row_count <= MAX_ROWS_FOR_TIME_SERIES:
            return "line", f"auto: time_series, metricCount={metric_count} → line"
        return "table", f"auto: time_series but rowCount={row_count}>{MAX_ROWS_FOR_TIME_SERIES} → table"

    # Rule 7: composition + multiple metrics → stackedBar (before Rule 5-6)
    if composition and metric_count > 1:
        return "stackedBar", f"auto: composition + metricCount={metric_count} → stackedBar"

    # Rule 5: composition + small category count → pie
    # Rule 6: composition + large category count → bar
    if composition:
        if category_count <= MAX_PIE_CATEGORIES:
            return "pie", f"auto: composition, categoryCount={category_count}≤{MAX_PIE_CATEGORIES} → pie"
        return "bar", f"auto: composition, categoryCount={category_count}>{MAX_PIE_CATEGORIES} → bar"

    # Rule 12: comparison with delta → table (delta badge는 dashboard 전용)
    if comparison and delta:
        return "table", "auto: comparison+delta → table"

    # Rule 17-18: funnel / retention → table (chart types not supported)
    if intent in FUNNEL_INTENTS:
        return "table", f"auto: {intent} not supported → table"

    # Rule 13: too many metrics → table
    if metric_count > MAX_METRIC_FOR_CHART:
        return "table", f"auto: metricCount={metric_count}>{MAX_METRIC_FOR_CHART} → table"

    # Rule 14: too many rows → table (비시계열 한정)
    if row_count > MAX_ROWS_FOR_CHART:
        return "table", f"auto: rowCount={row_count}>{MAX_ROWS_FOR_CHART} → table"

    # Rule 8-9: ranking
    if intent in RANKING_INTENTS:
        if category_count <= MAX_BAR_CATEGORIES:
            return "bar", f"auto: ranking, categoryCount={category_count}≤{MAX_BAR_CATEGORIES} → bar"
        return "table", f"auto: ranking, categoryCount={category_count}>{MAX_BAR_CATEGORIES} → table"

    # Rule 10-11: comparison
    if comparison:
        if category_count <= MAX_BAR_COMPARISON:
            return "bar", f"auto: comparison, categoryCount={category_count}≤{MAX_BAR_COMPARISON} → bar"
        return "table", f"auto: comparison, categoryCount={category_count}>{MAX_BAR_COMPARISON} → table"

    # Rule 15: generic small category count → bar
    if category_count <= 8:
        return "bar", f"auto: generic, categoryCount={category_count}≤8 → bar"

    # Rule 20: fallback
    return "table", "auto: fallback → table"


def _count_metrics(rows: list[dict]) -> int:
    """Count numeric columns in the first row as proxy for metric count."""
    if not rows:
        return 0
    sample = rows[0]
    return sum(1 for v in sample.values() if isinstance(v, (int, float)))


def _count_categories(rows: list[dict], x_axis: str | None = None) -> int:
    """xAxis distinct count 우선, 없으면 row 수 fallback."""
    if x_axis and rows:
        return len({row.get(x_axis) for row in rows})
    return len(rows)
```

### `backend/services/viz-lambda/tests/test_chart_selector.py`

```python
"""test_chart_selector.py — unit tests for the deterministic chart selection engine."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from chart_selector import (
    select_chart_type,
    _count_metrics,
    _count_categories,
    MAX_PIE_CATEGORIES,
    MAX_BAR_CATEGORIES,
    MAX_BAR_COMPARISON,
    MAX_METRIC_FOR_CHART,
    MAX_ROWS_FOR_CHART,
    MAX_ROWS_FOR_TIME_SERIES,
)

# ── helpers ───────────────────────────────────────────────────────────────────

def _rows(n: int, metrics: int = 1) -> list[dict]:
    """Generate n rows with 1 string dim + 'metrics' numeric columns."""
    row: dict = {"dim": "x"}
    for i in range(metrics):
        row[f"metric_{i}"] = i * 10
    return [dict(row) for _ in range(n)]


# ── Rule 1: raw_detail → table ────────────────────────────────────────────────

def test_rule_1_raw_detail():
    chart, reason = select_chart_type({"questionIntent": "raw_detail"}, _rows(5))
    assert chart == "table"
    assert "raw_detail" in reason


# ── Rule 2: single_kpi or rowCount == 1 → table ───────────────────────────────

def test_rule_2_single_kpi_intent():
    chart, _ = select_chart_type({"questionIntent": "single_kpi"}, _rows(1))
    assert chart == "table"


def test_rule_2_rowcount_1_via_hint():
    chart, _ = select_chart_type({"rowCount": 1}, _rows(5))
    assert chart == "table"


def test_rule_2_rowcount_1_via_rows():
    chart, _ = select_chart_type({}, _rows(1))
    assert chart == "table"


# ── Rule 3-4: time_series → line (up to MAX_ROWS_FOR_TIME_SERIES) ────────────

def test_rule_3_time_series_intent():
    chart, _ = select_chart_type({"questionIntent": "time_series"}, _rows(7))
    assert chart == "line"


def test_rule_4_is_time_series_flag():
    chart, _ = select_chart_type({"isTimeSeries": True}, _rows(7))
    assert chart == "line"


def test_rule_4_time_series_multi_metric():
    chart, _ = select_chart_type({"isTimeSeries": True, "metricCount": 3}, _rows(7, metrics=3))
    assert chart == "line"


def test_rule_4_time_series_90_days():
    """90일 일별 추이도 line이어야 한다 (rowCount=90 ≤ 120)."""
    chart, _ = select_chart_type({"isTimeSeries": True, "rowCount": 90}, _rows(90))
    assert chart == "line"


def test_rule_4_time_series_over_120_falls_to_table():
    chart, _ = select_chart_type(
        {"isTimeSeries": True, "rowCount": MAX_ROWS_FOR_TIME_SERIES + 1},
        _rows(MAX_ROWS_FOR_TIME_SERIES + 1),
    )
    assert chart == "table"


# ── Rule 7: composition + metricCount > 1 → stackedBar ───────────────────────

def test_rule_7_composition_multi_metric():
    chart, _ = select_chart_type(
        {"compositionMode": True, "metricCount": 2}, _rows(4, metrics=2)
    )
    assert chart == "stackedBar"


# ── Rule 5: composition + categoryCount ≤ 6 → pie ───────────────────────────

def test_rule_5_composition_small():
    chart, _ = select_chart_type(
        {"compositionMode": True, "categoryCount": 4}, _rows(4)
    )
    assert chart == "pie"


def test_rule_5_boundary_exactly_6():
    chart, _ = select_chart_type(
        {"compositionMode": True, "categoryCount": MAX_PIE_CATEGORIES},
        _rows(MAX_PIE_CATEGORIES),
    )
    assert chart == "pie"


# ── Rule 6: composition + categoryCount > 6 → bar ────────────────────────────

def test_rule_6_composition_large():
    chart, _ = select_chart_type(
        {"compositionMode": True, "categoryCount": MAX_PIE_CATEGORIES + 1},
        _rows(MAX_PIE_CATEGORIES + 1),
    )
    assert chart == "bar"


# ── Rule 12: comparison + delta → table ──────────────────────────────────────

def test_rule_12_comparison_delta():
    chart, _ = select_chart_type(
        {"comparisonMode": True, "deltaIncluded": True}, _rows(5)
    )
    assert chart == "table"


# ── Rule 17: funnel → table ───────────────────────────────────────────────────

def test_rule_17_funnel():
    chart, _ = select_chart_type({"questionIntent": "funnel"}, _rows(4))
    assert chart == "table"


# ── Rule 18: retention → table ───────────────────────────────────────────────

def test_rule_18_retention():
    chart, _ = select_chart_type({"questionIntent": "retention"}, _rows(4))
    assert chart == "table"


# ── Rule 13: metricCount > 3 → table ─────────────────────────────────────────

def test_rule_13_metric_explosion():
    chart, _ = select_chart_type(
        {"metricCount": MAX_METRIC_FOR_CHART + 1}, _rows(5, metrics=4)
    )
    assert chart == "table"


def test_rule_13_boundary_exactly_3():
    chart, _ = select_chart_type(
        {"metricCount": MAX_METRIC_FOR_CHART, "categoryCount": 5}, _rows(5, metrics=3)
    )
    assert chart == "bar"


# ── Rule 14: rowCount > 50 → table (비시계열 한정) ───────────────────────────

def test_rule_14_row_explosion_non_time_series():
    chart, _ = select_chart_type(
        {"rowCount": MAX_ROWS_FOR_CHART + 1}, _rows(51)
    )
    assert chart == "table"


def test_rule_14_boundary_exactly_50():
    chart, _ = select_chart_type(
        {"rowCount": MAX_ROWS_FOR_CHART, "categoryCount": 5}, _rows(50)
    )
    assert chart == "bar"


# ── Rule 8: ranking + categoryCount ≤ 15 → bar ───────────────────────────────

def test_rule_8_ranking_small():
    chart, _ = select_chart_type(
        {"questionIntent": "ranking", "categoryCount": 10}, _rows(10)
    )
    assert chart == "bar"


def test_rule_8_boundary_exactly_15():
    chart, _ = select_chart_type(
        {"questionIntent": "ranking", "categoryCount": MAX_BAR_CATEGORIES},
        _rows(MAX_BAR_CATEGORIES),
    )
    assert chart == "bar"


# ── Rule 9: ranking + categoryCount > 15 → table ─────────────────────────────

def test_rule_9_ranking_large():
    chart, _ = select_chart_type(
        {"questionIntent": "ranking", "categoryCount": MAX_BAR_CATEGORIES + 1},
        _rows(MAX_BAR_CATEGORIES + 1),
    )
    assert chart == "table"


# ── Rule 10: comparison + categoryCount ≤ 10 → bar ───────────────────────────

def test_rule_10_comparison_small():
    chart, _ = select_chart_type(
        {"comparisonMode": True, "categoryCount": 5}, _rows(5)
    )
    assert chart == "bar"


def test_rule_10_boundary_exactly_10():
    chart, _ = select_chart_type(
        {"comparisonMode": True, "categoryCount": MAX_BAR_COMPARISON},
        _rows(MAX_BAR_COMPARISON),
    )
    assert chart == "bar"


# ── Rule 11: comparison + categoryCount > 10 → table ─────────────────────────

def test_rule_11_comparison_large():
    chart, _ = select_chart_type(
        {"comparisonMode": True, "categoryCount": MAX_BAR_COMPARISON + 1},
        _rows(MAX_BAR_COMPARISON + 1),
    )
    assert chart == "table"


# ── Rule 15: generic categoryCount ≤ 8 → bar ─────────────────────────────────

def test_rule_15_generic_small():
    chart, _ = select_chart_type({}, _rows(5))
    assert chart == "bar"


def test_rule_15_boundary_exactly_8():
    chart, _ = select_chart_type({}, _rows(8))
    assert chart == "bar"


# ── Rule 20: fallback → table ─────────────────────────────────────────────────

def test_rule_20_generic_large():
    chart, reason = select_chart_type({}, _rows(9))
    assert chart == "table"


def test_rule_20_empty_rows_fallback():
    chart, reason = select_chart_type({}, [])
    assert chart == "table"


# ── priority: time_series beats composition ───────────────────────────────────

def test_priority_time_series_beats_composition():
    chart, _ = select_chart_type(
        {"isTimeSeries": True, "compositionMode": True}, _rows(5)
    )
    assert chart == "line"


# ── _count_metrics ────────────────────────────────────────────────────────────

def test_count_metrics_numeric_only():
    rows = [{"name": "A", "sessions": 100, "users": 50}]
    assert _count_metrics(rows) == 2


def test_count_metrics_no_numeric():
    rows = [{"name": "A", "label": "B"}]
    assert _count_metrics(rows) == 0


def test_count_metrics_empty():
    assert _count_metrics([]) == 0


# ── _count_categories ─────────────────────────────────────────────────────────

def test_count_categories_fallback_len_rows():
    rows = [{"ch": "A"}, {"ch": "B"}, {"ch": "C"}]
    assert _count_categories(rows) == 3


def test_count_categories_with_x_axis_distinct():
    """xAxis 있으면 distinct count를 사용한다."""
    rows = [
        {"channel": "Organic", "sessions": 100},
        {"channel": "Paid", "sessions": 200},
        {"channel": "Organic", "sessions": 150},  # 중복 — distinct는 2
    ]
    assert _count_categories(rows, x_axis="channel") == 2


def test_count_categories_empty():
    assert _count_categories([]) == 0


# ── xAxis hint in select_chart_type ──────────────────────────────────────────

def test_x_axis_hint_affects_category_count():
    """중복 row가 있을 때 xAxis distinct count로 올바른 chart 선택."""
    rows = [
        {"channel": "Organic", "sessions": 100},
        {"channel": "Paid", "sessions": 200},
        {"channel": "Organic", "sessions": 150},
    ]
    # xAxis distinct=2, compositionMode → pie (≤6)
    chart, _ = select_chart_type(
        {"compositionMode": True, "xAxis": "channel"}, rows
    )
    assert chart == "pie"
```

---

## 검증

```bash
cd backend/services/viz-lambda
python -m pytest tests/test_chart_selector.py -v
# 모든 테스트 통과 (exit code 0)
```

---

## 수락 기준

- [ ] `backend/services/viz-lambda/chart_selector.py` 생성됨
- [ ] `backend/services/viz-lambda/tests/test_chart_selector.py` 생성됨
- [ ] `_count_categories(rows, x_axis)` — xAxis distinct count 우선, fallback len(rows)
- [ ] `MAX_ROWS_FOR_TIME_SERIES = 120` 상수 존재
- [ ] 시계열 rowCount=90 → line, rowCount=121 → table 테스트 통과
- [ ] `python -m pytest tests/test_chart_selector.py -v` exit code 0
- [ ] 기존 `app.py` 수정 없음
