# SH-02 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/app/api/share/route.ts` 생성됨 (POST 핸들러)
- [ ] `frontend/src/app/api/share/[code]/route.ts` 생성됨 (GET 핸들러)
- [ ] POST: `weekStart`, `weekEnd`, `weekLabel` 누락 시 400 반환
- [ ] GET: 코드 없거나 만료 시 404, JWT 만료 시 410 반환
- [ ] GET: 정상 시 `{ weekStart, weekEnd, weekLabel }` 반환
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/app/api/share/route.ts` | Created | ? |
| `frontend/src/app/api/share/[code]/route.ts` | Created | ? |

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
