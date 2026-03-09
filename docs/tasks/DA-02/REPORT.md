# DA-02 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `ConversionChart.tsx` 생성됨
- [ ] `ConversionChart.tsx`의 `data` prop 타입: `Array<{ channel: string; conversionRate: number }>`
- [ ] `CampaignInstallsChart.tsx` 생성됨
- [ ] `CampaignInstallsChart.tsx`의 `data` prop 타입: `Array<{ campaign: string; installs: number }>`
- [ ] 두 컴포넌트 모두 `loading` prop 있고 스켈레톤 UI 렌더링됨
- [ ] `CampaignInstallsChart`가 `data.slice(0, 10)` 적용 (TOP 10)
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/dashboard/ConversionChart.tsx` | Created | ? |
| `frontend/src/components/dashboard/CampaignInstallsChart.tsx` | Created | ? |

---

## TypeScript Check

```
$ cd frontend && npx tsc --noEmit
(출력 붙여넣기)
```

---

## Deviations from Plan

없음 / (계획과 다른 점 기술)

---

## Questions for Reviewer

없음 / (리뷰어에게 물어볼 것)
