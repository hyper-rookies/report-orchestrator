# Task BK-00: 보관함 태스크 인프라 구축 (Bookmarks Task Setup)

## 목적

코드를 작성하지 않는다. BK-01~BK-05 태스크의 구현 프롬프트와 리뷰 템플릿을 `docs/tasks/` 폴더에 생성하고, `docs/tasks/status.json`에 BK 태스크들을 추가한다.

---

## 배경 (최소 컨텍스트)

- **설계 문서:** `docs/plans/2026-03-11-bookmarks-design.md` 를 반드시 읽고 시작할 것
- **구현 계획:** `docs/superpowers/plans/2026-03-11-bookmarks.md` 에 상세 구현 흐름이 있다
- **프로젝트:** `report-orchestrator` 의 Next.js 16 프론트엔드 (`frontend/`)
- **목표:** 채팅 응답을 S3에 저장하는 개인 보관함 기능 추가
- **전제 조건:** 없음

---

## 작업 내용

아래 파일들을 생성하라.

### 생성할 파일 목록

```text
docs/tasks/
├── status.json              ← BK-01~05 항목 추가 (기존 항목 유지)
├── BK-01/
│   ├── PROMPT.md
│   └── REPORT.md
├── BK-02/
│   ├── PROMPT.md
│   └── REPORT.md
├── BK-03/
│   ├── PROMPT.md
│   └── REPORT.md
├── BK-04/
│   ├── PROMPT.md
│   └── REPORT.md
└── BK-05/
    ├── PROMPT.md
    └── REPORT.md
```

---

## 파일 내용

### 1. `docs/tasks/status.json` 업데이트

기존 항목은 그대로 두고 BK-* 항목을 추가한다. `tasks` 객체 마지막에 아래 블록을 넣는다:

```json
"BK-01": { "status": "pending", "title": "bookmark types + S3 persistence layer", "completedAt": null },
"BK-02": { "status": "pending", "title": "API routes: GET/POST /api/bookmarks + GET/DELETE /api/bookmarks/[id]", "completedAt": null },
"BK-03": { "status": "pending", "title": "BookmarkButton in AssistantMessage + bookmarkClient.ts", "completedAt": null },
"BK-04": { "status": "pending", "title": "/bookmarks listing page + BookmarkCard + Sidebar nav", "completedAt": null },
"BK-05": { "status": "pending", "title": "/bookmarks/[id] detail page", "completedAt": null }
```

---

### 2. `docs/tasks/BK-01/PROMPT.md`

````markdown
# BK-01: bookmark types + S3 persistence layer

## 목적

`frontend/src/types/bookmark.ts` 와 `frontend/src/lib/bookmarkS3.ts` 를 새로 생성한다. 기존 파일은 수정하지 않는다.

---

## 배경

- **설계 문서:** `docs/plans/2026-03-11-bookmarks-design.md` 의 1~2장을 읽고 시작할 것
- **참조 구현:** `frontend/src/lib/sessionS3.ts` 와 동일한 패턴을 따른다
- `bookmarkS3.ts` 는 기존 `sessionS3.ts` 의 `s3GetJson`, `s3PutJson`, `s3Delete`, `hasSessionBucket` 를 그대로 재사용한다
- 테스트는 `node --experimental-strip-types` 로 실행한다

---

## 생성할 파일

| 파일 | 액션 |
|------|------|
| `frontend/src/types/bookmark.ts` | 신규 생성 |
| `frontend/src/lib/bookmarkS3.ts` | 신규 생성 |
| `frontend/src/lib/bookmarkS3.test.ts` | 신규 생성 |

---

## 구현 코드

### `frontend/src/types/bookmark.ts`

```typescript
import type { SseFrame } from "@/hooks/useSse";

export interface BookmarkMeta {
  bookmarkId: string;
  title: string;          // first 60 chars of prompt
  prompt: string;
  previewType: "chart" | "table" | "text";
  chartType?: string;     // "pie" | "bar" | "line" | "stackedBar" etc.
  createdAt: string;      // ISO 8601
}

export interface BookmarkItem extends BookmarkMeta {
  frames: SseFrame[];
}
```

### `frontend/src/lib/bookmarkS3.ts`

