# VZ-02: app.py support for `chartType: "auto"`

## Objective

Update `backend/services/viz-lambda/app.py` so that explicit
`chartType: "auto"` triggers `select_chart_type()` from `chart_selector.py`.
Create `backend/services/viz-lambda/tests/test_auto_mode.py` to cover the new
path.

---

## Prerequisite

- VZ-01 completed.

---

## Background

- Plan reference: `docs/plans/2026-03-10-auto-chart-selection.md`
- Current `ALLOWED_CHART_TYPES` does not include `"auto"`.
- `chartType` remains a required field. This task does not make it optional.
- Adding `selectionReason` to the response spec is handled in VZ-03.

---

## Files To Change

| File | Action |
|------|--------|
| `backend/services/viz-lambda/app.py` | Modify |
| `backend/services/viz-lambda/tests/test_auto_mode.py` | Create |

---

## Required Changes In `app.py`

### 1. Add import

```python
from chart_selector import select_chart_type
```

### 2. Allow `"auto"`

```python
ALLOWED_CHART_TYPES = {"auto", "bar", "line", "table", "pie", "stackedBar"}
```

### 3. Update `build_chart_spec()`

When `chartType == "auto"`, build a `hints` dict from the payload and call
`select_chart_type(hints, rows)`.

The hints payload should include:

- `questionIntent`
- `isTimeSeries`
- `compositionMode`
- `comparisonMode`
- `deltaIncluded`
- `categoryCount`
- `metricCount`
- `rowCount`
- `xAxis`

For explicit chart types, keep current behavior and set:

```python
reason = f"explicit: {chart_type}"
```

Do not expose `reason` in the response yet. That is VZ-03.

---

## New Test File

Create `backend/services/viz-lambda/tests/test_auto_mode.py` with integration
tests that cover:

- auto + time series -> `line`
- auto + composition with small category count -> `pie`
- auto + ranking -> `bar`
- auto uses `xAxis` distinct count for category calculation
- omitted `chartType` still raises `INVALID_CHART_TYPE`
- explicit `bar`, `table`, and `pie` behavior remains unchanged
- invalid chart type still raises `INVALID_CHART_TYPE`

---

## Verification

```bash
cd backend/services/viz-lambda
python -m pytest tests/ -v
```

Expected result: exit code `0`.

---

## Acceptance Checklist

- [ ] `"auto"` added to `ALLOWED_CHART_TYPES`
- [ ] `from chart_selector import select_chart_type` import added
- [ ] `chartType == "auto"` path calls selector using payload hints
- [ ] `chartType` omitted still raises `INVALID_CHART_TYPE`
- [ ] `backend/services/viz-lambda/tests/test_auto_mode.py` created
- [ ] `python -m pytest tests/ -v` passes
