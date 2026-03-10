# SH-06: dashboard/page.tsx에 ShareButton + PdfExportButton 연결

**전제 조건:** SH-04와 SH-05가 모두 `"done"` 상태여야 한다. SC-04도 `"done"`이어야 한다.

## 작업 개요

`frontend/src/app/(app)/dashboard/page.tsx`를 수정해 ShareButton과 PdfExportButton을 헤더에 추가한다.

## 수정할 파일

- `frontend/src/app/(app)/dashboard/page.tsx`

---

## 수정 내용

### 1. import 추가

파일 상단 import 목록에 추가:

```typescript
import ShareButton from "@/components/dashboard/ShareButton";
import PdfExportButton from "@/components/dashboard/PdfExportButton";
```

### 2. 대시보드 루트 `div`에 id 추가 (PDF 캡처 대상)

```tsx
// 기존
<div className="mx-auto w-full max-w-6xl space-y-6">

// 변경
<div id="dashboard-content" className="mx-auto w-full max-w-6xl space-y-6">
```

### 3. 헤더 영역: WeekSelector를 감싸는 flex 컨테이너 + 버튼 추가

```tsx
// 기존 (WeekSelector 단독)
<WeekSelector
  weeks={weeks}
  selectedIndex={selectedWeekIndex}
  onChange={(index) => {
    setSelectedWeekIndex(Math.min(Math.max(index, 0), weeks.length - 1));
  }}
/>

// 변경 (flex 컨테이너로 감싸고 버튼 추가)
<div className="flex items-center gap-2">
  {weeks.length > 0 && (
    <WeekSelector
      weeks={weeks}
      selectedIndex={selectedWeekIndex}
      onChange={(index) => {
        setSelectedWeekIndex(Math.min(Math.max(index, 0), weeks.length - 1));
      }}
    />
  )}
  {selectedRange.start && (
    <>
      <ShareButton selectedRange={selectedRange} />
      <PdfExportButton
        targetId="dashboard-content"
        filename={`dashboard-${selectedRange.start}_${selectedRange.end}.pdf`}
      />
    </>
  )}
</div>
```

**주의:** 기존에 `weeks.length > 0` 조건이 WeekSelector 바깥에 있다면 안으로 이동하거나 조건부 렌더링 구조에 맞게 조정한다.

---

## 검증 명령

```bash
cd frontend && npx tsc --noEmit
```

Expected: 오류 없음 (exit code 0)

## 수락 기준

- [ ] `ShareButton` import 추가됨
- [ ] `PdfExportButton` import 추가됨
- [ ] `id="dashboard-content"` 가 max-w-6xl div에 추가됨
- [ ] `selectedRange.start &&` 조건으로 두 버튼 조건부 렌더링
- [ ] `PdfExportButton`의 `filename` prop에 주차 날짜 포함됨
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

## 완료 후 할 일

1. `docs/tasks/SH-06/REPORT.md` 채우기
2. `docs/tasks/status.json`에서 SH-06 status → `"done"` 또는 `"blocked"`
3. `git add "frontend/src/app/(app)/dashboard/page.tsx" docs/tasks/SH-06/REPORT.md docs/tasks/status.json`
4. `git commit -m "feat(dashboard): wire ShareButton and PdfExportButton into header (SH-06)"`
```
