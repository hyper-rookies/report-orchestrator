# SS-06 Task Report

**Status:** IN_PROGRESS | DONE | BLOCKED

**Completed At:** (ISO timestamp)

---

## Acceptance Criteria

- [ ] `SessionListItem.tsx` 생성됨
- [ ] 점3개 버튼: hover 시 표시, 클릭 시 메뉴 열림
- [ ] 우클릭(`onContextMenu`): 같은 메뉴 열림
- [ ] 더블클릭: 인플레이스 편집 (Enter/blur 저장, Escape 취소)
- [ ] 메뉴 항목: ✏️ 이름변경 / 🔗 공유 / 🗑️ 대화삭제 (삭제는 text-destructive)
- [ ] 공유 성공 시: 토스트에 URL + 만료일 + 복사 버튼
- [ ] 삭제 후 활성 세션이면 `/`로 이동
- [ ] `cd frontend && npx tsc --noEmit` 오류 없음

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/components/layout/SessionListItem.tsx` | Created | ? |

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
