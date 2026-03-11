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
