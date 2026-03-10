# Task VZ-00: 리뷰 인프라 구축 (Auto Chart Selection Task Setup)

## 목적

코드를 작성하지 않는다. VZ-01~VZ-04 태스크의 구현 프롬프트와 리뷰 템플릿을 `docs/tasks/` 폴더에 생성하고, `docs/tasks/status.json`에 VZ 태스크들을 추가한다.

---

## 배경 (최소 컨텍스트)

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` — 반드시 읽고 시작할 것
- **프로젝트:** `report-orchestrator` — Python backend (`backend/services/viz-lambda/`)
- **목표:** viz-lambda에 결정론적 차트 자동 선택 엔진 추가 (`chartType: "auto"` 지원)
- **전제 조건:** 없음 (Python 전용 백엔드 작업)
- **경고:** Windows 환경. 경로 구분자는 `/` 사용. Python은 `python -m pytest`로 실행.

---

## 작업 내용

아래 파일들을 생성하라.

### 생성할 파일 목록

```
docs/tasks/
├── status.json              ← VZ-01~04 항목 추가 (기존 항목 유지)
├── VZ-01/
│   ├── PROMPT.md
│   └── REPORT.md
├── VZ-02/
│   ├── PROMPT.md
│   └── REPORT.md
├── VZ-03/
│   ├── PROMPT.md
│   └── REPORT.md
└── VZ-04/
    ├── PROMPT.md
    └── REPORT.md
