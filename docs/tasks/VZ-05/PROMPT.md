# VZ-05: AssistantMessage — 차트/테이블 토글 switch

## 목적

`AssistantMessage.tsx` 의 chart frame 카드에 토글 버튼을 추가한다. 같은 `spec.data` 로 차트 ↔ 데이터 테이블 전환이 가능하도록 한다.

---

## 배경

- **계획 문서:** `docs/plans/2026-03-10-auto-chart-selection.md` §8(VZ-05) — 반드시 읽을 것
- **기존 파일:** `frontend/src/components/chat/AssistantMessage.tsx` — 먼저 읽을 것
- chart frame 렌더링 시 `spec.data` 가 항상 존재한다
- 토글 버튼은 **차트 frame 이 있을 때만** 표시한다 (table frame 에는 불필요)
- 백엔드 변경 없음, 프론트 state 추가만

---

## 수정 파일

| 파일 | 액션 |
|------|------|
| `frontend/src/components/chat/AssistantMessage.tsx` | 수정 |

---

## 수정 내용: `AssistantMessage.tsx`

`AssistantMessage.tsx` 를 읽고, 아래 변경사항을 반영한다.

### 변경 1 — useState import 추가

```typescript
import { useState } from "react";
```

### 변경 2 — showTable state 추가 (컴포넌트 함수 내부 상단)

```typescript
const [showTable, setShowTable] = useState(false);
```

### 변경 3 — chart frame 렌더 영역을 아래로 교체

기존:
```tsx
{chartFrame && pieSpec && <ReportPieChart spec={pieSpec} />}
{chartFrame && !pieSpec && barLikeSpec && <ReportBarChart spec={barLikeSpec} />}
```

변경 후:
```tsx
{chartFrame && (pieSpec || barLikeSpec) && (
  <div>
    <div className="mb-2 flex justify-end gap-1">
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
    {showTable ? (
      <DataTable
        rows={
          (rawChartSpec?.data as Record<string, unknown>[] | undefined) ?? []
        }
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

## 검증

```bash
cd frontend
npx tsc --noEmit
# exit code 0
```

---

## 수락 기준

- [ ] `frontend/src/components/chat/AssistantMessage.tsx` 수정됨
- [ ] chart frame 존재 시 `[📊 차트] [📋 데이터]` 토글 버튼 렌더됨
- [ ] `showTable === false`: 기존 차트 렌더 (ReportPieChart / ReportBarChart)
- [ ] `showTable === true`: `spec.data` 를 rows 로 DataTable 렌더
- [ ] `cd frontend && npx tsc --noEmit` exit code 0
