# VZ-06: CSV download button for table and chart cards

## Objective

Add CSV download support to both table frames and chart frames in
`frontend/src/components/chat/AssistantMessage.tsx`.
Use `spec.data` and `tableRows` to generate a client-side `.csv` download.

---

## Prerequisite

- VZ-05 recommended, because the chart card layout changes there.

---

## Background

- Plan reference: `docs/plans/2026-03-10-auto-chart-selection.md`
- This is frontend-only work.
- CSV generation should happen in the browser with no backend dependency.
- Download filename can remain fixed as `data.csv`.

---

## Files To Create Or Change

| File | Action |
|------|--------|
| `frontend/src/lib/exportCsv.ts` | Create |
| `frontend/src/components/chat/AssistantMessage.tsx` | Modify |

---

## New Utility: `frontend/src/lib/exportCsv.ts`

Create a small helper:

```typescript
export function downloadCsv(
  rows: Record<string, unknown>[],
  filename = "data.csv"
): void {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string =>
    JSON.stringify(value == null ? "" : value);

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

---

## Required Changes In `AssistantMessage.tsx`

### 1. Add import

```typescript
import { downloadCsv } from "@/lib/exportCsv";
```

### 2. Add CSV button to table frame

Wrap the table frame with a small action row and a `CSV` button.
The button should:

- call `downloadCsv(tableRows, "data.csv")`
- be disabled or effectively inert when `tableRows` is empty

### 3. Add CSV button to chart frame

Add a matching `CSV` button to the chart card actions.
It should download:

```typescript
(rawChartSpec?.data as Record<string, unknown>[] | undefined) ?? []
```

If VZ-05 is implemented, place the `CSV` button next to the `Chart` / `Data`
toggle actions.

---

## Verification

```bash
cd frontend
npx tsc --noEmit
```

Expected result: exit code `0`.

---

## Acceptance Checklist

- [ ] `frontend/src/lib/exportCsv.ts` created
- [ ] `CSV` button rendered on the table frame card
- [ ] `CSV` button rendered on the chart frame card
- [ ] Clicking the button triggers `data.csv` download
- [ ] Empty rows do not trigger a download
- [ ] `cd frontend && npx tsc --noEmit` passes