```

---

## 파일 내용

### 1. `docs/tasks/status.json` 업데이트

기존 항목은 그대로 두고 VZ-* 항목을 추가한다. 아래 VZ 블록을 `tasks` 오브젝트 마지막에 추가하라:

```json
"VZ-01": { "status": "pending", "title": "chart_selector.py — 결정론적 선택 엔진 + 단위 테스트", "completedAt": null },
"VZ-02": { "status": "pending", "title": "app.py — chartType=auto 지원 + test_auto_mode.py", "completedAt": null },
"VZ-03": { "status": "pending", "title": "selectionReason → spec 추가 + CONTRACTS.md 업데이트", "completedAt": null },
"VZ-04": { "status": "pending", "title": "Bedrock Agent 프롬프트 — auto 모드 + hint 전달 지침", "completedAt": null }
```

---

### 2. `docs/tasks/VZ-01/PROMPT.md`

````markdown
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

    # Infer from rows when hint is absent
    row_count = hints.get("rowCount") or len(rows)
    metric_count = hints.get("metricCount") or _count_metrics(rows)
    category_count = hints.get("categoryCount") or _count_categories(rows)

    # Rule 1: explicit table request
    if intent in RAW_INTENTS:
        return "table", "auto: raw_detail intent → table"

    # Rule 2: single KPI or single row
    if intent == "single_kpi" or row_count == 1:
        return "table", f"auto: single_kpi or rowCount=1 → table"

    # Rule 3-4: time series (single or multi-metric both → line)
    if is_time_series or intent in TIME_SERIES_INTENTS:
        return "line", f"auto: time_series, metricCount={metric_count} → line"

    # Rule 7: composition + multiple metrics → stackedBar (before Rule 5-6)
    if composition and metric_count > 1:
        return "stackedBar", f"auto: composition + metricCount={metric_count} → stackedBar"

    # Rule 5: composition + small category count → pie
    # Rule 6: composition + large category count → bar
    if composition:
        if category_count <= MAX_PIE_CATEGORIES:
            return "pie", f"auto: composition, categoryCount={category_count}≤{MAX_PIE_CATEGORIES} → pie"
        return "bar", f"auto: composition, categoryCount={category_count}>{MAX_PIE_CATEGORIES} → bar"

    # Rule 12: comparison with delta → table (delta badge not supported yet)
    if comparison and delta:
        return "table", "auto: comparison+delta → table"

    # Rule 17-18: funnel / retention → table (chart types not supported)
    if intent in FUNNEL_INTENTS:
        return "table", f"auto: {intent} not supported → table"

    # Rule 13: too many metrics → table
    if metric_count > MAX_METRIC_FOR_CHART:
        return "table", f"auto: metricCount={metric_count}>{MAX_METRIC_FOR_CHART} → table"

    # Rule 14: too many rows → table
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


def _count_categories(rows: list[dict]) -> int:
    """Use row count as proxy for category count."""
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


# ── Rule 3-4: time_series → line ─────────────────────────────────────────────

def test_rule_3_time_series_intent():
    chart, _ = select_chart_type({"questionIntent": "time_series"}, _rows(7))
    assert chart == "line"


def test_rule_4_is_time_series_flag():
    chart, _ = select_chart_type({"isTimeSeries": True}, _rows(7))
    assert chart == "line"


def test_rule_4_time_series_multi_metric():
    chart, _ = select_chart_type({"isTimeSeries": True, "metricCount": 3}, _rows(7, metrics=3))
    assert chart == "line"


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
        {"compositionMode": True, "categoryCount": MAX_PIE_CATEGORIES}, _rows(MAX_PIE_CATEGORIES)
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


# ── Rule 14: rowCount > 50 → table ───────────────────────────────────────────

def test_rule_14_row_explosion():
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


# ── Rule 16/20: generic categoryCount > 8 → table (fallback) ─────────────────

def test_rule_16_generic_large():
    chart, reason = select_chart_type({}, _rows(9))
    assert chart == "table"


def test_rule_20_empty_rows_fallback():
    chart, reason = select_chart_type({}, [])
    assert chart == "table"
    assert "fallback" in reason or "rowCount=1" in reason or "single_kpi" in reason


# ── priority conflict: time_series beats composition ─────────────────────────

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

def test_count_categories():
    rows = [{"ch": "A"}, {"ch": "B"}, {"ch": "C"}]
    assert _count_categories(rows) == 3


def test_count_categories_empty():
    assert _count_categories([]) == 0
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

- [x] `backend/services/viz-lambda/chart_selector.py` 생성됨
- [x] `backend/services/viz-lambda/tests/test_chart_selector.py` 생성됨
- [x] `python -m pytest tests/test_chart_selector.py -v` exit code 0
- [x] 기존 `app.py` 수정 없음
````

---

### 3. `docs/tasks/VZ-01/REPORT.md`

```markdown
# VZ-01 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `backend/services/viz-lambda/chart_selector.py` created
- [ ] `backend/services/viz-lambda/tests/test_chart_selector.py` created
- [ ] `python -m pytest tests/test_chart_selector.py -v` passes (exit code 0)
- [ ] Existing `app.py` not modified

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/services/viz-lambda/chart_selector.py` | Created | |
| `backend/services/viz-lambda/tests/test_chart_selector.py` | Created | |

---

## Test Output

```bash
$ cd backend/services/viz-lambda
$ python -m pytest tests/test_chart_selector.py -v
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 4. `docs/tasks/VZ-02/PROMPT.md`

````markdown
# VZ-02: app.py — `chartType: "auto"` 지원 + test_auto_mode.py

## 목적

`backend/services/viz-lambda/app.py` 를 수정해 `chartType: "auto"` 입력 시 `chart_selector.py` 의 `select_chart_type()` 을 호출하도록 한다. `tests/test_auto_mode.py` 를 신규 생성한다.

---

## 선행 조건

- **VZ-01 완료 필수.** `chart_selector.py` 와 `tests/test_chart_selector.py` 가 존재해야 한다.

---

## 배경

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` §4, §8(VZ-02) — 반드시 읽을 것
- 현재 `app.py` 의 `ALLOWED_CHART_TYPES = {"bar", "line", "table", "pie", "stackedBar"}` (auto 없음)
- 현재 `build_chart_spec()` 은 `chartType` 이 ALLOWED_CHART_TYPES 에 없으면 VizError 를 발생시킨다
- `selectionReason` 을 spec 에 추가하는 것은 VZ-03 에서 수행한다. 이 태스크에서는 `reason` 변수만 계산한다.

---

## 수정 파일

| 파일 | 액션 |
|------|------|
| `backend/services/viz-lambda/app.py` | 수정 |
| `backend/services/viz-lambda/tests/test_auto_mode.py` | 신규 생성 |

---

## 수정 내용: `app.py`

아래 3가지를 수정한다.

### 변경 1 — import 추가 (파일 상단)

```python
# 기존
from __future__ import annotations
import ast
import json
import re
from typing import Any

