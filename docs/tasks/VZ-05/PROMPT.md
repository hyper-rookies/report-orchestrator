# VZ-05: chart/data toggle in `AssistantMessage`

## Objective

Add a small toggle UI to the chart frame in
`frontend/src/components/chat/AssistantMessage.tsx` so the user can switch
between chart view and table view using the same `spec.data`.

---

## Background

- Plan reference: `docs/plans/2026-03-10-auto-chart-selection.md`
- Existing chart rendering already uses `spec.data`.
- This task is frontend-only. No backend changes are needed.
- The toggle should appear only when a chart frame exists.

---

## Files To Change

| File | Action |
|------|--------|
| `frontend/src/components/chat/AssistantMessage.tsx` | Modify |

---

## Required Changes

### 1. Add local state

```typescript
import { useState } from "react";

const [showTable, setShowTable] = useState(false);
```

### 2. Add toggle buttons to the chart frame

Render two compact buttons in the chart card:

- `Chart`
- `Data`

The buttons should:

- be shown only when a chart frame exists
- set `showTable` to `false` or `true`
- use `aria-pressed`
- match the existing lightweight dashboard/chat button style

### 3. Switch rendering based on `showTable`

Current chart frame behavior:

```tsx
{chartFrame && pieSpec && <ReportPieChart spec={pieSpec} />}
{chartFrame && !pieSpec && barLikeSpec && <ReportBarChart spec={barLikeSpec} />}
```

Update it so:

- `showTable === false` renders the existing chart
- `showTable === true` renders `DataTable` using `rawChartSpec?.data ?? []`

Example structure:

```tsx
{chartFrame && (pieSpec || barLikeSpec) && (
  <div>
    <div className="mb-2 flex justify-end gap-1">
      <button onClick={() => setShowTable(false)} aria-pressed={!showTable}>
        Chart
      </button>
      <button onClick={() => setShowTable(true)} aria-pressed={showTable}>
        Data
      </button>
    </div>
    {showTable ? (
      <DataTable
        rows={(rawChartSpec?.data as Record<string, unknown>[] | undefined) ?? []}
      />
    ) : (
      <>
        {pieSpec && <ReportPieChart spec={pieSpec} />}
        {!pieSpec && barLikeSpec && <ReportBarChart spec={barLikeSpec} />}
      </>
    )}
  </div>
)}
```

---

## Verification

```bash
cd frontend
npx tsc --noEmit
```

Expected result: exit code `0`.

---

## Acceptance Checklist

- [ ] `frontend/src/components/chat/AssistantMessage.tsx` modified
- [ ] `Chart` and `Data` toggle buttons render when chart frame exists
- [ ] `showTable === false` renders the current chart path
- [ ] `showTable === true` renders `DataTable` with `spec.data`
- [ ] `cd frontend && npx tsc --noEmit` passes
