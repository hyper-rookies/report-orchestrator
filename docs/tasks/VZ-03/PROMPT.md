# VZ-03: add `selectionReason` to chart specs and update `CONTRACTS.md`

## Objective

Update `build_chart_spec()` so every returned chart spec includes
`selectionReason`. Also document the additive contract change in
`docs/CONTRACTS.md`.

---

## Prerequisite

- VZ-02 completed.
- `app.py` already computes `reason` for both auto mode and explicit mode.

---

## Background

- Plan reference: `docs/plans/2026-03-10-auto-chart-selection.md`
- After VZ-02, the selection reason exists internally but is not yet returned in
  `spec`.
- This task makes the reason observable and documents the new response shape.

---

## Files To Change

| File | Action |
|------|--------|
| `backend/services/viz-lambda/app.py` | Modify |
| `docs/CONTRACTS.md` | Modify |

---

## Required Changes In `app.py`

After building the base `spec` dict, and after optionally adding `title`, add:

```python
spec["selectionReason"] = reason
```

This field must be present in all return paths:

- `table`
- `pie`
- `bar`
- `line`
- `stackedBar`

Example placement:

```python
spec: dict[str, Any] = {
    "type": chart_type,
    "data": list(rows),
}
if isinstance(title, str):
    spec["title"] = title

spec["selectionReason"] = reason
```

---

## Required `docs/CONTRACTS.md` Update

Add a short additive-contract section that documents:

### Optional request hint fields

| Field | Type | Description |
|------|------|-------------|
| `chartType` | `"auto"` | Auto-selection mode when the caller does not force a chart type |
| `questionIntent` | string | Intent hint such as `ranking`, `comparison`, `composition`, `time_series`, `raw_detail`, `single_kpi`, `funnel`, `retention`, or `generic` |
| `isTimeSeries` | boolean | Whether the request is a time-series question |
| `compositionMode` | boolean | Whether the request asks for a composition or breakdown |
| `comparisonMode` | boolean | Whether the request compares groups or periods |
| `deltaIncluded` | boolean | Whether delta or change values are included |
| `categoryCount` | integer | Optional category count hint |
| `metricCount` | integer | Optional metric count hint |
| `rowCount` | integer | Optional row count hint |

### Additive response field

| Field | Path | Description |
|------|------|-------------|
| `selectionReason` | `spec.selectionReason` | Reason for the selected chart type, for example `"auto: ranking, categoryCount=5<=15 -> bar"` or `"explicit: bar"` |

Include one JSON example showing `selectionReason` in the response.

---

## Verification

```bash
cd backend/services/viz-lambda
python -m pytest tests/ -v
```

Also run a short smoke check to confirm:

- auto mode returns a spec with `selectionReason` beginning with `"auto:"`
- explicit mode returns `selectionReason == "explicit: <type>"`

---

## Acceptance Checklist

- [ ] `spec["selectionReason"] = reason` added to all response paths
- [ ] auto mode returns `spec.selectionReason` with `"auto:"` prefix
- [ ] explicit mode returns `spec.selectionReason == "explicit: <type>"`
- [ ] `docs/CONTRACTS.md` updated with additive request and response fields
- [ ] `python -m pytest tests/ -v` passes
