# DA-02 Task Report

**Status:** DONE

**Completed At:** 2026-03-09T11:26:01.0020914+09:00

---

## Acceptance Criteria

- [x] `ConversionChart.tsx` 생성됨
- [x] `ConversionChart.tsx`의 `data` prop 타입: `Array<{ channel: string; conversionRate: number }>`
- [x] `CampaignInstallsChart.tsx` 생성됨
- [x] `CampaignInstallsChart.tsx`의 `data` prop 타입: `Array<{ campaign: string; installs: number }>`
- [x] 두 컴포넌트 모두 `loading` prop 있고 스켈레톤 UI 렌더링됨
- [x] `CampaignInstallsChart`가 `data.slice(0, 10)` 적용 (TOP 10)
- [x] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/dashboard/ConversionChart.tsx` | Created | 61 |
| `frontend/src/components/dashboard/CampaignInstallsChart.tsx` | Created | 68 |

---

## TypeScript Check

```
$ cd frontend && npx.cmd tsc --noEmit
(no output; exit code 0)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
