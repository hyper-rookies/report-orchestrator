# BK-03 Task Report

**Status:** DONE

**Completed At:** 2026-03-11T09:51:26.8853261+09:00

---

## Acceptance Criteria

- [x] `frontend/src/lib/bookmarkClient.ts` created
- [x] `frontend/src/components/bookmark/BookmarkButton.tsx` created
- [x] `AssistantMessage.tsx` updated with `prompt` prop and BookmarkButton
- [x] `MessageList.tsx` updated with `(msg, idx)` and `prompt` prop passed
- [x] `npx tsc --noEmit` passes with no errors

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/lib/bookmarkClient.ts` | Created | Authenticated bookmark fetch helpers |
| `frontend/src/components/bookmark/BookmarkButton.tsx` | Created | Save action with loading/saved states |
| `frontend/src/components/chat/AssistantMessage.tsx` | Modified | `prompt` prop + conditional bookmark action |
| `frontend/src/components/chat/MessageList.tsx` | Modified | Pass previous user message as assistant prompt |
| `docs/tasks/BK-03/REPORT.md` | Updated | Completion report |
| `docs/tasks/status.json` | Updated | `BK-03` marked done |

---

## Notes

- The bookmark action only renders when `!streaming && finalFrame && prompt`, so in-progress SSE output remains unchanged.
- Success is shown by switching the icon to `BookmarkCheck`; no new toast system was introduced in this task.
- Streaming assistant output still omits `prompt`, matching the task prompt and avoiding premature save actions.
- Post-review hardening: bookmark save failures now surface inline error text instead of failing silently.
- Post-review hardening: `MessageList` now looks up the nearest preceding user message instead of assuming `messages[idx - 1]` is always the prompt source.

---

## Review Follow-up

- Resolved a silent-failure UX gap in `BookmarkButton` by surfacing server-side save errors inline while keeping retry behavior.
- Hardened prompt lookup in `MessageList` so bookmark buttons still receive the correct user prompt even if assistant messages are no longer strictly adjacent to the last user message.
- Updated `bookmarkClient.ts` to preserve server error messages on failed save/delete requests, which makes downstream UI feedback actionable.

---

## Test Output

```bash
$ cd frontend
$ cmd /c npx tsc --noEmit
# exit code 0
$ cmd /c npm run lint
# exit code 0
$ cmd /c npm run build
# exit code 0
```

---

## Deviations from Plan

- The design note mentioned a success toast, but the current frontend has no toast infrastructure. This task keeps the UX lightweight by using icon state only.
- Review follow-up: instead of silent retry-only failure handling, the button now renders the server error message inline while still remaining retryable.

---

## Questions for Reviewer

None.
