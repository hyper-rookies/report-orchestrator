# VZ-06: 테이블/차트 카드 — CSV 다운로드 버튼

## 목적

`AssistantMessage.tsx` 의 table frame 과 chart frame 카드 모두에 CSV 다운로드 버튼을 추가한다. `spec.data` / `tableRows` 를 `.csv` 파일로 변환해 브라우저 다운로드 트리거.

---

## 선행 조건

- **VZ-05 완료 권장** (chart 카드 구조가 변경되어 있어야 함). 단, 독립 태스크로 진행 가능.

---

## 배경

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` §8(VZ-06) — 반드시 읽을 것
- **기존 파일:** `frontend/src/components/chat/AssistantMessage.tsx` — 먼저 읽을 것
- CSV 변환은 백엔드 불필요. `spec.data` / `tableRows` 배열이 프론트에 이미 있음.
- 다운로드 파일명: `data.csv` (고정)

---

## 생성/수정 파일

| 파일 | 액션 |
|------|------|
| `frontend/src/lib/exportCsv.ts` | 신규 생성 |
| `frontend/src/components/chat/AssistantMessage.tsx` | 수정 |

---

## 신규 파일: `frontend/src/lib/exportCsv.ts`

```typescript
/**
 * exportCsv.ts — CSV export utility for table/chart data
 */
export function downloadCsv(
  rows: Record<string, unknown>[],
  filename = "data.csv"
): void {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string =>
    JSON.stringify(v == null ? "" : v);

  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
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

## 수정 내용: `AssistantMessage.tsx`

`AssistantMessage.tsx` 를 읽고, 아래 변경사항을 반영한다.

### 변경 1 — import 추가

```typescript
import { downloadCsv } from "@/lib/exportCsv";
```

### 변경 2 — table frame 에 다운로드 버튼 추가

기존:
```tsx
{tableFrame && <DataTable rows={tableRows} />}
```

변경 후:
```tsx
{tableFrame && (
  <div>
    <div className="mb-2 flex justify-end">
      <button
        onClick={() => downloadCsv(tableRows, "data.csv")}
        className="rounded px-2 py-1 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
        disabled={tableRows.length === 0}
      >
        ⬇ CSV
      </button>
    </div>
    <DataTable rows={tableRows} />
  </div>
)}
```

### 변경 3 — chart frame 토글 영역에 다운로드 버튼 추가

VZ-05 에서 추가된 토글 버튼 행에 CSV 버튼을 함께 추가한다.

```tsx
{/* 기존 토글 버튼 행을 아래로 교체 */}
<div className="mb-2 flex items-center justify-between gap-1">
  <div className="flex gap-1">
    <button
      onClick={() => setShowTable(false)}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        !showTable
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
      aria-pressed={!showTable}
    >
      📊 차트
    </button>
    <button
      onClick={() => setShowTable(true)}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        showTable
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
      aria-pressed={showTable}
    >
      📋 데이터
    </button>
  </div>
  <button
    onClick={() =>
      downloadCsv(
        (rawChartSpec?.data as Record<string, unknown>[] | undefined) ?? [],
        "data.csv"
      )
    }
    className="rounded px-2 py-1 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
  >
    ⬇ CSV
  </button>
</div>
```

> **VZ-05 미완료 시:** 토글 버튼 없이 chart frame 에 다운로드 버튼만 단독으로 추가해도 무방하다.

---

## 검증

```bash
cd frontend
npx tsc --noEmit
# exit code 0
```

---

## 수락 기준

- [ ] `frontend/src/lib/exportCsv.ts` 생성됨
- [ ] table frame 카드에 `⬇ CSV` 버튼 렌더됨
- [ ] chart frame 카드에 `⬇ CSV` 버튼 렌더됨
- [ ] 버튼 클릭 시 `data.csv` 다운로드 트리거
- [ ] rows 가 빈 배열이면 다운로드 없음 (early return)
- [ ] `cd frontend && npx tsc --noEmit` exit code 0
