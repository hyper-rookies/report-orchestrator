# SS-03 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/app/api/sessions/[id]/route.ts` 생성됨 (GET + PATCH + DELETE)
- [ ] GET: 없는 세션 시 404
- [ ] PATCH: title 누락/빈 문자열 시 400, 세션+index 모두 업데이트
- [ ] DELETE: 세션 파일 삭제 + index에서 제거
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/app/api/sessions/[id]/route.ts` | Created | ? |

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