# 변경 후 — chart_selector import 추가
from __future__ import annotations
import ast
import json
import re
from typing import Any

from chart_selector import select_chart_type
```

### 변경 2 — ALLOWED_CHART_TYPES 에 "auto" 추가

```python
# 기존
ALLOWED_CHART_TYPES = {"bar", "line", "table", "pie", "stackedBar"}

# 변경 후
ALLOWED_CHART_TYPES = {"auto", "bar", "line", "table", "pie", "stackedBar"}
```

### 변경 3 — `build_chart_spec()` 수정

`build_chart_spec()` 에서 기존 validation 체크를 아래와 같이 수정하고, auto 처리 블록을 추가한다.

```python
def build_chart_spec(payload: dict[str, Any]) -> dict[str, Any]:
    rows = payload.get("rows")
    chart_type = payload.get("chartType")
    title = payload.get("title")
    x_axis = payload.get("xAxis")
    y_axis = payload.get("yAxis")

    version = payload.get("version", VERSION)
    if version != VERSION:
        raise VizError("UNKNOWN", "Unsupported version.")
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise VizError("UNKNOWN", "rows must be an array of objects.")

    # 변경: None(생략)도 auto로 처리. 명시적 invalid 값만 에러.
    if chart_type is not None and chart_type not in ALLOWED_CHART_TYPES:
        raise VizError(
            "INVALID_CHART_TYPE",
            "chartType must be one of auto, bar, line, table, pie, or stackedBar.",
        )

    # 추가: auto 모드 처리
    if chart_type == "auto" or chart_type is None:
        hints = {
            "questionIntent": payload.get("questionIntent", "generic"),
            "isTimeSeries": payload.get("isTimeSeries", False),
            "compositionMode": payload.get("compositionMode", False),
            "comparisonMode": payload.get("comparisonMode", False),
            "deltaIncluded": payload.get("deltaIncluded", False),
            "categoryCount": payload.get("categoryCount"),
            "metricCount": payload.get("metricCount"),
            "rowCount": payload.get("rowCount"),
        }
        chart_type, reason = select_chart_type(hints, rows)
    else:
        reason = f"explicit: {chart_type}"

    # 이하 기존 코드 그대로 유지
    spec: dict[str, Any] = {
        "type": chart_type,
        "data": list(rows),
    }
    if isinstance(title, str):
        spec["title"] = title

    if chart_type == "table":
        return {"version": VERSION, "spec": spec}

    if chart_type == "pie":
        if not isinstance(x_axis, str) or not x_axis.strip():
            raise VizError("MISSING_AXIS", "xAxis is required for pie charts.")
        if not isinstance(y_axis, list) or not y_axis or not all(
            isinstance(metric, str) and metric.strip() for metric in y_axis
        ):
            raise VizError("MISSING_AXIS", "yAxis must be a non-empty string array for pie charts.")
        spec["nameKey"] = x_axis
        spec["valueKey"] = y_axis[0]
        return {"version": VERSION, "spec": spec}

    if not isinstance(x_axis, str) or not x_axis.strip():
        raise VizError("MISSING_AXIS", "xAxis is required for bar, line, and stackedBar charts.")
    if not isinstance(y_axis, list) or not y_axis or not all(
        isinstance(metric, str) and metric.strip() for metric in y_axis
    ):
        raise VizError("MISSING_AXIS", "yAxis must be a non-empty string array for bar, line, and stackedBar charts.")

    spec["xAxis"] = x_axis
    spec["series"] = [{"metric": metric, "label": _build_label(metric)} for metric in y_axis]
    return {"version": VERSION, "spec": spec}
