# BK-02: API routes - GET/POST /api/bookmarks + GET/DELETE /api/bookmarks/[id]

## 목적

Next.js API 라우트 2개를 신규 생성한다.
- `frontend/src/app/api/bookmarks/route.ts` - GET(목록), POST(생성)
- `frontend/src/app/api/bookmarks/[id]/route.ts` - GET(상세), DELETE(삭제)

---

## 전제 조건

- **BK-01 완료 필수.** `bookmarkS3.ts` 와 `types/bookmark.ts` 가 존재해야 한다.

---

## 배경

- **설계 문서:** `docs/plans/2026-03-11-bookmarks-design.md` 의 3장을 읽고 시작할 것
- **참조 구현:** `frontend/src/app/api/sessions/route.ts` 와 동일한 패턴을 따른다
- 인증은 `frontend/src/lib/sessionAuth.ts` 의 `getUserSub(req)` 를 사용한다
- `nanoid` 는 현재 `frontend/package.json` dependencies 에 이미 포함되어 있다

---

## 생성할 파일

| 파일 | 액션 |
|------|------|
| `frontend/src/app/api/bookmarks/route.ts` | 신규 생성 |
| `frontend/src/app/api/bookmarks/[id]/route.ts` | 신규 생성 |

---

## 구현 코드

### `frontend/src/app/api/bookmarks/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getUserSub } from "@/lib/sessionAuth";
import { hasSessionBucket, listBookmarks, saveBookmark } from "@/lib/bookmarkS3";
import type { BookmarkItem } from "@/types/bookmark";
import type { SseFrame } from "@/hooks/useSse";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) return NextResponse.json([]);

  const list = await listBookmarks(sub);
  return NextResponse.json(list);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, frames } = body as { prompt?: unknown; frames?: unknown };
  if (typeof prompt !== "string" || !Array.isArray(frames)) {
    return NextResponse.json({ error: "prompt and frames are required" }, { status: 400 });
  }

  const chartFrame = (frames as SseFrame[]).findLast((f) => f.type === "chart");
  const tableFrame = (frames as SseFrame[]).findLast((f) => f.type === "table");
  const rawSpec = chartFrame?.data.spec as Record<string, unknown> | undefined;

  const previewType: BookmarkItem["previewType"] = chartFrame
    ? "chart"
    : tableFrame
      ? "table"
      : "text";
  const chartType = typeof rawSpec?.type === "string" ? rawSpec.type : undefined;

  const item: BookmarkItem = {
    bookmarkId: nanoid(),
    title: prompt.slice(0, 60),
    prompt,
    previewType,
    chartType,
    createdAt: new Date().toISOString(),
    frames: frames as SseFrame[],
  };

  await saveBookmark(sub, item);
  return NextResponse.json({ bookmarkId: item.bookmarkId }, { status: 201 });
}
```

### `frontend/src/app/api/bookmarks/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getUserSub } from "@/lib/sessionAuth";
import { deleteBookmark, getBookmarkItem, hasSessionBucket } from "@/lib/bookmarkS3";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }

  const { id } = await params;
  const item = await getBookmarkItem(sub, id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const sub = getUserSub(req);
  if (!sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSessionBucket()) {
    return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
  }

  const { id } = await params;
  await deleteBookmark(sub, id);
  return NextResponse.json({ deleted: id });
}
```

---

## 검증

```bash
cd frontend && npx tsc --noEmit
# 에러 없음
```

---

## 수락 기준

- [ ] `frontend/src/app/api/bookmarks/route.ts` 생성됨 (GET + POST)
- [ ] `frontend/src/app/api/bookmarks/[id]/route.ts` 생성됨 (GET + DELETE)
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] BK-01 파일 수정 없음