```typescript
import { hasSessionBucket, s3Delete, s3GetJson, s3PutJson } from "@/lib/sessionS3";
import type { BookmarkItem, BookmarkMeta } from "@/types/bookmark";

export { hasSessionBucket };

export const bookmarkIndexKey = (sub: string) => `bookmarks/${sub}/index.json`;
export const bookmarkItemKey = (sub: string, id: string) => `bookmarks/${sub}/${id}.json`;

export async function listBookmarks(sub: string): Promise<BookmarkMeta[]> {
  const index = await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub));
  return (index ?? []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function saveBookmark(sub: string, item: BookmarkItem): Promise<void> {
  await s3PutJson(bookmarkItemKey(sub, item.bookmarkId), item);
  const index = (await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub))) ?? [];
  const meta: BookmarkMeta = {
    bookmarkId: item.bookmarkId,
    title: item.title,
    prompt: item.prompt,
    previewType: item.previewType,
    chartType: item.chartType,
    createdAt: item.createdAt,
  };
  await s3PutJson(bookmarkIndexKey(sub), [
    ...index.filter((b) => b.bookmarkId !== item.bookmarkId),
    meta,
  ]);
}

export async function getBookmarkItem(sub: string, id: string): Promise<BookmarkItem | null> {
  return s3GetJson<BookmarkItem>(bookmarkItemKey(sub, id));
}

export async function deleteBookmark(sub: string, id: string): Promise<void> {
  await s3Delete(bookmarkItemKey(sub, id));
  const index = (await s3GetJson<BookmarkMeta[]>(bookmarkIndexKey(sub))) ?? [];
  await s3PutJson(
    bookmarkIndexKey(sub),
    index.filter((b) => b.bookmarkId !== id)
  );
}
```

### `frontend/src/lib/bookmarkS3.test.ts`

```typescript
import assert from "node:assert/strict";
import { bookmarkIndexKey, bookmarkItemKey } from "./bookmarkS3.js";

assert.equal(bookmarkIndexKey("user-1"), "bookmarks/user-1/index.json");
assert.equal(bookmarkItemKey("user-1", "bk-abc"), "bookmarks/user-1/bk-abc.json");

console.log("bookmarkS3 key tests passed");
```

---

## 검증

```bash
cd frontend
node --experimental-strip-types src/lib/bookmarkS3.test.ts
# 출력: bookmarkS3 key tests passed

npx tsc --noEmit
# 에러 없음
```

---

## 수락 기준

- [ ] `frontend/src/types/bookmark.ts` 생성됨
- [ ] `frontend/src/lib/bookmarkS3.ts` 생성됨
- [ ] `frontend/src/lib/bookmarkS3.test.ts` 생성됨
- [ ] `node --experimental-strip-types src/lib/bookmarkS3.test.ts` exit code 0
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] 기존 파일 수정 없음
````

---

### 3. `docs/tasks/BK-01/REPORT.md`

```markdown
# BK-01 Task Report

**Status:** TODO: DONE / BLOCKED

**Completed At:** <!-- ISO 8601 timestamp -->

---

## Acceptance Criteria

- [ ] `frontend/src/types/bookmark.ts` created
- [ ] `frontend/src/lib/bookmarkS3.ts` created
- [ ] `frontend/src/lib/bookmarkS3.test.ts` created
- [ ] `node --experimental-strip-types src/lib/bookmarkS3.test.ts` passes (exit code 0)
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] No existing files modified

---

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `frontend/src/types/bookmark.ts` | Created | |
| `frontend/src/lib/bookmarkS3.ts` | Created | |
| `frontend/src/lib/bookmarkS3.test.ts` | Created | |

---

## Test Output

```bash
$ cd frontend
$ node --experimental-strip-types src/lib/bookmarkS3.test.ts
# paste output here
```

---

## Deviations from Plan

None.

---

## Questions for Reviewer

None.
```

---

### 4. `docs/tasks/BK-02/PROMPT.md`

문서는 별도 파일을 생성한다.

### 5. `docs/tasks/BK-02/REPORT.md`

문서는 별도 파일을 생성한다.

### 6. `docs/tasks/BK-03/PROMPT.md`

문서는 별도 파일을 생성한다.

### 7. `docs/tasks/BK-03/REPORT.md`

문서는 별도 파일을 생성한다.

### 8. `docs/tasks/BK-04/PROMPT.md`

문서는 별도 파일을 생성한다.

### 9. `docs/tasks/BK-04/REPORT.md`

문서는 별도 파일을 생성한다.

### 10. `docs/tasks/BK-05/PROMPT.md`

문서는 별도 파일을 생성한다.

### 11. `docs/tasks/BK-05/REPORT.md`

문서는 별도 파일을 생성한다.

---

## 검증

```bash
ls docs/tasks/BK-01/
ls docs/tasks/BK-02/
ls docs/tasks/BK-03/
ls docs/tasks/BK-04/
ls docs/tasks/BK-05/
cat docs/tasks/status.json | python -m json.tool
```

모두 존재하면 완료.

## 완료 후 할 일

```bash
git add docs/tasks/
git commit -m "chore(tasks): add BK task management infrastructure (BK-00)"
```