```

> **주의:** `reason` 변수는 이 태스크에서 아직 spec 에 쓰지 않는다. VZ-03 에서 추가한다.

---

## 신규 파일: `backend/services/viz-lambda/tests/test_auto_mode.py`

```python
"""test_auto_mode.py — integration tests for chartType=auto in app.py."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from app import build_chart_spec

ROWS_CHANNEL = [
    {"channel": "Organic", "sessions": 1000},
    {"channel": "Paid", "sessions": 800},
    {"channel": "Direct", "sessions": 500},
]

ROWS_TIME = [
    {"date": "2025-01-01", "sessions": 100},
    {"date": "2025-01-02", "sessions": 120},
    {"date": "2025-01-03", "sessions": 110},
]

ROWS_PIE = [
    {"channel": "Organic", "share": 50},
    {"channel": "Paid", "share": 30},
    {"channel": "Direct", "share": 20},
]


# ── auto mode: time_series → line ────────────────────────────────────────────

def test_auto_time_series_returns_line():
    result = build_chart_spec({
        "version": "v1",
        "chartType": "auto",
        "isTimeSeries": True,
        "rows": ROWS_TIME,
        "xAxis": "date",
        "yAxis": ["sessions"],
    })
    assert result["spec"]["type"] == "line"


# ── auto mode: composition → pie ─────────────────────────────────────────────

def test_auto_composition_small_returns_pie():
    result = build_chart_spec({
        "version": "v1",
        "chartType": "auto",
        "compositionMode": True,
        "categoryCount": 3,
        "rows": ROWS_PIE,
        "xAxis": "channel",
        "yAxis": ["share"],
    })
    assert result["spec"]["type"] == "pie"


# ── auto mode: ranking → bar ──────────────────────────────────────────────────

def test_auto_ranking_returns_bar():
    result = build_chart_spec({
        "version": "v1",
        "chartType": "auto",
        "questionIntent": "ranking",
        "categoryCount": 3,
        "rows": ROWS_CHANNEL,
        "xAxis": "channel",
        "yAxis": ["sessions"],
    })
    assert result["spec"]["type"] == "bar"


# ── auto mode: chartType omitted (None) → auto ───────────────────────────────

def test_auto_mode_when_chart_type_omitted():
    result = build_chart_spec({
        "version": "v1",
        "isTimeSeries": True,
        "rows": ROWS_TIME,
        "xAxis": "date",
        "yAxis": ["sessions"],
    })
    assert result["spec"]["type"] == "line"


# ── regression: explicit chartType still works ───────────────────────────────

def test_explicit_bar_unchanged():
    result = build_chart_spec({
        "version": "v1",
        "chartType": "bar",
        "rows": ROWS_CHANNEL,
        "xAxis": "channel",
        "yAxis": ["sessions"],
    })
    assert result["spec"]["type"] == "bar"


def test_explicit_table_unchanged():
    result = build_chart_spec({
        "version": "v1",
        "chartType": "table",
        "rows": ROWS_CHANNEL,
    })
    assert result["spec"]["type"] == "table"


def test_explicit_pie_unchanged():
    result = build_chart_spec({
        "version": "v1",
        "chartType": "pie",
        "rows": ROWS_PIE,
        "xAxis": "channel",
        "yAxis": ["share"],
    })
    assert result["spec"]["type"] == "pie"


# ── invalid chartType still raises ───────────────────────────────────────────

def test_invalid_chart_type_raises():
    from app import VizError
    with pytest.raises(VizError) as exc:
        build_chart_spec({
            "version": "v1",
            "chartType": "radar",
            "rows": ROWS_CHANNEL,
        })
    assert exc.value.code == "INVALID_CHART_TYPE"
```

---

## 검증

```bash
cd backend/services/viz-lambda
python -m pytest tests/ -v
# 모든 테스트 통과 (exit code 0)
# test_chart_selector.py + test_auto_mode.py 모두 포함
```

---

## 수락 기준

- [x] `backend/services/viz-lambda/app.py` 수정됨 (`"auto"` in ALLOWED_CHART_TYPES)
- [x] `from chart_selector import select_chart_type` import 추가됨
- [x] `build_chart_spec()` 에 auto 처리 블록 추가됨
- [x] `backend/services/viz-lambda/tests/test_auto_mode.py` 생성됨
- [x] `python -m pytest tests/ -v` exit code 0 (기존 테스트 포함 전체 통과)
````

---

### 5. `docs/tasks/VZ-02/REPORT.md`

```markdown
# VZ-02 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `backend/services/viz-lambda/app.py` modified (`"auto"` added to ALLOWED_CHART_TYPES)
- [ ] `from chart_selector import select_chart_type` import added
- [ ] auto-mode block added to `build_chart_spec()`
- [ ] `backend/services/viz-lambda/tests/test_auto_mode.py` created
- [ ] `python -m pytest tests/ -v` passes (exit code 0)

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/services/viz-lambda/app.py` | Modified | |
| `backend/services/viz-lambda/tests/test_auto_mode.py` | Created | |

---

## Test Output

```bash
$ cd backend/services/viz-lambda
$ python -m pytest tests/ -v
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 6. `docs/tasks/VZ-03/PROMPT.md`

````markdown
# VZ-03: selectionReason → spec 추가 + CONTRACTS.md 업데이트

## 목적

`build_chart_spec()` 이 반환하는 spec 에 `selectionReason` 필드를 추가한다. `docs/CONTRACTS.md` 에 additive 변경 내역을 문서화한다.

---

## 선행 조건

- **VZ-02 완료 필수.** `app.py` 에 `reason` 변수가 항상 설정되어야 한다 (auto: `select_chart_type()` 반환값, explicit: `f"explicit: {chart_type}"`).

---

## 배경

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` §6, §8(VZ-03) — 반드시 읽을 것
- VZ-02 이후 `reason` 변수는 `build_chart_spec()` 내에 항상 존재하지만 아직 spec 에 기록되지 않는다.
- 이 태스크는 `spec["selectionReason"] = reason` 한 줄 추가 + CONTRACTS.md 문서화가 전부다.

---

## 수정 파일

| 파일 | 액션 |
|------|------|
| `backend/services/viz-lambda/app.py` | 수정 |
| `docs/CONTRACTS.md` | 수정 |

---

## 수정 내용: `app.py`

`spec` dict 가 생성된 직후 (`if isinstance(title, str)` 블록 이후), chart_type 분기 이전에 아래 한 줄을 추가한다:

```python
    spec: dict[str, Any] = {
        "type": chart_type,
        "data": list(rows),
    }
    if isinstance(title, str):
        spec["title"] = title

    # 추가: selectionReason (debug field)
    spec["selectionReason"] = reason

    if chart_type == "table":
        return {"version": VERSION, "spec": spec}
    # ... 이하 기존 코드 유지
```

`selectionReason` 은 spec 의 모든 반환 경로(table, pie, bar/line/stackedBar)에 포함된다.

---

## 수정 내용: `docs/CONTRACTS.md`

`docs/CONTRACTS.md` 파일을 읽고, 기존 Chart Spec Contract 섹션 아래에 아래 섹션을 **추가**한다 (기존 내용 삭제 금지):

```markdown
### Additive fields (2026-03-10 이후)

#### Request (optional, all fields)

| 필드 | 타입 | 설명 |
|------|------|------|
| `chartType` | `"auto"` | 자동 선택 모드. 생략 시에도 auto로 동작. |
| `questionIntent` | string | 질문 의도 힌트: `ranking \| comparison \| composition \| time_series \| raw_detail \| single_kpi \| funnel \| retention \| generic` |
| `isTimeSeries` | boolean | 시계열 질문 여부 |
| `compositionMode` | boolean | 구성비 질문 여부 |
| `comparisonMode` | boolean | 비교 질문 여부 |
| `deltaIncluded` | boolean | 전주 대비 delta 포함 여부 |
| `categoryCount` | integer | 카테고리 수 힌트 (없으면 rows 수로 추정) |
| `metricCount` | integer | metric 수 힌트 (없으면 숫자형 컬럼 수로 추정) |
| `rowCount` | integer | row 수 힌트 (없으면 rows 길이로 추정) |

#### Response spec (additive)

| 필드 | 위치 | 설명 |
|------|------|------|
| `selectionReason` | `spec.selectionReason` | 차트 선택 이유 (디버그용). auto: `"auto: ranking, categoryCount=5≤15 → bar"`, explicit: `"explicit: bar"` |

**예시 (auto 선택 결과):**
```json
{
  "version": "v1",
  "spec": {
    "type": "bar",
    "title": "채널별 세션 수",
    "xAxis": "channel_group",
    "series": [{ "metric": "sessions", "label": "Sessions" }],
    "data": [],
    "selectionReason": "auto: ranking intent, categoryCount=5≤15 → bar"
  }
}
```
```

---

## 검증

```bash
cd backend/services/viz-lambda
python -m pytest tests/ -v
# exit code 0
```

추가로 아래를 직접 확인한다:

```python
# 빠른 smoke test
import sys; sys.path.insert(0, ".")
from app import build_chart_spec

result = build_chart_spec({
    "version": "v1",
    "chartType": "auto",
    "isTimeSeries": True,
    "rows": [{"date": "2025-01-01", "sessions": 100}] * 5,
    "xAxis": "date",
    "yAxis": ["sessions"],
})
assert "selectionReason" in result["spec"]
print(result["spec"]["selectionReason"])  # "auto: time_series, metricCount=1 → line"

result2 = build_chart_spec({
    "version": "v1",
    "chartType": "bar",
    "rows": [{"channel": "A", "sessions": 100}],
    "xAxis": "channel",
    "yAxis": ["sessions"],
})
assert result2["spec"]["selectionReason"] == "explicit: bar"
print("OK")
```

---

## 수락 기준

- [x] `spec["selectionReason"] = reason` 추가됨 (모든 반환 경로 포함)
- [x] auto 선택 시 `spec.selectionReason` 존재 및 `"auto:"` prefix
- [x] explicit chartType 시 `spec.selectionReason == "explicit: bar"` 형식
- [x] `docs/CONTRACTS.md` additive fields 섹션 추가됨
- [x] `python -m pytest tests/ -v` exit code 0
````

---

### 7. `docs/tasks/VZ-03/REPORT.md`

```markdown
# VZ-03 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `spec["selectionReason"] = reason` added to all return paths in `build_chart_spec()`
- [ ] auto mode: `spec.selectionReason` starts with `"auto:"`
- [ ] explicit mode: `spec.selectionReason == "explicit: <type>"`
- [ ] `docs/CONTRACTS.md` updated with additive fields section
- [ ] `python -m pytest tests/ -v` passes (exit code 0)

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `backend/services/viz-lambda/app.py` | Modified | |
| `docs/CONTRACTS.md` | Modified | |

---

## Test Output

```bash
$ cd backend/services/viz-lambda
$ python -m pytest tests/ -v
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 8. `docs/tasks/VZ-04/PROMPT.md`

````markdown
# VZ-04: Bedrock Agent 프롬프트 — auto 모드 + hint 전달 지침

## 목적

`docs/bedrock-agent-setup.md` 에 Bedrock Agent 가 viz action group 호출 시 `chartType: "auto"` 와 semantic hint 를 전달하도록 하는 instruction 지침을 추가한다.

---

## 선행 조건

- **VZ-03 완료 필수.** viz-lambda 가 `chartType: "auto"` 와 hint 필드를 처리할 수 있어야 한다.

---

## 배경

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` §8(VZ-04) — 반드시 읽을 것
- 현재 Bedrock Agent 는 viz action group 호출 시 `chartType` 을 명시적으로 지정하고 있다.
- 이 태스크는 문서 수정만이다. AWS 콘솔의 실제 Agent instruction 업데이트는 별도 작업이다.

---

## 수정 파일

| 파일 | 액션 |
|------|------|
| `docs/bedrock-agent-setup.md` | 수정 |

---

## 수정 내용: `docs/bedrock-agent-setup.md`

`docs/bedrock-agent-setup.md` 파일을 읽고, 기존 내용을 파악한 후 아래 섹션을 **추가**한다 (기존 내용 삭제 금지).

파일 끝에 아래 섹션을 추가하라:

```markdown
## Auto Chart Selection — viz Action Group Instruction

### Bedrock Agent Instruction (추가할 내용)

아래 instruction 을 Bedrock Agent 의 System Prompt / Instruction 에 추가한다.

```
When calling the viz action group to generate a chart:

1. Set chartType to "auto" unless the user explicitly requests a specific chart type
   (e.g., "바 차트로 보여줘", "파이 차트로").

2. Always provide semantic hints to help the auto-selection engine:

   - isTimeSeries: true  → if the question asks about trends over time
     (e.g., "최근 7일 추이", "일별 변화", "시계열")

   - compositionMode: true  → if the question asks about proportions or breakdown
     (e.g., "비중", "구성비", "채널별 비율")

   - comparisonMode: true  → if comparing across groups or vs. previous period
     (e.g., "채널별 비교", "전주 대비", "vs")

   - deltaIncluded: true  → if the data includes delta / change values
     (e.g., "증감", "전주 대비 변화", "delta")

   - questionIntent: one of the following
     - "ranking"      → "상위", "순위", "top N"
     - "comparison"   → "비교", "대비"
     - "composition"  → "비중", "구성비", "breakdown"
     - "time_series"  → "추이", "트렌드", "일별/주별"
     - "raw_detail"   → "원본 데이터", "테이블로 보여줘", "raw"
     - "single_kpi"   → "가장 높은", "전체 합계", 단일 숫자 응답
     - "funnel"       → "퍼널", "유입→설치→구매"
     - "retention"    → "리텐션", "Day7 retention"
     - "generic"      → 위 외의 일반 질문 (기본값)

3. Example viz action group call payload:

   Explicit chart type (user requested):
   {
     "version": "v1",
     "chartType": "bar",
     "rows": [...],
     "xAxis": "channel",
     "yAxis": ["sessions"]
   }

   Auto mode (recommended for most questions):
   {
     "version": "v1",
     "chartType": "auto",
     "questionIntent": "ranking",
     "isTimeSeries": false,
     "compositionMode": false,
     "comparisonMode": false,
     "deltaIncluded": false,
     "rows": [...],
     "xAxis": "channel",
     "yAxis": ["sessions"]
   }
```

### AWS 콘솔 적용 절차

1. AWS Console → Bedrock → Agents → [해당 에이전트] → Edit
2. "Instructions for the Agent" 섹션에 위 내용 추가
3. Agent 재배포 (Prepare → Deploy)
4. 통합 테스트:
   - "최근 7일 세션 추이는?" → viz spec.type == "line" 확인
   - "채널별 세션 비중은?" → viz spec.type == "pie" 확인
   - "채널별 설치 순위 보여줘" → viz spec.type == "bar" 확인
```

---

## 검증

문서 검토:
- `docs/bedrock-agent-setup.md` 에 Auto Chart Selection 섹션 존재 확인
- instruction 예시 payload 에 `"chartType": "auto"` + hint 필드 포함 확인

코드 검증 없음 (문서 전용 태스크).

---

## 수락 기준

- [x] `docs/bedrock-agent-setup.md` 에 "Auto Chart Selection" 섹션 추가됨
- [x] Bedrock Agent instruction 예시 (auto 모드 payload) 포함됨
- [x] questionIntent 값 목록 및 한국어 키워드 매핑 포함됨
- [x] AWS 콘솔 적용 절차 포함됨
````

---

### 9. `docs/tasks/VZ-04/REPORT.md`

```markdown
# VZ-04 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `docs/bedrock-agent-setup.md` updated with Auto Chart Selection section
- [ ] Bedrock Agent instruction example payload included
- [ ] `questionIntent` value list with Korean keyword mapping included
- [ ] AWS Console update procedure documented

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `docs/bedrock-agent-setup.md` | Modified | |

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```
