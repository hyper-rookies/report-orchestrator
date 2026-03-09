# SS-02 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `frontend/src/lib/sessionAuth.ts` 생성됨 (`getUserSub` export)
- [ ] `frontend/src/app/api/sessions/route.ts` 생성됨 (GET + POST)
- [ ] GET: Authorization 없으면 401 반환
- [ ] POST: sessionId/title/messages 누락 시 400 반환
- [ ] POST: index.json upsert + 세션 파일 저장 로직 포함
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/lib/sessionAuth.ts` | Created | ? |
| `frontend/src/app/api/sessions/route.ts` | Created | ? |

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
