# VZ-02: app.py — `chartType: "auto"` 지원 + test_auto_mode.py

## 목적

`backend/services/viz-lambda/app.py` 를 수정해 `chartType: "auto"` 입력 시 `chart_selector.py` 의 `select_chart_type()` 을 호출하도록 한다. `tests/test_auto_mode.py` 를 신규 생성한다.

---

## 선행 조건

- **VZ-01 완료 필수.** `chart_selector.py` 와 `tests/test_chart_selector.py` 가 존재해야 한다.

---

## 배경

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` §4, §8(VZ-02) — 반드시 읽을 것
- 현재 `ALLOWED_CHART_TYPES = {"bar", "line", "table", "pie", "stackedBar"}` (auto 없음)
- `chartType` 은 **required**. `"auto"` 를 명시 전달해야 자동 선택됨. 생략(None)은 허용하지 않음.
- `selectionReason` 을 spec 에 추가하는 것은 VZ-03 에서 수행. 이 태스크에서는 `reason` 변수만 계산.

---

## 수정 파일

| 파일 | 액션 |
|------|------|
| `backend/services/viz-lambda/app.py` | 수정 |
| `backend/services/viz-lambda/tests/test_auto_mode.py` | 신규 생성 |

---

## 수정 내용: `app.py`

### 변경 1 — import 추가 (파일 상단, `from typing import Any` 다음 줄)

```python
from chart_selector import select_chart_type
```

### 변경 2 — ALLOWED_CHART_TYPES 에 "auto" 추가

```python
ALLOWED_CHART_TYPES = {"auto", "bar", "line", "table", "pie", "stackedBar"}
```

### 변경 3 — `build_chart_spec()` 전체 교체

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
    if chart_type not in ALLOWED_CHART_TYPES:
        raise VizError(
            "INVALID_CHART_TYPE",
            "chartType must be one of auto, bar, line, table, pie, or stackedBar.",
        )

    # Auto mode: chartType="auto" 명시 시에만 자동 선택 (생략 불허)
    if chart_type == "auto":
        hints = {
            "questionIntent": payload.get("questionIntent", "generic"),
            "isTimeSeries": payload.get("isTimeSeries", False),
            "compositionMode": payload.get("compositionMode", False),
            "comparisonMode": payload.get("comparisonMode", False),
            "deltaIncluded": payload.get("deltaIncluded", False),
            "categoryCount": payload.get("categoryCount"),
            "metricCount": payload.get("metricCount"),
            "rowCount": payload.get("rowCount"),
            "xAxis": x_axis,  # distinct count 계산에 사용
        }
        chart_type, reason = select_chart_type(hints, rows)
    else:
        reason = f"explicit: {chart_type}"

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
from app import build_chart_spec, VizError

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
        "xAxis": "channel",
        "rows": ROWS_PIE,
        "yAxis": ["share"],
    })
    assert result["spec"]["type"] == "pie"


# ── auto mode: ranking → bar ──────────────────────────────────────────────────

def test_auto_ranking_returns_bar():
    result = build_chart_spec({
        "version": "v1",
        "chartType": "auto",
        "questionIntent": "ranking",
        "xAxis": "channel",
        "rows": ROWS_CHANNEL,
        "yAxis": ["sessions"],
    })
    assert result["spec"]["type"] == "bar"


# ── auto mode: xAxis distinct count 사용 확인 ────────────────────────────────

def test_auto_xaxis_distinct_count_for_composition():
    """중복 row가 있을 때 xAxis distinct count로 올바른 chart 선택."""
    rows = [
        {"channel": "Organic", "share": 50},
        {"channel": "Paid", "share": 30},
        {"channel": "Organic", "share": 20},  # 중복 — distinct=2
    ]
    result = build_chart_spec({
        "version": "v1",
        "chartType": "auto",
        "compositionMode": True,
        "xAxis": "channel",
        "rows": rows,
        "yAxis": ["share"],
    })
    assert result["spec"]["type"] == "pie"


# ── chartType 생략 시 INVALID_CHART_TYPE 에러 ────────────────────────────────

def test_chart_type_omitted_raises_invalid():
    """chartType 생략은 허용하지 않는다."""
    with pytest.raises(VizError) as exc:
        build_chart_spec({
            "version": "v1",
            "rows": ROWS_CHANNEL,
        })
    assert exc.value.code == "INVALID_CHART_TYPE"


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


# ── invalid chartType raises ──────────────────────────────────────────────────

def test_invalid_chart_type_raises():
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
```

---

## 수락 기준

- [ ] `"auto"` 가 `ALLOWED_CHART_TYPES` 에 추가됨
- [ ] `from chart_selector import select_chart_type` import 추가됨
- [ ] `chart_type == "auto"` 일 때만 자동 선택 (`chart_type is None` 허용 안 함)
- [ ] hints dict 에 `"xAxis": x_axis` 포함됨
- [ ] `chartType` 생략 시 `INVALID_CHART_TYPE` VizError 발생 테스트 통과
- [ ] `tests/test_auto_mode.py` 생성됨
- [ ] `python -m pytest tests/ -v` exit code 0
